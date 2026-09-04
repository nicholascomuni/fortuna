"""
Recurrence expansion and balance projection logic.

Given a list of Transaction rules and a date range, this module
generates every concrete occurrence (without touching the DB) and
builds the running-balance series used by the chart and table.
"""

from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from decimal import Decimal


def _next_date(current: date, frequency: str) -> date:
    if frequency == "semanal":
        return current + timedelta(weeks=1)
    if frequency == "mensal":
        return current + relativedelta(months=1)
    if frequency == "anual":
        return current + relativedelta(years=1)
    raise ValueError(f"Unknown frequency: {frequency}")


def expand_transaction(tx, range_start: date, range_end: date) -> list[dict]:
    """
    Return a list of concrete occurrence dicts for *tx* that fall within
    [range_start, range_end].  For pontual transactions this is at most one
    entry; for recorrente transactions we expand the rule.

    For recurring transactions with interest_rate:
      Each period emits TWO occurrences — the fixed deposit (base amount) and
      the compound interest earned on the accumulated balance so far.
      Accumulated balance after n deposits (annuity formula):
        S(n) = base × ((1+r)^n − 1) / r
      Interest for period n+1 = S(n) × r
      This correctly models: monthly deposits + compound interest on the running total.
    """
    occurrences = []

    if tx.type == "pontual":
        if range_start <= tx.date <= range_end:
            occurrences.append(_make_occurrence(tx, tx.date))
        return occurrences

    # Recorrente — walk forward from tx.date
    current = tx.date
    emitted = 0
    rate = getattr(tx, "interest_rate", None) or 0.0  # % per period (e.g. 1.0 = 1%)
    base = float(tx.amount)

    while current <= range_end:
        # Honour recurrence_count
        if (
            tx.recurrence_end_type == "por_ocorrencias"
            and tx.recurrence_count is not None
            and emitted >= tx.recurrence_count
        ):
            break

        # Honour recurrence_end_date
        if (
            tx.recurrence_end_type == "por_data"
            and tx.recurrence_end_date is not None
            and current > tx.recurrence_end_date
        ):
            break

        if current >= range_start:
            if rate:
                r = rate / 100.0
                # Fixed deposit — always the same base amount
                occurrences.append(_make_occurrence(tx, current, base))

                # Compound interest on the accumulated balance of all previous deposits.
                # After `emitted` deposits the accumulated balance (annuity) is:
                #   S = base * ((1+r)^emitted - 1) / r   (0 when emitted == 0)
                if emitted > 0:
                    accumulated = base * (((1 + r) ** emitted) - 1) / r
                    interest = round(accumulated * r, 2)
                    if interest > 0:
                        interest_occ = _make_occurrence(tx, current, interest)
                        label = "Rendimento" if tx.kind == "receita" else "Reajuste"
                        interest_occ["description"] = f"{label} — {tx.description}"
                        interest_occ["is_interest_child"] = True
                        occurrences.append(interest_occ)
            else:
                occurrences.append(_make_occurrence(tx, current, base))

        emitted += 1
        current = _next_date(current, tx.frequency)

    return occurrences


def _make_occurrence(tx, occurrence_date: date, amount: float = None) -> dict:
    return {
        "transaction_id": tx.id,
        "description": tx.description,
        "amount": round(amount if amount is not None else float(tx.amount), 2),
        "kind": tx.kind,
        "type": tx.type,
        "date": occurrence_date.strftime("%Y-%m-%d"),
        "category": tx.category,
        "frequency": getattr(tx, "frequency", None),
        "payment_method": getattr(tx, "payment_method", None) or "a_vista",
        "interest_rate": getattr(tx, "interest_rate", None),
        "interest_period": getattr(tx, "interest_period", None),
        "interest_count": getattr(tx, "interest_count", None),
        "is_interest_child": getattr(tx, "is_interest_child", False) or False,
        "parent_id": getattr(tx, "parent_id", None),
        "source": getattr(tx, "source", None),
        "source_card_id": getattr(tx, "source_card_id", None),
    }


