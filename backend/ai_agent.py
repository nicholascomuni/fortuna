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
from flask import Blueprint, jsonify, request
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
    "get_projection", "get_reports", "get_credit_purchases",
}
WRITE_TOOL_NAMES = {
    "create_transaction", "update_transaction", "delete_transaction",
    "create_credit_purchase", "update_credit_purchase", "delete_credit_purchase",
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


READ_EXECUTORS = {
    "list_transactions": _tool_list_transactions,
    "get_accounts": _tool_get_accounts,
    "get_cards": _tool_get_cards,
    "get_categories": _tool_get_categories,
    "get_projection": _tool_get_projection,
    "get_reports": _tool_get_reports,
    "get_credit_purchases": _tool_get_credit_purchases,
}


# ── Write tool execution (only ever called after user confirmation) ────────

def _execute_write_tool(uid: int, pid: int, tool_name: str, args: dict) -> None:
    data = dict(args)
    if tool_name == "create_transaction":
        api_routes._build_transaction_from_data(uid, pid, data)
    elif tool_name == "update_transaction":
        tx = Transaction.query.filter_by(id=args.get("transaction_id"), user_id=uid, plan_id=pid).first()
        if not tx:
            raise ValueError(["Lançamento não encontrado."])
        if tx.source == "credit_invoice":
            raise ValueError(["Esta fatura é gerada automaticamente e não pode ser editada diretamente."])
        api_routes._apply_transaction_data(tx, pid, data)
    elif tool_name == "delete_transaction":
        tx = Transaction.query.filter_by(id=args.get("transaction_id"), user_id=uid, plan_id=pid).first()
        if not tx:
            raise ValueError(["Lançamento não encontrado."])
        if tx.source == "credit_invoice":
            raise ValueError(["Esta fatura é gerada automaticamente e não pode ser excluída diretamente."])
        api_routes._delete_transaction_family(tx, uid, pid)
    elif tool_name == "create_credit_purchase":
        api_routes._build_credit_purchase_from_data(uid, pid, data)
    elif tool_name == "update_credit_purchase":
        purchase = CreditPurchase.query.filter_by(id=args.get("purchase_id"), user_id=uid, plan_id=pid).first()
        if not purchase:
            raise ValueError(["Compra não encontrada."])
        api_routes._apply_credit_purchase_data(uid, pid, purchase, data)
    elif tool_name == "delete_credit_purchase":
        purchase = CreditPurchase.query.filter_by(id=args.get("purchase_id"), user_id=uid, plan_id=pid).first()
        if not purchase:
            raise ValueError(["Compra não encontrada."])
        api_routes._delete_credit_purchase_obj(uid, pid, purchase)
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
    return f"{tool_name}({args})"


# ── System prompt ────────────────────────────────────────────────────────────

def _build_system_prompt(uid: int, pid: int) -> str:
    plan = Plan.query.get(pid)
    accounts = Account.query.filter_by(plan_id=pid).order_by(Account.created_at).all()
    cards = CreditCard.query.filter_by(user_id=uid, plan_id=pid).order_by(CreditCard.created_at).all()
    categories = _tool_get_categories(uid, pid, {})

    accounts_txt = "\n".join(
        f"- id={a.id} nome=\"{a.name}\" banco={a.bank or '-'} saldo_inicial={float(a.initial_balance)}"
        for a in accounts
    ) or "(nenhuma conta cadastrada ainda)"
    cards_txt = "\n".join(
        f"- id={c.id} nome=\"{c.name}\" banco={c.bank or '-'}"
        for c in cards
    ) or "(nenhum cartão cadastrado ainda)"
    categories_txt = ", ".join(categories) or "(nenhuma ainda)"

    return f"""Você é o assistente financeiro do app "Fortuna". Responda sempre em português do Brasil, com um tom natural, amigável e conversacional — como o ChatGPT ou o Claude respondem: explique seu raciocínio quando fizer análises, dê contexto útil junto dos números (não apenas o número seco), ofereça observações ou sugestões relevantes quando fizer sentido, e sinta-se à vontade para responder com alguns parágrafos quando o assunto pedir. Não precisa ser telegráfico — só evite encher linguiça sem necessidade. Valores são em Reais (BRL).

Data de hoje: {date.today().isoformat()}
Plano ativo: "{plan.name if plan else '?'}" (id={pid})

Contas bancárias cadastradas:
{accounts_txt}

Cartões de crédito cadastrados:
{cards_txt}

Categorias já usadas em lançamentos: {categories_txt}

Você tem ferramentas de LEITURA (list_transactions, get_accounts, get_cards, get_categories, get_projection, get_reports, get_credit_purchases) — chame-as livremente sempre que precisar de dados reais para responder com precisão, sem pedir permissão antes.

Você também tem ferramentas de ESCRITA (create_transaction, update_transaction, delete_transaction, create_credit_purchase, update_credit_purchase, delete_credit_purchase). IMPORTANTE: uma chamada a qualquer ferramenta de escrita NUNCA é executada imediatamente — o sistema sempre intercepta e mostra a ação para o usuário confirmar antes de aplicar de fato. Por isso você deve chamar essas ferramentas assim que tiver os dados necessários, com confiança, sem perguntar "posso confirmar?" antes — a confirmação já acontece depois, automaticamente, fora do seu controle. Pode inclusive propor várias ações de escrita na mesma resposta (ex.: adicionar uma e excluir outra) — todas serão apresentadas juntas para confirmação.

Regras:
- Se faltar informação essencial (valor, descrição ou data) para uma ação de escrita, pergunte ao usuário em vez de inventar valores.
- NUNCA invente uma categoria. Só preencha o campo category se o usuário mencionou uma explicitamente (ou algo claramente equivalente); caso contrário, deixe o campo de fora / vazio — não reaproveite categorias da lista acima só porque existem.
- Para datas relativas ("ontem", "essa semana", "mês que vem"), use a data de hoje acima como referência.
- Pagamento no cartão de crédito usa create_credit_purchase/update_credit_purchase/delete_credit_purchase (nunca create_transaction com payment_method de cartão) — escolha o card_id certo pela lista de cartões acima.
- Ao citar contas ou cartões, use os ids exatos da lista acima.
- account_id é obrigatório em create_transaction/update_transaction. Se houver só uma conta cadastrada, use-a automaticamente sem perguntar. Se houver mais de uma e o usuário não especificou qual, pergunte qual conta usar antes de propor a ação — nunca escolha uma ao acaso. Em update_transaction, se o usuário não pediu para mudar a conta, mantenha o account_id que o lançamento já tinha (consulte com list_transactions antes de editar)."""


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


def execute_pending_actions(uid: int, pid: int, ai_message: AiMessage) -> AiMessage:
    pending = json.loads(ai_message.pending_actions or "[]")

    for action in pending:
        if action["status"] != "pending":
            continue
        try:
            _execute_write_tool(uid, pid, action["tool"], action["arguments"])
            db.session.commit()
            action["status"] = "confirmed"
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
