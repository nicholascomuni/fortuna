"""
Write tools — never executed inline. A write tool call always turns into a
pending action attached to the assistant's message and is only applied once
the user explicitly confirms via /messages/<id>/confirm (execute_pending_actions
below). Reuses routes.py's extracted helper functions so there is a single
source of truth for what counts as a valid transaction/credit purchase.
"""

import json
import uuid

from extensions import db
from models import Plan, Account, Transaction, CreditCard, CreditPurchase, AiMessage
import routes as api_routes


def _execute_write_tool(uid: int, pid: int, tool_name: str, args: dict):
    """
    Applies *tool_name* with *args* inside the current session — not
    committed. Returns (resource_type, obj) for anything that leaves a
    resource on screen worth showing (create/update/parcelar_fatura), so the
    caller can attach a clickable resource widget to the pending action once
    committed; returns None for deletes, which leave nothing to show.

    Every lookup here is scoped by plan_id alone (never user_id) — a plan
    shared with 'edit' permission lets its collaborator act on the owner's
    own rows, not just their own. The single access gate is right below:
    a 'read'-only share raises before any of this runs.
    """
    data = dict(args)

    # Plan management acts on the user's own plan list, not the active plan
    # (pid) — a read-only collaborator on a shared plan must still be able
    # to create/rename their OWN plans, and update_plan can target a
    # plan_id different from pid. So these two bypass the pid-scoped gate
    # below and authorize by direct ownership instead.
    if tool_name == "create_plan":
        return "plan", api_routes._build_plan_from_data(uid, data, activate=False)
    elif tool_name == "update_plan":
        plan = Plan.query.filter_by(id=args.get("plan_id"), user_id=uid).first()
        if not plan:
            raise ValueError(["Plano não encontrado."])
        api_routes._apply_plan_data(plan, data)
        return "plan", plan

    if api_routes._plan_permission(uid, pid) not in ("owner", "edit"):
        raise ValueError(["Você só tem acesso de leitura a este plano de contas."])

    if tool_name == "create_transaction":
        return "transaction", api_routes._build_transaction_from_data(uid, pid, data)
    elif tool_name == "update_transaction":
        tx = Transaction.query.filter_by(id=args.get("transaction_id"), plan_id=pid).first()
        if not tx:
            raise ValueError(["Lançamento não encontrado."])
        if tx.source == "credit_invoice":
            raise ValueError(["Esta fatura é gerada automaticamente e não pode ser editada diretamente."])
        api_routes._apply_transaction_data(tx, pid, data)
        return "transaction", tx
    elif tool_name == "delete_transaction":
        tx = Transaction.query.filter_by(id=args.get("transaction_id"), plan_id=pid).first()
        if not tx:
            raise ValueError(["Lançamento não encontrado."])
        if tx.source == "credit_invoice":
            raise ValueError(["Esta fatura é gerada automaticamente e não pode ser excluída diretamente."])
        api_routes._delete_transaction_family(tx, uid, pid)
        return None
    elif tool_name == "create_credit_purchase":
        return "credit_purchase", api_routes._build_credit_purchase_from_data(uid, pid, data)
    elif tool_name == "update_credit_purchase":
        purchase = CreditPurchase.query.filter_by(id=args.get("purchase_id"), plan_id=pid).first()
        if not purchase:
            raise ValueError(["Compra não encontrada."])
        api_routes._apply_credit_purchase_data(uid, pid, purchase, data)
        return "credit_purchase", purchase
    elif tool_name == "delete_credit_purchase":
        purchase = CreditPurchase.query.filter_by(id=args.get("purchase_id"), plan_id=pid).first()
        if not purchase:
            raise ValueError(["Compra não encontrada."])
        api_routes._delete_credit_purchase_obj(uid, pid, purchase)
        return None
    elif tool_name == "create_card":
        return "card", api_routes._build_card_from_data(uid, pid, data)
    elif tool_name == "update_card":
        card = CreditCard.query.filter_by(id=args.get("card_id"), plan_id=pid).first()
        if not card:
            raise ValueError(["Cartão não encontrado."])
        api_routes._apply_card_data(card, pid, data)
        return "card", card
    elif tool_name == "delete_card":
        card = CreditCard.query.filter_by(id=args.get("card_id"), plan_id=pid).first()
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
        tx = Transaction.query.filter_by(id=args.get("transaction_id"), plan_id=pid).first()
        if not tx:
            raise ValueError(["Lançamento não encontrado."])
        api_routes._finance_invoice(tx, data)
        return "transaction", tx
    else:
        raise ValueError([f"Ferramenta desconhecida: {tool_name}"])


def _fmt_brl(v) -> str:
    try:
        return f"R$ {float(v):,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    except (TypeError, ValueError):
        return str(v)


