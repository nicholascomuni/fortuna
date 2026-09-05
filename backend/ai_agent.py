"""
AI chat assistant — natural-language read/write access to the user's
financial data via OpenAI function calling.

Design: the model can call "read" tools freely (they execute immediately,
server-side, and feed results back so it can reason with real data). Any
"write" tool call (create/update/delete) is NEVER executed inline — it is
always turned into a pending action attached to the assistant's message and
only applied once the user explicitly confirms via /messages/<id>/confirm.
This mirrors the manual UI's validation exactly by reusing routes.py's
extracted helper functions, so there is a single source of truth for what
counts as a valid transaction/credit purchase.
"""

import json
import os
import uuid
from datetime import date, datetime

from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request, Response, stream_with_context
from flask_jwt_extended import jwt_required

from extensions import db
from models import Plan, Account, Transaction, CreditCard, CreditPurchase, AiMessage, AiConversation
import routes as api_routes

ai_bp = Blueprint("ai", __name__)

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
# Explicit rather than relying on the API's own default (also 1.0, so this
# matches out of the box) — 0.7 keeps tool-call arguments reliable while
# still reading natural/conversational, closer to ChatGPT's product feel
# than a fully deterministic low temperature would.
TEMPERATURE = float(os.environ.get("OPENAI_TEMPERATURE", "0.7"))
MAX_HISTORY = 24
MAX_TOOL_ITERATIONS = 6


def _get_client():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    from openai import OpenAI
    return OpenAI(api_key=api_key)


# ── Tool schemas (OpenAI function-calling format) ───────────────────────────

READ_TOOL_NAMES = {
    "list_transactions", "get_accounts", "get_cards", "get_categories",
    "get_projection", "get_reports", "get_credit_purchases", "get_plans",
}
WRITE_TOOL_NAMES = {
    "create_transaction", "update_transaction", "delete_transaction",
    "create_credit_purchase", "update_credit_purchase", "delete_credit_purchase",
    "create_card", "update_card", "delete_card",
    "create_account", "update_account", "delete_account",
    "parcelar_fatura",
}

_DATE = {"type": "string", "description": "Data no formato YYYY-MM-DD"}

_TRANSACTION_PROPS = {
    "description": {"type": "string", "description": "Descrição do lançamento"},
    "amount": {"type": "number", "description": "Valor em reais, maior que zero"},
    "kind": {"type": "string", "enum": ["receita", "despesa"]},
    "type": {"type": "string", "enum": ["pontual", "recorrente"]},
    "date": _DATE,
    "category": {"type": "string", "description": "Categoria (opcional)"},
    "payment_method": {"type": "string", "enum": ["a_vista", "debito"], "description": "Forma de pagamento (não usar para cartão de crédito — use create_credit_purchase)"},
    "account_id": {"type": "integer", "description": "ID da conta bancária de origem/destino — obrigatório"},
    "interest_rate": {"type": "number", "description": "Taxa de juros por período, em % (opcional)"},
    "interest_period": {"type": "string", "enum": ["mensal", "anual"]},
    "interest_count": {"type": "integer", "description": "Número de períodos de juros"},
    "frequency": {"type": "string", "enum": ["semanal", "mensal", "anual"], "description": "Obrigatório se type=recorrente"},
    "recurrence_end_type": {"type": "string", "enum": ["por_data", "por_ocorrencias"], "description": "Obrigatório se type=recorrente"},
    "recurrence_end_date": _DATE,
    "recurrence_count": {"type": "integer"},
}

_CARD_PROPS = {
    "name": {"type": "string", "description": "Nome do cartão"},
    "bank": {"type": "string", "description": "Banco emissor (opcional)"},
    "due_day": {"type": "integer", "description": "Dia de vencimento da fatura, de 1 a 31"},
    "credit_limit": {"type": "number", "description": "Limite de crédito (opcional)"},
    "color": {"type": "string", "description": "Cor do cartão em hexadecimal, ex: #6366f1 (opcional)"},
    "account_id": {"type": "integer", "description": "ID da conta bancária usada para pagar a fatura (opcional)"},
}

_ACCOUNT_PROPS = {
    "name": {"type": "string", "description": "Nome da conta bancária"},
    "bank": {"type": "string", "description": "Banco (opcional)"},
    "initial_balance": {"type": "number", "description": "Saldo inicial da conta (opcional, padrão 0)"},
}

_PURCHASE_PROPS = {
    "description": {"type": "string"},
    "total_amount": {"type": "number", "description": "Valor total da compra, maior que zero"},
    "card_id": {"type": "integer", "description": "ID do cartão de crédito"},
    "purchase_date": _DATE,
    "category": {"type": "string"},
    "installments": {"type": "integer", "description": "Número de parcelas (só para type=pontual)"},
    "type": {"type": "string", "enum": ["pontual", "recorrente"]},
    "frequency": {"type": "string", "enum": ["semanal", "mensal", "anual"], "description": "Obrigatório se type=recorrente"},
    "recurrence_end_type": {"type": "string", "enum": ["por_data", "por_ocorrencias"], "description": "Obrigatório se type=recorrente"},
    "recurrence_end_date": _DATE,
    "recurrence_count": {"type": "integer"},
}

