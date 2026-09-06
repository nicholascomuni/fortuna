"""Read tools — these execute immediately, server-side, and their result is
fed back to the model so it can reason with real data. Never anything that
mutates state (see actions.py for that)."""

from datetime import date

from dateutil.relativedelta import relativedelta

from extensions import db
from models import Plan, Account, Transaction, CreditCard, CreditPurchase
import routes as api_routes


def _tool_list_transactions(uid, pid, args):
    q = Transaction.query.filter_by(plan_id=pid)
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
    return [c.to_dict() for c in CreditCard.query.filter_by(plan_id=pid).order_by(CreditCard.created_at).all()]


def _tool_get_categories(uid, pid, args):
    rows = (
        db.session.query(Transaction.category)
        .filter(Transaction.plan_id == pid, Transaction.category.isnot(None))
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
    q = CreditPurchase.query.filter_by(plan_id=pid)
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