def build_projection(transactions, initial_balance: float, range_start: date, range_end: date) -> dict:
    """
    Expand all transactions and return a projection dict with:
      - rows: sorted list of occurrences, each with a running `balance` field
      - summary: totals and min-balance info
    """
    all_occurrences = []
    for tx in transactions:
        all_occurrences.extend(expand_transaction(tx, range_start, range_end))

    # Sort by date then by id for deterministic ordering
    all_occurrences.sort(key=lambda o: (o["date"], o["transaction_id"]))

    balance = float(initial_balance)
    min_balance = balance
    min_balance_date = range_start.strftime("%Y-%m-%d")
    total_receitas = 0.0
    total_despesas = 0.0

    for occ in all_occurrences:
        if occ["kind"] == "receita":
            balance += occ["amount"]
            total_receitas += occ["amount"]
        else:
            balance -= occ["amount"]
            total_despesas += occ["amount"]

        occ["balance"] = round(balance, 2)

        if balance < min_balance:
            min_balance = balance
            min_balance_date = occ["date"]

    # Build chart series: one point per day that has a movement, plus endpoints
    chart_series = _build_chart_series(all_occurrences, initial_balance, range_start, range_end)

    return {
        "rows": all_occurrences,
        "chart": chart_series,
        "summary": {
            "initial_balance": round(float(initial_balance), 2),
            "total_receitas": round(total_receitas, 2),
            "total_despesas": round(total_despesas, 2),
            "final_balance": round(balance, 2),
            "min_balance": round(min_balance, 2),
            "min_balance_date": min_balance_date,
        },
    }


def _purchase_occurrence(p, occurrence_date: date) -> dict:
    return {
        "purchase_id": p.id,
        "card_id": p.card_id,
        "description": p.description,
        "amount": float(p.total_amount),
        "total_amount": float(p.total_amount),
        "kind": "despesa",
        "type": p.type,
        "date": occurrence_date.strftime("%Y-%m-%d"),
        "purchase_date": occurrence_date.strftime("%Y-%m-%d"),
        "category": p.category,
        "installments": p.installments,
        "source": "credit_purchase",
        "is_interest_child": False,
        "frequency": p.frequency,
        "recurrence_end_type": p.recurrence_end_type,
        "recurrence_end_date": p.recurrence_end_date.strftime("%Y-%m-%d") if p.recurrence_end_date else None,
        "recurrence_count": p.recurrence_count,
    }


def _expand_recurring_purchase(p, range_start: date, range_end: date) -> list[dict]:
    """Walk a recurring CreditPurchase's occurrences, same pattern as expand_transaction."""
    occurrences = []
    current = p.purchase_date
    emitted = 0
    while current <= range_end:
        if (
            p.recurrence_end_type == "por_ocorrencias"
            and p.recurrence_count is not None
            and emitted >= p.recurrence_count
        ):
            break
        if (
            p.recurrence_end_type == "por_data"
            and p.recurrence_end_date is not None
            and current > p.recurrence_end_date
        ):
            break

        if current >= range_start:
            occurrences.append(_purchase_occurrence(p, current))

        emitted += 1
        current = _next_date(current, p.frequency)

    return occurrences


def merge_credit_purchases(rows: list[dict], purchases, initial_balance: float, range_start: date, range_end: date) -> list[dict]:
    """
    Merge CreditPurchase rows into *rows* as informational-only entries.

    A card purchase never moves the balance by itself — only the aggregated
    monthly invoice Transaction (source="credit_invoice") does, and that is
    already part of *rows*. So these entries just carry forward whatever
    balance was already in effect at that point, and callers must compute
    summary/chart totals from *rows* BEFORE calling this — merging in here
    would double count against the invoice.

    Recurring purchases (type="recorrente") are expanded into one row per
    occurrence within [range_start, range_end], same as a recurring
    Transaction; pontual/parcelado purchases show a single row.
    """
    purchase_rows = []
    for p in purchases:
        if p.type == "recorrente":
            purchase_rows.extend(_expand_recurring_purchase(p, range_start, range_end))
        elif range_start <= p.purchase_date <= range_end:
            purchase_rows.append(_purchase_occurrence(p, p.purchase_date))

    merged = sorted(
        rows + purchase_rows,
        key=lambda o: (o["date"], 0 if o.get("source") != "credit_purchase" else 1),
    )

    balance = float(initial_balance)
    for occ in merged:
        if occ.get("source") == "credit_purchase":
            occ["balance"] = round(balance, 2)
        else:
            balance = occ["balance"]

    return merged


def _build_chart_series(occurrences: list, initial_balance: float, range_start: date, range_end: date) -> list:
    """Aggregate occurrences by day and produce a cumulative balance series."""
    daily: dict[str, float] = {}

    for occ in occurrences:
        d = occ["date"]
        delta = occ["amount"] if occ["kind"] == "receita" else -occ["amount"]
        daily[d] = daily.get(d, 0.0) + delta

    series = []
    balance = float(initial_balance)
    current = range_start
    while current <= range_end:
        ds = current.strftime("%Y-%m-%d")
        if ds in daily:
            balance += daily[ds]

        series.append({"date": ds, "balance": round(balance, 2)})
        current += timedelta(days=1)

    return series