TOOLS = [
    {"type": "function", "function": {
        "name": "list_transactions",
        "description": "Lista lançamentos (receitas/despesas) já cadastrados no plano ativo, com filtros opcionais.",
        "parameters": {"type": "object", "properties": {
            "start_date": _DATE, "end_date": _DATE,
            "kind": {"type": "string", "enum": ["receita", "despesa"]},
            "category": {"type": "string"},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_accounts",
        "description": "Lista as contas bancárias do plano ativo, com id, nome, banco e saldo inicial.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_cards",
        "description": "Lista os cartões de crédito do plano ativo, com id, nome, limite e fatura atual.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_categories",
        "description": "Lista as categorias já usadas em lançamentos do plano ativo.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_plans",
        "description": (
            "Lista todos os planos de contas do usuário (cada plano é uma dashboard independente, com suas "
            "próprias contas/cartões/lançamentos) e qual deles está ativo agora. Use para responder perguntas "
            "sobre planos de contas ou para orientar o usuário — você NÃO tem uma ferramenta para criar ou "
            "trocar de plano; explique que isso é feito pelo menu 'Trocar plano de contas' no topo da tela."
        ),
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_projection",
        "description": "Retorna a projeção de saldo (linha do tempo, resumo de receitas/despesas, saldo mínimo) para um período.",
        "parameters": {"type": "object", "properties": {
            "start_date": _DATE, "end_date": _DATE,
            "account_id": {"type": "integer", "description": "Filtrar por uma conta específica (opcional)"},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_reports",
        "description": "Retorna relatório financeiro do período: médias mensais, taxa de poupança, gastos por categoria, maiores gastos/receitas, formas de pagamento.",
        "parameters": {"type": "object", "properties": {"start_date": _DATE, "end_date": _DATE}},
    }},
    {"type": "function", "function": {
        "name": "get_credit_purchases",
        "description": "Lista compras feitas no cartão de crédito.",
        "parameters": {"type": "object", "properties": {"card_id": {"type": "integer"}}},
    }},
    {"type": "function", "function": {
        "name": "create_transaction",
        "description": "Propõe a criação de um novo lançamento (receita ou despesa). Nunca executa direto — sempre gera uma confirmação para o usuário.",
        "parameters": {"type": "object", "properties": _TRANSACTION_PROPS,
                        "required": ["description", "amount", "kind", "type", "date", "account_id"]},
    }},
    {"type": "function", "function": {
        "name": "update_transaction",
        "description": "Propõe a edição de um lançamento existente (todos os campos devem ser enviados, como uma substituição completa). Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"transaction_id": {"type": "integer"}, **_TRANSACTION_PROPS},
                        "required": ["transaction_id", "description", "amount", "kind", "type", "date", "account_id"]},
    }},
    {"type": "function", "function": {
        "name": "delete_transaction",
        "description": "Propõe a exclusão de um lançamento. Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"transaction_id": {"type": "integer"}}, "required": ["transaction_id"]},
    }},
    {"type": "function", "function": {
        "name": "create_credit_purchase",
        "description": "Propõe uma nova compra no cartão de crédito. Nunca executa direto.",
        "parameters": {"type": "object", "properties": _PURCHASE_PROPS,
                        "required": ["description", "total_amount", "card_id", "purchase_date"]},
    }},
    {"type": "function", "function": {
        "name": "update_credit_purchase",
        "description": "Propõe a edição de uma compra no cartão existente (substituição completa dos campos). Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"purchase_id": {"type": "integer"}, **_PURCHASE_PROPS},
                        "required": ["purchase_id", "description", "total_amount", "card_id", "purchase_date"]},
    }},
    {"type": "function", "function": {
        "name": "delete_credit_purchase",
        "description": "Propõe a exclusão de uma compra no cartão. Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"purchase_id": {"type": "integer"}}, "required": ["purchase_id"]},
    }},
    {"type": "function", "function": {
        "name": "create_card",
        "description": "Propõe a criação de um novo cartão de crédito. Nunca executa direto.",
        "parameters": {"type": "object", "properties": _CARD_PROPS, "required": ["name", "due_day"]},
    }},
    {"type": "function", "function": {
        "name": "update_card",
        "description": "Propõe a edição de um cartão existente (substituição completa dos campos). Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"card_id": {"type": "integer"}, **_CARD_PROPS},
                        "required": ["card_id", "name", "due_day"]},
    }},
    {"type": "function", "function": {
        "name": "delete_card",
        "description": "Propõe a exclusão de um cartão de crédito. Falha se houver compras vinculadas a ele. Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"card_id": {"type": "integer"}}, "required": ["card_id"]},
    }},
    {"type": "function", "function": {
        "name": "create_account",
        "description": "Propõe a criação de uma nova conta bancária no plano ativo. Nunca executa direto.",
        "parameters": {"type": "object", "properties": _ACCOUNT_PROPS, "required": ["name"]},
    }},
    {"type": "function", "function": {
        "name": "update_account",
        "description": "Propõe a edição de uma conta bancária existente (substituição completa dos campos). Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"account_id": {"type": "integer"}, **_ACCOUNT_PROPS},
                        "required": ["account_id", "name"]},
    }},
    {"type": "function", "function": {
        "name": "delete_account",
        "description": "Propõe a exclusão de uma conta bancária. Falha se houver movimentações ou cartões vinculados a ela. Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"account_id": {"type": "integer"}}, "required": ["account_id"]},
    }},
    {"type": "function", "function": {
        "name": "parcelar_fatura",
        "description": (
            "Propõe financiar uma fatura de cartão de crédito (uma transação com origem 'credit_invoice'), "
            "dividindo-a em N parcelas crescentes com juros compostos, em vez do pagamento integral automático "
            "no vencimento. Falha se a fatura já estiver parcelada ou se o lançamento não for uma fatura. "
            "Nunca executa direto."
        ),
        "parameters": {"type": "object", "properties": {
            "transaction_id": {"type": "integer", "description": "ID da transação de fatura (source=credit_invoice)"},
            "interest_count": {"type": "integer", "description": "Número total de parcelas, de 2 a 60"},
            "interest_rate": {"type": "number", "description": "Taxa de juros por período, em %, maior que zero"},
            "interest_period": {"type": "string", "enum": ["mensal", "anual"]},
        }, "required": ["transaction_id", "interest_count", "interest_rate", "interest_period"]},
    }},
]


# ── Read tool execution (runs immediately) ──────────────────────────────────

def _tool_list_transactions(uid, pid, args):
    q = Transaction.query.filter_by(user_id=uid, plan_id=pid)
    if args.get("kind"):
        q = q.filter_by(kind=args["kind"])
    if args.get("category"):
        q = q.filter_by(category=args["category"])
    if args.get("start_date"):
        q = q.filter(Transaction.date >= api_routes._parse_date(args["start_date"]))
    if args.get("end_date"):
        q = q.filter(Transaction.date <= api_routes._parse_date(args["end_date"]))
    rows = q.order_by(Transaction.date).limit(200).all()
    return [t.to_dict() for t in rows]


def _tool_get_accounts(uid, pid, args):
    return [a.to_dict() for a in Account.query.filter_by(plan_id=pid).order_by(Account.created_at).all()]