def describe_action(tool_name: str, args: dict) -> str:
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
    if tool_name == "create_plan":
        return f"Criar plano de contas \"{args.get('name', '')}\""
    if tool_name == "update_plan":
        return f"Renomear plano de contas #{args.get('plan_id')} para \"{args.get('name', '')}\""
    if tool_name == "parcelar_fatura":
        return f"Parcelar fatura #{args.get('transaction_id')} em {args.get('interest_count', '')}x com juros de {args.get('interest_rate', '')}% {args.get('interest_period', '')}"
    return f"{tool_name}({args})"


def build_pending_actions(write_calls: list[dict]) -> tuple[list[dict], list[str]]:
    """write_calls: [{"name": ..., "args": {...}}] (LangChain's normalized
    tool_call shape). Returns (pending_actions, human_readable_descriptions)."""
    pending = []
    descriptions = []
    for tc in write_calls:
        pending.append({"id": str(uuid.uuid4()), "tool": tc["name"], "arguments": tc["args"], "status": "pending"})
        descriptions.append("• " + describe_action(tc["name"], tc["args"]))
    return pending, descriptions


def execute_pending_actions(uid: int, pid: int, ai_message: AiMessage) -> AiMessage:
    pending = json.loads(ai_message.pending_actions or "[]")

    # The model sometimes proposes creating an account/card in the same
    # batch as transactions/purchases meant to use it — it can't know the
    # real id yet when it writes those calls, so it uses a negative
    # placeholder (-1 for the first new account/card in the batch, -2 for
    # the second, etc. — see the -1 convention in the tool descriptions).
    # Two things have to hold for that to resolve correctly:
    #   1. Every create_account/create_card runs BEFORE anything that might
    #      reference its placeholder — the model doesn't reliably propose
    #      them in dependency order (it has proposed a card purchase before
    #      the create_card it depends on), so this executes all creates
    #      first regardless of their position in the original list.
    #   2. Each placeholder resolves to a specific one of possibly several
    #      new accounts/cards, by position (-1 => 1st created, -2 => 2nd,
    #      ...) — a flat "only when there's exactly one" fallback silently
    #      picks the wrong one whenever the model creates more than one.
    # The original relative order is preserved in the stored pending_actions
    # (these are the same dicts, just processed in a different sequence).
    new_account_ids = []
    new_card_ids = []

    def resolve_placeholder(created_ids, value):
        if isinstance(value, int) and value < 0:
            idx = -value - 1
            if idx < len(created_ids):
                return created_ids[idx]
        return value

    def run(action):
        args = action["arguments"]
        try:
            resource = _execute_write_tool(uid, pid, action["tool"], args)
            db.session.commit()
            action["status"] = "confirmed"
            if resource:
                resource_type, obj = resource
                action["result"] = {"resource_type": resource_type, **obj.to_dict()}
                if resource_type == "account":
                    new_account_ids.append(obj.id)
                elif resource_type == "card":
                    new_card_ids.append(obj.id)
        except ValueError as e:
            db.session.rollback()
            action["status"] = "failed"
            action["error"] = "; ".join(e.args[0]) if e.args and isinstance(e.args[0], list) else str(e)
        except Exception as e:
            db.session.rollback()
            action["status"] = "failed"
            action["error"] = str(e)

    creates = [a for a in pending if a["status"] == "pending" and a["tool"] in ("create_account", "create_card")]
    others = [a for a in pending if a["status"] == "pending" and a["tool"] not in ("create_account", "create_card")]

    for action in creates:
        run(action)

    for action in others:
        args = action["arguments"]
        if action["tool"] in ("create_transaction", "update_transaction") and args.get("account_id") is not None:
            args["account_id"] = resolve_placeholder(new_account_ids, args["account_id"])
        elif action["tool"] in ("create_credit_purchase", "update_credit_purchase") and args.get("card_id") is not None:
            args["card_id"] = resolve_placeholder(new_card_ids, args["card_id"])
        run(action)

    ai_message.pending_actions = json.dumps(pending)
    db.session.commit()

    ok = [a for a in pending if a["status"] == "confirmed"]
    failed = [a for a in pending if a["status"] == "failed"]
    lines = []
    if ok:
        lines.append(f"Pronto! {len(ok)} ação(ões) aplicada(s) com sucesso." if len(ok) > 1 else "Pronto! Aplicado com sucesso.")
    for a in failed:
        lines.append(f"⚠️ Não consegui: {describe_action(a['tool'], a['arguments'])} — {a.get('error')}")
    if not lines:
        lines.append("Nenhuma ação pendente para confirmar.")

    summary_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=ai_message.conversation_id, role="assistant", content="\n".join(lines))
    db.session.add(summary_msg)
    db.session.commit()
    return summary_msg
