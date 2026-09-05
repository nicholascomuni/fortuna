"""
Credit card invoice logic.

A credit purchase never touches the account balance directly. Instead, it is
split into per-installment CardCharge rows, each attributed to the invoice
(billing_date) it falls into. For every affected (card, month), we keep a
single real Transaction in sync — that Transaction is what actually debits
the account balance in the projection.

There is no separate "closing date" concept in this app, only a due date, so
billing months are assigned with a simplifying rule: a purchase made in
calendar month M bills starting on the invoice due in month M+1.
"""

from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from extensions import db
from models import CreditCard, CreditPurchase, CardCharge, Transaction
from projection import _next_date

# Hard cap on how many occurrences a recurring card purchase can pre-generate
# (CardCharge rows are real DB rows, unlike a recurring Transaction which is
# expanded on the fly — so an open-ended recurrence needs some ceiling).
MAX_RECURRING_OCCURRENCES = 360


def compute_billing_date(purchase_date: date, due_day: int, installment_number: int) -> date:
    target = purchase_date.replace(day=1) + relativedelta(months=installment_number)
    last_day = (target.replace(day=1) + relativedelta(months=1) - timedelta(days=1)).day
    return target.replace(day=min(due_day, last_day))


def _month_bounds(year: int, month: int):
    start = date(year, month, 1)
    end = start + relativedelta(months=1) - timedelta(days=1)
    return start, end


def sync_invoice_transaction(user_id: int, card: CreditCard, year: int, month: int):
    """Recompute the invoice Transaction for (card, year, month) from CardCharge rows."""
    month_start, month_end = _month_bounds(year, month)

    total = (
        db.session.query(db.func.sum(CardCharge.amount))
        .filter(
            CardCharge.card_id == card.id,
            CardCharge.billing_date >= month_start,
            CardCharge.billing_date <= month_end,
        )
        .scalar()
    ) or 0

    # Scoped by plan_id, not user_id — a shared plan's collaborator syncing
    # this invoice must find the SAME row the owner (or anyone else) already
    # created, or this would spawn a duplicate invoice Transaction per user.
    existing = (
        Transaction.query.filter_by(
            plan_id=card.plan_id, source="credit_invoice", source_card_id=card.id,
        )
        .filter(Transaction.date >= month_start, Transaction.date <= month_end)
        .first()
    )

    if total <= 0:
        if existing:
            db.session.delete(existing)
        return

    if existing:
        if existing.interest_rate:
            # Already financed via routes.py::parcelar_fatura — its amount is
            # now installment 1/N, not the raw charge total, and it owns a
            # family of installment children. Leave it alone; overwriting
            # here would silently corrupt the installment plan.
            return
        # Never reassign the date here — a due-day change must not retroactively
        # move an invoice that was already created.
        existing.amount = total
        existing.account_id = card.account_id
    else:
        due_day = min(card.due_day, month_end.day)
        db.session.add(Transaction(
            user_id=user_id,
            plan_id=card.plan_id,
            account_id=card.account_id,
            description=f"Fatura {card.name}",
            amount=total,
            kind="despesa",
            type="pontual",
            date=month_start.replace(day=due_day),
            category="Cartão de crédito",
            payment_method="a_vista",
            source="credit_invoice",
            source_card_id=card.id,
        ))


def _build_charges(purchase: CreditPurchase, card: CreditCard) -> list[CardCharge]:
    installments = purchase.installments
    total = float(purchase.total_amount)
    base = round(total / installments, 2)
    charges = []
    for n in range(1, installments + 1):
        amount = base if n < installments else round(total - base * (installments - 1), 2)
        charges.append(CardCharge(
            purchase_id=purchase.id,
            card_id=card.id,
            user_id=purchase.user_id,
            plan_id=purchase.plan_id,
            installment_number=n,
            billing_date=compute_billing_date(purchase.purchase_date, card.due_day, n),
            amount=amount,
        ))
    return charges


def _build_recurring_charges(purchase: CreditPurchase, card: CreditCard) -> list[CardCharge]:
    """
    One charge per period, each for the FULL amount (unlike installments,
    which split total_amount across N months) — e.g. a R$40/month
    subscription bills R$40 every month, not R$40 split over N charges.
    """
    charges = []
    current = purchase.purchase_date
    n = 0
    while n < MAX_RECURRING_OCCURRENCES:
        if (
            purchase.recurrence_end_type == "por_ocorrencias"
            and purchase.recurrence_count is not None
            and n >= purchase.recurrence_count
        ):
            break
        if (
            purchase.recurrence_end_type == "por_data"
            and purchase.recurrence_end_date is not None
            and current > purchase.recurrence_end_date
        ):
            break

        n += 1
        charges.append(CardCharge(
            purchase_id=purchase.id,
            card_id=card.id,
            user_id=purchase.user_id,
            plan_id=purchase.plan_id,
            installment_number=n,
            billing_date=compute_billing_date(current, card.due_day, 1),
            amount=float(purchase.total_amount),
        ))
        current = _next_date(current, purchase.frequency)

    return charges


def _build_purchase_charges(purchase: CreditPurchase, card: CreditCard) -> list[CardCharge]:
    if purchase.type == "recorrente":
        return _build_recurring_charges(purchase, card)
    return _build_charges(purchase, card)


def _affected_months(charges: list[CardCharge]) -> set[tuple[int, int]]:
    return {(c.billing_date.year, c.billing_date.month) for c in charges}


def create_purchase(user_id: int, card: CreditCard, purchase: CreditPurchase) -> CreditPurchase:
    db.session.add(purchase)
    db.session.flush()  # need purchase.id

    charges = _build_purchase_charges(purchase, card)
    for c in charges:
        db.session.add(c)
    db.session.flush()

    for (y, m) in _affected_months(charges):
        sync_invoice_transaction(user_id, card, y, m)

    return purchase


def update_purchase(user_id: int, old_card: CreditCard, new_card: CreditCard, purchase: CreditPurchase) -> CreditPurchase:
    old_months = _affected_months(list(purchase.charges))

    for charge in list(purchase.charges):
        db.session.delete(charge)
    db.session.flush()

    new_charges = _build_purchase_charges(purchase, new_card)
    for c in new_charges:
        db.session.add(c)
    db.session.flush()

    new_months = _affected_months(new_charges)

    for (y, m) in old_months:
        sync_invoice_transaction(user_id, old_card, y, m)
    for (y, m) in new_months:
        sync_invoice_transaction(user_id, new_card, y, m)

    return purchase


def delete_purchase(user_id: int, card: CreditCard, purchase: CreditPurchase):
    affected = _affected_months(list(purchase.charges))
    db.session.delete(purchase)
    db.session.flush()
    for (y, m) in affected:
        sync_invoice_transaction(user_id, card, y, m)