def _tool_get_cards(uid, pid, args):
    return [c.to_dict() for c in CreditCard.query.filter_by(user_id=uid, plan_id=pid).order_by(CreditCard.created_at).all()]


def _tool_get_categories(uid, pid, args):
    rows = (
        db.session.query(Transaction.category)
        .filter(Transaction.user_id == uid, Transaction.plan_id == pid, Transaction.category.isnot(None))
        .distinct().all()
    )
    return sorted({r[0] for r in rows if r[0]})


def _tool_get_projection(uid, pid, args):
    today = date.today()
    range_start = api_routes._parse_date(args["start_date"]) if args.get("start_date") else today
    range_end = api_routes._parse_date(args["end_date"]) if args.get("end_date") else (today + relativedelta(months=6))
    result = dict(api_routes._compute_projection_data(uid, pid, range_start, range_end, args.get("account_id")))
    result["rows"] = result["rows"][:120]
    return result


def _tool_get_reports(uid, pid, args):
    today = date.today()
    range_start = api_routes._parse_date(args["start_date"]) if args.get("start_date") else today.replace(month=1, day=1)
    range_end = api_routes._parse_date(args["end_date"]) if args.get("end_date") else today
    return api_routes._compute_reports_data(uid, pid, range_start, range_end)


def _tool_get_credit_purchases(uid, pid, args):
    q = CreditPurchase.query.filter_by(user_id=uid, plan_id=pid)
    if args.get("card_id"):
        q = q.filter_by(card_id=args["card_id"])
    return [p.to_dict() for p in q.order_by(CreditPurchase.purchase_date).limit(200).all()]


def _tool_get_plans(uid, pid, args):
    plans = Plan.query.filter_by(user_id=uid).order_by(Plan.created_at).all()
    return [{**p.to_dict(), "is_active": p.id == pid} for p in plans]


READ_EXECUTORS = {
    "list_transactions": _tool_list_transactions,
    "get_accounts": _tool_get_accounts,
    "get_cards": _tool_get_cards,
    "get_categories": _tool_get_categories,
    "get_projection": _tool_get_projection,
    "get_reports": _tool_get_reports,
    "get_credit_purchases": _tool_get_credit_purchases,
    "get_plans": _tool_get_plans,
}


# ── Write tool execution (only ever called after user confirmation) ────────

def _execute_write_tool(uid: int, pid: int, tool_name: str, args: dict):
    """
    Applies *tool_name* with *args* inside the current session — not
    committed. Returns (resource_type, obj) for anything that leaves a
    resource on screen worth showing (create/update/parcelar_fatura), so the
    caller can attach a clickable resource widget to the pending action once
    committed; returns None for deletes, which leave nothing to show.
    """
    data = dict(args)
    if tool_name == "create_transaction":
        return "transaction", api_routes._build_transaction_from_data(uid, pid, data)
    elif tool_name == "update_transaction":
        tx = Transaction.query.filter_by(id=args.get("transaction_id"), user_id=uid, plan_id=pid).first()
        if not tx:
            raise ValueError(["Lançamento não encontrado."])
        if tx.source == "credit_invoice":
            raise ValueError(["Esta fatura é gerada automaticamente e não pode ser editada diretamente."])
        api_routes._apply_transaction_data(tx, pid, data)
        return "transaction", tx
    elif tool_name == "delete_transaction":
        tx = Transaction.query.filter_by(id=args.get("transaction_id"), user_id=uid, plan_id=pid).first()
        if not tx:
            raise ValueError(["Lançamento não encontrado."])
        if tx.source == "credit_invoice":
            raise ValueError(["Esta fatura é gerada automaticamente e não pode ser excluída diretamente."])
        api_routes._delete_transaction_family(tx, uid, pid)
        return None
    elif tool_name == "create_credit_purchase":
        return "credit_purchase", api_routes._build_credit_purchase_from_data(uid, pid, data)
    elif tool_name == "update_credit_purchase":
        purchase = CreditPurchase.query.filter_by(id=args.get("purchase_id"), user_id=uid, plan_id=pid).first()
        if not purchase:
            raise ValueError(["Compra não encontrada."])
        api_routes._apply_credit_purchase_data(uid, pid, purchase, data)
        return "credit_purchase", purchase
    elif tool_name == "delete_credit_purchase":
        purchase = CreditPurchase.query.filter_by(id=args.get("purchase_id"), user_id=uid, plan_id=pid).first()
        if not purchase:
            raise ValueError(["Compra não encontrada."])
        api_routes._delete_credit_purchase_obj(uid, pid, purchase)
        return None
    elif tool_name == "create_card":
        return "card", api_routes._build_card_from_data(uid, pid, data)
    elif tool_name == "update_card":
        card = CreditCard.query.filter_by(id=args.get("card_id"), user_id=uid, plan_id=pid).first()
        if not card:
            raise ValueError(["Cartão não encontrado."])
        api_routes._apply_card_data(card, pid, data)
        return "card", card
    elif tool_name == "delete_card":
        card = CreditCard.query.filter_by(id=args.get("card_id"), user_id=uid, plan_id=pid).first()
        if not card:
            raise ValueError(["Cartão não encontrado."])
        api_routes._delete_card_obj(card)
        return None
    elif tool_name == "create_account":
        return "account", api_routes._build_account_from_data(pid, data)
    elif tool_name == "update_account":
        account = Account.query.filter_by(id=args.get("account_id"), plan_id=pid).first()
        if not account:
            raise ValueError(["Conta não encontrada."])
        api_routes._apply_account_data(account, data)
        return "account", account
    elif tool_name == "delete_account":
        account = Account.query.filter_by(id=args.get("account_id"), plan_id=pid).first()
        if not account:
            raise ValueError(["Conta não encontrada."])
        api_routes._delete_account_obj(account)
        return None
    elif tool_name == "parcelar_fatura":
        tx = Transaction.query.filter_by(id=args.get("transaction_id"), user_id=uid, plan_id=pid).first()
        if not tx:
            raise ValueError(["Lançamento não encontrado."])
        api_routes._finance_invoice(tx, data)
        return "transaction", tx
    else:
        raise ValueError([f"Ferramenta desconhecida: {tool_name}"])


# ── Human-readable descriptions for pending actions ─────────────────────────

def _fmt_brl(v) -> str:
    try:
        return f"R$ {float(v):,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    except (TypeError, ValueError):
        return str(v)


def _describe_action(tool_name: str, args: dict) -> str:
    if tool_name == "create_transaction":
        kind = "receita" if args.get("kind") == "receita" else "despesa"
        return f"Adicionar {kind} \"{args.get('description', '')}\" de {_fmt_brl(args.get('amount', 0))} em {args.get('date', '')}"
    if tool_name == "update_transaction":
        return f"Editar lançamento #{args.get('transaction_id')} para \"{args.get('description', '')}\" ({_fmt_brl(args.get('amount', 0))})"
    if tool_name == "delete_transaction":
        return f"Excluir lançamento #{args.get('transaction_id')}"
    if tool_name == "create_credit_purchase":
        return f"Adicionar compra no cartão \"{args.get('description', '')}\" de {_fmt_brl(args.get('total_amount', 0))}"
    if tool_name == "update_credit_purchase":
        return f"Editar compra no cartão #{args.get('purchase_id')} para \"{args.get('description', '')}\" ({_fmt_brl(args.get('total_amount', 0))})"
    if tool_name == "delete_credit_purchase":
        return f"Excluir compra no cartão #{args.get('purchase_id')}"
    if tool_name == "create_card":
        return f"Adicionar cartão \"{args.get('name', '')}\" (vencimento dia {args.get('due_day', '')})"
    if tool_name == "update_card":
        return f"Editar cartão #{args.get('card_id')} para \"{args.get('name', '')}\""
    if tool_name == "delete_card":
        return f"Excluir cartão #{args.get('card_id')}"
    if tool_name == "create_account":
        return f"Adicionar conta \"{args.get('name', '')}\" (saldo inicial {_fmt_brl(args.get('initial_balance', 0))})"
    if tool_name == "update_account":
        return f"Editar conta #{args.get('account_id')} para \"{args.get('name', '')}\""
    if tool_name == "delete_account":
        return f"Excluir conta #{args.get('account_id')}"
    if tool_name == "parcelar_fatura":
        return f"Parcelar fatura #{args.get('transaction_id')} em {args.get('interest_count', '')}x com juros de {args.get('interest_rate', '')}% {args.get('interest_period', '')}"
    return f"{tool_name}({args})"


# ── System prompt ────────────────────────────────────────────────────────────

def _build_system_prompt(uid: int, pid: int) -> str:
    plan = Plan.query.get(pid)
    all_plans = Plan.query.filter_by(user_id=uid).order_by(Plan.created_at).all()
    accounts = Account.query.filter_by(plan_id=pid).order_by(Account.created_at).all()
    cards = CreditCard.query.filter_by(user_id=uid, plan_id=pid).order_by(CreditCard.created_at).all()
    categories = _tool_get_categories(uid, pid, {})

    plans_txt = "\n".join(
        f"- id={p.id} nome=\"{p.name}\"{' (ATIVO)' if p.id == pid else ''}"
        for p in all_plans
    ) or "(nenhum outro plano)"
    accounts_txt = "\n".join(
        f"- id={a.id} nome=\"{a.name}\" banco={a.bank or '-'} saldo_inicial={float(a.initial_balance)}"
        for a in accounts
    ) or "(nenhuma conta cadastrada ainda — crie uma com create_account antes de propor qualquer lançamento)"
    cards_txt = "\n".join(
        f"- id={c.id} nome=\"{c.name}\" banco={c.bank or '-'} vencimento=dia {c.due_day} "
        f"limite={float(c.credit_limit) if c.credit_limit else '-'} conta_pagamento={c.account_id or '-'}"
        for c in cards
    ) or "(nenhum cartão cadastrado ainda)"
    categories_txt = ", ".join(categories) or "(nenhuma ainda)"

    return f"""Você é o assistente financeiro do app "Fortuna" — um AGENTE que opera a plataforma em nome do usuário, não um chatbot que só explica o que ele poderia fazer sozinho. Sempre que o usuário descrever uma situação financeira real, sua função é ir até o fim e representá-la de verdade nas tabelas e dashboards do app, usando as ferramentas certas — não apenas comentar sobre ela em texto. Responda sempre em português do Brasil, com um tom natural, amigável e conversacional — como o ChatGPT ou o Claude respondem: explique seu raciocínio quando fizer análises, dê contexto útil junto dos números (não apenas o número seco), ofereça observações ou sugestões relevantes quando fizer sentido, e sinta-se à vontade para responder com alguns parágrafos quando o assunto pedir. Não precisa ser telegráfico — só evite encher linguiça sem necessidade. Valores são em Reais (BRL).

Data de hoje: {date.today().isoformat()}
Plano ativo: "{plan.name if plan else '?'}" (id={pid})

Todos os planos de contas do usuário (cada um é uma dashboard independente, com suas próprias contas/cartões/lançamentos):
{plans_txt}
Você NÃO tem ferramenta para criar ou trocar de plano — se o usuário quiser um plano novo ou trocar de plano ativo, explique que isso é feito pelo menu "Trocar plano de contas" no topo da tela (trocar de plano recarrega a página, por isso não pode ser feito por aqui no meio da conversa).

Contas bancárias cadastradas no plano ativo:
{accounts_txt}

Cartões de crédito cadastrados no plano ativo:
{cards_txt}

Categorias já usadas em lançamentos: {categories_txt}

## Seu papel

Seu trabalho não é só responder perguntas pontuais — é entender, a partir de TODA a conversa (não só da última mensagem), qual é o cenário financeiro real que o usuário está descrevendo, e traduzir isso fielmente para as tabelas e dashboards do app: o que precisa ser adicionado, o que precisa ser editado e o que precisa ser removido. Preste atenção ao contexto acumulado — se em mensagens anteriores o usuário já descreveu um cenário (uma dívida, um financiamento, um conjunto de gastos de uma viagem, etc.) e a mensagem atual acrescenta ou corrige um detalhe, reavalie o cenário inteiro, não só o último dado isolado.

Se, a partir do que o usuário contou, ficar claro que existem outras receitas ou despesas relevantes que ele não mencionou explicitamente mas que fazem parte do mesmo cenário (ex.: ele descreve um financiamento de carro e menciona o valor da parcela, mas não criou o lançamento recorrente correspondente; ou descreve uma viagem com hospedagem e passagem mas só pediu para lançar uma delas), chame a atenção para isso e proponha adicionar também — sempre deixando claro que é uma sugestão baseada no que foi dito, e nunca inventando valores que não foram informados ou implicados com segurança. Na dúvida sobre um valor ou data, pergunte; não invente para completar o cenário.

### Checklist obrigatório antes de propor um cenário

Quando o pedido não é uma pergunta pontual, mas descreve uma situação financeira para você montar/ajustar (um plano, uma simulação, "organiza minhas finanças assim", etc.), NUNCA simplifique para "só uma receita e uma despesa genéricas". Antes de propor qualquer ação, passe pelo checklist abaixo mentalmente — ele existe porque é fácil esquecer partes de um cenário rico ao traduzi-lo para lançamentos:

1. **Você tem certeza do estado atual?** Se não chamou get_accounts/get_cards/list_transactions/get_projection recentemente nesta conversa, chame agora — nunca presuma que uma conta/cartão existe ou está vazio sem checar.
2. **Tem dívida, financiamento ou parcelamento?** Cuidado: interest_rate significa coisas DIFERENTES em pontual e em recorrente (veja a seção "Juros" abaixo) — escolha com base em como as parcelas realmente se comportam, não só porque o usuário mencionou "juros":
   - Parcela FIXA que já foi informada pronta (a maioria dos financiamentos de carro/imóvel/consignado — a taxa só explica como o valor da parcela foi calculado, mas o valor não muda mês a mês) → recorrente SEM interest_rate, com o valor fixo da parcela.
   - Parcelas CRESCENTES mês a mês (dívida em atraso rendendo juros, parcelamento de uma fatura de cartão) → pontual com interest_rate/interest_period/interest_count (gera as parcelas crescentes automaticamente), ou parcelar_fatura se for uma fatura de cartão já existente.
3. **Tem gasto no cartão de crédito?** → create_credit_purchase (nunca create_transaction). O cartão citado já existe na lista acima? Se não, crie com create_card primeiro (peça vencimento se não foi informado).
4. **Tem conta bancária nova, ou o saldo atual de uma conta mudou?** → create_account para uma conta que ainda não existe; update_account (campo initial_balance) quando o usuário informa quanto tem hoje numa conta existente.
5. **É algo que se repete?** (salário, aluguel, assinatura, mensalidade) → type="recorrente" com frequency e recurrence_end_type/recurrence_end_date/recurrence_count, em vez de um lançamento pontual isolado.
6. **O cenário tem múltiplas partes?** (ex.: salário + aluguel + financiamento do carro + cartão de crédito) → represente CADA parte com a ferramenta certa, todas na mesma resposta se possível (várias ações de escrita podem ser propostas juntas). Um "plano financeiro" completo quase sempre envolve mais de um tipo de lançamento — se você só está prestes a chamar create_transaction repetidamente para tudo, pare e reveja se alguma dessas partes deveria ser um cartão, uma dívida com juros, ou uma recorrência.

### Juros — interest_rate significa coisas diferentes em pontual e em recorrente

- Em uma transação PONTUAL, interest_rate/interest_period/interest_count geram uma família de parcelas CRESCENTES (cada uma maior que a anterior, juros compostos aplicados progressivamente) — é o modelo certo para uma dívida cujo valor da parcela aumenta com o tempo (ex.: parcelar uma fatura de cartão, uma dívida vencida rendendo juros de mora).
- Em uma transação RECORRENTE, interest_rate faz o motor de projeção tratar cada ocorrência como um APORTE FIXO mais um lançamento adicional de juros compostos sobre o saldo ACUMULADO de todos os aportes anteriores (cresce sem parar, mês após mês) — isso simula uma RECEITA que rende (aportes mensais numa poupança/investimento), não uma dívida de parcela fixa. Usar interest_rate numa despesa recorrente para representar um financiamento de parcela fixa está ERRADO e vai inflar a despesa mês a mês de forma irreal.
- Se a parcela de uma dívida é fixa (o valor já foi informado pronto, como a maioria dos financiamentos de carro/imóvel) → recorrente SEM interest_rate, só com o valor fixo.
- Na dúvida sobre qual dos dois comportamentos o usuário quer para uma dívida, pergunte se as parcelas são fixas ou crescem com o tempo, em vez de adivinhar.

Use TODAS as ferramentas de escrita disponíveis para representar o cenário com precisão:
- Gasto recorrente (assinatura, aluguel, salário, mensalidade, parcela fixa de financiamento) → type="recorrente" com frequency e recurrence_end_type/recurrence_end_date/recurrence_count.
- Compra no cartão de crédito, parcelada ou não → create_credit_purchase/update_credit_purchase/delete_credit_purchase (nunca create_transaction).
- Usuário quer financiar/parcelar uma fatura de cartão já existente em vez de pagá-la integral no vencimento → parcelar_fatura (peça o transaction_id da fatura via list_transactions se não souber, e confirme quantas parcelas e a taxa de juros com o usuário antes de propor).
- Usuário menciona um cartão ou conta bancária pelo nome e ele NÃO corresponde a nenhum item da lista acima (mesmo que exista algum outro cartão/conta cadastrado, só que com nome diferente) → crie um novo com create_card/create_account antes de (ou junto com) lançar movimentações nele. Nunca reaproveite silenciosamente um cartão/conta existente só porque é o único que há — se o nome não bate, é um cartão/conta diferente e precisa ser criado. Exemplo: se a lista de cartões só tem id=2 nome="Roxinho" e o usuário fala do cartão "Nubank", NÃO use card_id=2 — chame create_card com name="Nubank" primeiro (peça o dia de vencimento se não foi dito), e só então use o id do cartão recém-criado.
- Cartão ou conta precisam de correção (nome, banco, limite, vencimento, saldo inicial) ou remoção → update_card/delete_card/update_account/delete_account.
- Dúvida sobre planos de contas → get_plans (mas lembre-se: você só lê, não cria/troca — oriente o usuário a fazer isso pelo menu no topo da tela).

Você tem ferramentas de LEITURA (list_transactions, get_accounts, get_cards, get_categories, get_projection, get_reports, get_credit_purchases, get_plans) — chame-as livremente e proativamente sempre que precisar de dados reais para responder com precisão ou para descobrir ids antes de editar/excluir algo, sem pedir permissão antes. Prefira sempre checar o estado real a assumir algo a partir só do que já foi dito na conversa.

Você também tem ferramentas de ESCRITA (create_transaction, update_transaction, delete_transaction, create_credit_purchase, update_credit_purchase, delete_credit_purchase, create_card, update_card, delete_card, create_account, update_account, delete_account, parcelar_fatura). IMPORTANTE: uma chamada a qualquer ferramenta de escrita NUNCA é executada imediatamente — o sistema sempre intercepta e mostra a ação para o usuário confirmar antes de aplicar de fato. Por isso você deve chamar essas ferramentas assim que tiver os dados necessários, com confiança, sem perguntar "posso confirmar?" antes — a confirmação já acontece depois, automaticamente, fora do seu controle. Pode inclusive propor várias ações de escrita na mesma resposta (ex.: criar uma conta, um cartão e já lançar a primeira compra nele; ou adicionar uma despesa e excluir outra) — todas serão apresentadas juntas para confirmação.

Regras:
- Se faltar informação essencial (valor, descrição ou data) para uma ação de escrita, pergunte ao usuário em vez de inventar valores. Isso vale especialmente para valores: NUNCA chame uma ferramenta de escrita com amount/total_amount igual a 0, um número "de exemplo", ou qualquer valor que o usuário não informou nem deu como calcular — isso cria lançamentos inválidos ou sem sentido. Se o usuário disse que usa um cartão "bastante" ou "para o dia a dia" sem dizer quanto gasta, pergunte um valor (pode ser uma média mensal) antes de propor create_credit_purchase.
- NUNCA invente uma categoria. Só preencha o campo category se o usuário mencionou uma explicitamente (ou algo claramente equivalente); caso contrário, deixe o campo de fora / vazio — não reaproveite categorias da lista acima só porque existem.
- Nunca escreva algo como "vou adicionar X, confirma?" sem chamar a ferramenta de escrita NA MESMA resposta. Texto pedindo confirmação sem nenhuma ação de escrita anexada não gera os botões de confirmar/cancelar — o usuário só veria seu texto e teria que repetir o pedido para algo realmente acontecer. Se você já sabe o que precisa ser feito (mesmo que sejam várias ações), chame todas as ferramentas necessárias imediatamente nesta resposta; só responda em texto puro, sem chamar ferramenta nenhuma, quando genuinamente falta uma informação que só o usuário pode dar.
- Para datas relativas ("ontem", "essa semana", "mês que vem"), use a data de hoje acima como referência.
- Pagamento no cartão de crédito usa create_credit_purchase/update_credit_purchase/delete_credit_purchase (nunca create_transaction com payment_method de cartão) — escolha o card_id certo pela lista de cartões acima, ou crie o cartão primeiro se ele ainda não existir.
- Ao citar contas ou cartões, use os ids EXATOS da lista mostrada NESTA mensagem (ela é sempre gerada de novo a cada turno com o estado real e atual). Nunca reaproveite um id de conta/cartão que só apareceu em mensagens anteriores da conversa (ex.: "cartão #4" numa confirmação antiga) sem conferir que ele ainda está na lista atual — contas e cartões podem ter sido editados, renomeados ou excluídos entre uma mensagem e outra, e um id que não existe mais causa erro "Conta inválida"/"Cartão inválido" ao confirmar. Na dúvida, rode get_accounts/get_cards de novo antes de propor a ação.
- account_id é obrigatório em create_transaction/update_transaction. Se houver só uma conta cadastrada, use-a automaticamente sem perguntar. Se houver mais de uma e o usuário não especificou qual, pergunte qual conta usar antes de propor a ação — nunca escolha uma ao acaso. Se não houver nenhuma conta ainda, crie uma (create_account) antes de propor a movimentação. Em update_transaction, se o usuário não pediu para mudar a conta, mantenha o account_id que o lançamento já tinha (consulte com list_transactions antes de editar).
- update_card/update_account substituem todos os campos do registro, não só os citados — antes de propor uma edição parcial (ex.: só mudar o limite do cartão), reaproveite os demais valores já mostrados na lista de cartões/contas acima (ou consulte get_cards/get_accounts se precisar confirmar) para não apagar dados que o usuário não pediu para mudar."""


# ── Agent turn orchestration ─────────────────────────────────────────────────

def run_agent_turn(uid: int, pid: int, conversation, user_text: str) -> list:
    is_first_message = len(conversation.messages) == 0

    user_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="user", content=user_text)
    db.session.add(user_msg)
    if is_first_message:
        conversation.title = user_text[:60]
    conversation.updated_at = datetime.utcnow()
    db.session.commit()
    new_messages = [user_msg]

    client = _get_client()
    if client is None:
        err_msg = AiMessage(
            user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant",
            content="O assistente de IA ainda não está configurado (falta a chave da API OpenAI no servidor).",
        )
        db.session.add(err_msg)
        db.session.commit()
        new_messages.append(err_msg)
        return new_messages

    history_rows = (
        AiMessage.query.filter_by(conversation_id=conversation.id)
        .order_by(AiMessage.created_at.desc())
        .limit(MAX_HISTORY)
        .all()
    )
    history_rows.reverse()

    messages = [{"role": "system", "content": _build_system_prompt(uid, pid)}]
    for m in history_rows:
        messages.append({"role": m.role, "content": m.content})

    for _ in range(MAX_TOOL_ITERATIONS):
        try:
            resp = client.chat.completions.create(
                model=MODEL, messages=messages, tools=TOOLS, tool_choice="auto", temperature=TEMPERATURE,
            )
        except Exception as e:
            err_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant", content=f"Erro ao consultar a IA: {e}")
            db.session.add(err_msg)
            db.session.commit()
            new_messages.append(err_msg)
            return new_messages

        msg = resp.choices[0].message

        if not msg.tool_calls:
            final_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant", content=msg.content or "")
            db.session.add(final_msg)
            db.session.commit()
            new_messages.append(final_msg)
            return new_messages

        write_calls = [tc for tc in msg.tool_calls if tc.function.name in WRITE_TOOL_NAMES]
        read_calls = [tc for tc in msg.tool_calls if tc.function.name not in WRITE_TOOL_NAMES]

        if write_calls:
            pending = []
            descriptions = []
            for tc in write_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                pending.append({"id": str(uuid.uuid4()), "tool": tc.function.name, "arguments": args, "status": "pending"})
                descriptions.append("• " + _describe_action(tc.function.name, args))

            prefix = (msg.content or "").strip()
            confirm_text = (prefix + "\n\n" if prefix else "") + "\n".join(descriptions) + "\n\nConfirma?"

            confirm_msg = AiMessage(
                user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant",
                content=confirm_text, pending_actions=json.dumps(pending),
            )
            db.session.add(confirm_msg)
            db.session.commit()
            new_messages.append(confirm_msg)
            return new_messages

        # Only read calls — execute them and keep looping so the model can
        # use the results to formulate its final answer.
        messages.append({
            "role": "assistant",
            "content": msg.content,
            "tool_calls": [
                {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ],
        })
        for tc in read_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            try:
                result = READ_EXECUTORS[tc.function.name](uid, pid, args)
            except Exception as e:
                result = {"error": str(e)}
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result, default=str)[:8000]})

    fallback_msg = AiMessage(
        user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant",
        content="Desculpe, não consegui concluir essa solicitação — tente reformular de forma mais direta.",
    )
    db.session.add(fallback_msg)
    db.session.commit()
    new_messages.append(fallback_msg)
    return new_messages


def _sse(event_type: str, **data) -> str:
    return f"data: {json.dumps({'type': event_type, **data}, default=str)}\n\n"


def run_agent_turn_stream(uid: int, pid: int, conversation, user_text: str):
    """
    Same orchestration as run_agent_turn, but streams the model's answer
    token-by-token as SSE 'delta' events so the UI can show it typing live.
    Tool-call arguments arrive from OpenAI as incremental JSON string chunks
    too, so they're accumulated per tool-call index across the whole chunk
    stream before being parsed — only once a chunk stream ends do we know
    the full arguments for any tool call.

    Every persisted message (the saved user message, and whichever assistant
    message ends the turn — final answer, pending-action confirmation, or
    error) is sent as a 'message' event with its authoritative to_dict(), so
    the frontend can replace its live-typed preview with the exact saved
    content rather than trusting the token concatenation to match perfectly.
    A trailing 'done' event with the updated conversation always closes the
    stream, mirroring run_agent_turn's return value.
    """
    is_first_message = len(conversation.messages) == 0

    user_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="user", content=user_text)
    db.session.add(user_msg)
    if is_first_message:
        conversation.title = user_text[:60]
    conversation.updated_at = datetime.utcnow()
    db.session.commit()
    yield _sse("message", message=user_msg.to_dict())

    client = _get_client()
    if client is None:
        err_msg = AiMessage(
            user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant",
            content="O assistente de IA ainda não está configurado (falta a chave da API OpenAI no servidor).",
        )
        db.session.add(err_msg)
        db.session.commit()
        yield _sse("message", message=err_msg.to_dict())
        yield _sse("done", conversation=conversation.to_dict())
        return

    history_rows = (
        AiMessage.query.filter_by(conversation_id=conversation.id)
        .order_by(AiMessage.created_at.desc())
        .limit(MAX_HISTORY)
        .all()
    )
    history_rows.reverse()

    messages = [{"role": "system", "content": _build_system_prompt(uid, pid)}]
    for m in history_rows:
        messages.append({"role": m.role, "content": m.content})

    for _ in range(MAX_TOOL_ITERATIONS):
        content_acc = ""
        tool_calls_acc = {}
        try:
            stream = client.chat.completions.create(
                model=MODEL, messages=messages, tools=TOOLS, tool_choice="auto",
                temperature=TEMPERATURE, stream=True,
            )
            for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta.content:
                    content_acc += delta.content
                    yield _sse("delta", content=delta.content)
                if delta.tool_calls:
                    for tcd in delta.tool_calls:
                        slot = tool_calls_acc.setdefault(tcd.index, {"id": None, "name": "", "arguments": ""})
                        if tcd.id:
                            slot["id"] = tcd.id
                        if tcd.function:
                            if tcd.function.name:
                                slot["name"] += tcd.function.name
                            if tcd.function.arguments:
                                slot["arguments"] += tcd.function.arguments
        except Exception as e:
            err_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant", content=f"Erro ao consultar a IA: {e}")
            db.session.add(err_msg)
            db.session.commit()
            yield _sse("message", message=err_msg.to_dict())
            yield _sse("done", conversation=conversation.to_dict())
            return

        tool_calls = [tool_calls_acc[i] for i in sorted(tool_calls_acc)]

        if not tool_calls:
            final_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant", content=content_acc)
            db.session.add(final_msg)
            db.session.commit()
            yield _sse("message", message=final_msg.to_dict())
            yield _sse("done", conversation=conversation.to_dict())
            return

        write_calls = [tc for tc in tool_calls if tc["name"] in WRITE_TOOL_NAMES]
        read_calls = [tc for tc in tool_calls if tc["name"] not in WRITE_TOOL_NAMES]

        if write_calls:
            pending = []
            descriptions = []
            for tc in write_calls:
                try:
                    args = json.loads(tc["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                pending.append({"id": str(uuid.uuid4()), "tool": tc["name"], "arguments": args, "status": "pending"})
                descriptions.append("• " + _describe_action(tc["name"], args))

            prefix = content_acc.strip()
            confirm_text = (prefix + "\n\n" if prefix else "") + "\n".join(descriptions) + "\n\nConfirma?"

            confirm_msg = AiMessage(
                user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant",
                content=confirm_text, pending_actions=json.dumps(pending),
            )
            db.session.add(confirm_msg)
            db.session.commit()
            yield _sse("message", message=confirm_msg.to_dict())
            yield _sse("done", conversation=conversation.to_dict())
            return

        # Only read calls — execute them and keep looping so the model can
        # use the results to formulate its final answer.
        messages.append({
            "role": "assistant",
            "content": content_acc,
            "tool_calls": [
                {"id": tc["id"], "type": "function", "function": {"name": tc["name"], "arguments": tc["arguments"]}}
                for tc in tool_calls
            ],
        })
        for tc in read_calls:
            try:
                args = json.loads(tc["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            try:
                result = READ_EXECUTORS[tc["name"]](uid, pid, args)
            except Exception as e:
                result = {"error": str(e)}
            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": json.dumps(result, default=str)[:8000]})

    fallback_msg = AiMessage(
        user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant",
        content="Desculpe, não consegui concluir essa solicitação — tente reformular de forma mais direta.",
    )
    db.session.add(fallback_msg)
    db.session.commit()
    yield _sse("message", message=fallback_msg.to_dict())
    yield _sse("done", conversation=conversation.to_dict())


def execute_pending_actions(uid: int, pid: int, ai_message: AiMessage) -> AiMessage:
    pending = json.loads(ai_message.pending_actions or "[]")

    for action in pending:
        if action["status"] != "pending":
            continue
        try:
            resource = _execute_write_tool(uid, pid, action["tool"], action["arguments"])
            db.session.commit()
            action["status"] = "confirmed"
            if resource:
                resource_type, obj = resource
                action["result"] = {"resource_type": resource_type, **obj.to_dict()}
        except ValueError as e:
            db.session.rollback()
            action["status"] = "failed"
            action["error"] = "; ".join(e.args[0]) if e.args and isinstance(e.args[0], list) else str(e)
        except Exception as e:
            db.session.rollback()
            action["status"] = "failed"
            action["error"] = str(e)

    ai_message.pending_actions = json.dumps(pending)
    db.session.commit()

    ok = [a for a in pending if a["status"] == "confirmed"]
    failed = [a for a in pending if a["status"] == "failed"]
    lines = []
    if ok:
        lines.append(f"Pronto! {len(ok)} ação(ões) aplicada(s) com sucesso." if len(ok) > 1 else "Pronto! Aplicado com sucesso.")
    for a in failed:
        lines.append(f"⚠️ Não consegui: {_describe_action(a['tool'], a['arguments'])} — {a.get('error')}")
    if not lines:
        lines.append("Nenhuma ação pendente para confirmar.")

    summary_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=ai_message.conversation_id, role="assistant", content="\n".join(lines))
    db.session.add(summary_msg)
    db.session.commit()
    return summary_msg


# ── Routes ────────────────────────────────────────────────────────────────────

@ai_bp.route("/conversations", methods=["GET"])
@jwt_required()
def list_conversations():
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    rows = (
        AiConversation.query.filter_by(user_id=uid, plan_id=pid)
        .order_by(AiConversation.updated_at.desc())
        .limit(200)
        .all()
    )
    return jsonify([c.to_dict() for c in rows])


@ai_bp.route("/conversations", methods=["POST"])
@jwt_required()
def create_conversation():
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    conversation = AiConversation(user_id=uid, plan_id=pid)
    db.session.add(conversation)
    db.session.commit()
    return jsonify(conversation.to_dict()), 201


@ai_bp.route("/conversations/<int:conversation_id>", methods=["DELETE"])
@jwt_required()
def delete_conversation(conversation_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    conversation = AiConversation.query.filter_by(id=conversation_id, user_id=uid, plan_id=pid).first_or_404()
    db.session.delete(conversation)
    db.session.commit()
    return jsonify({"message": "Conversa excluída."})


@ai_bp.route("/conversations/<int:conversation_id>/messages", methods=["GET"])
@jwt_required()
def list_conversation_messages(conversation_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    AiConversation.query.filter_by(id=conversation_id, user_id=uid, plan_id=pid).first_or_404()
    rows = (
        AiMessage.query.filter_by(conversation_id=conversation_id)
        .order_by(AiMessage.created_at)
        .limit(500)
        .all()
    )
    return jsonify([m.to_dict() for m in rows])


@ai_bp.route("/conversations/<int:conversation_id>/messages", methods=["POST"])
@jwt_required()
def post_conversation_message(conversation_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    conversation = AiConversation.query.filter_by(id=conversation_id, user_id=uid, plan_id=pid).first_or_404()
    data = request.get_json(force=True)
    text = (data.get("content") or "").strip()
    if not text:
        return jsonify({"error": "Mensagem vazia."}), 400
    new_msgs = run_agent_turn(uid, pid, conversation, text)
    return jsonify({"conversation": conversation.to_dict(), "messages": [m.to_dict() for m in new_msgs]}), 201


@ai_bp.route("/conversations/<int:conversation_id>/messages/stream", methods=["POST"])
@jwt_required()
def post_conversation_message_stream(conversation_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    conversation = AiConversation.query.filter_by(id=conversation_id, user_id=uid, plan_id=pid).first_or_404()
    data = request.get_json(force=True)
    text = (data.get("content") or "").strip()
    if not text:
        return jsonify({"error": "Mensagem vazia."}), 400

    return Response(
        stream_with_context(run_agent_turn_stream(uid, pid, conversation, text)),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@ai_bp.route("/messages/<int:message_id>/confirm", methods=["POST"])
@jwt_required()
def confirm_message(message_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    m = AiMessage.query.filter_by(id=message_id, user_id=uid, plan_id=pid).first_or_404()
    if not m.pending_actions:
        return jsonify({"error": "Esta mensagem não tem ações pendentes."}), 400
    summary = execute_pending_actions(uid, pid, m)
    return jsonify([m.to_dict(), summary.to_dict()])


@ai_bp.route("/messages/<int:message_id>/cancel", methods=["POST"])
@jwt_required()
def cancel_message(message_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    m = AiMessage.query.filter_by(id=message_id, user_id=uid, plan_id=pid).first_or_404()
    if not m.pending_actions:
        return jsonify({"error": "Esta mensagem não tem ações pendentes."}), 400
    pending = json.loads(m.pending_actions)
    for a in pending:
        if a["status"] == "pending":
            a["status"] = "cancelled"
    m.pending_actions = json.dumps(pending)
    cancel_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=m.conversation_id, role="assistant", content="Ok, cancelado — nenhuma alteração foi feita.")
    db.session.add(cancel_msg)
    db.session.commit()
    return jsonify([m.to_dict(), cancel_msg.to_dict()])
