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
    """
    occurrences = []

    if tx.type == "pontual":
        if range_start <= tx.date <= range_end:
            occurrences.append(_make_occurrence(tx, tx.date))
        return occurrences

    # Recorrente — walk forward from tx.date
    current = tx.date
    emitted = 0

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
            occurrences.append(_make_occurrence(tx, current))

        emitted += 1
        current = _next_date(current, tx.frequency)

    return occurrences


def _make_occurrence(tx, occurrence_date: date) -> dict:
    return {
        "transaction_id": tx.id,
        "description": tx.description,
        "amount": float(tx.amount),
        "kind": tx.kind,
        "type": tx.type,
        "date": occurrence_date.strftime("%Y-%m-%d"),
        "category": tx.category,
        "frequency": tx.frequency,
        "payment_method": getattr(tx, "payment_method", None) or "a_vista",
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


def _build_chart_series(occurrences: list, initial_balance: float, range_start: date, range_end: date) -> list:
    """Aggregate occurrences by day and produce a cumulative balance + monthly credit bill series."""
    # Group net change per day
    daily: dict[str, float] = {}
    # Credit bill accumulated per month (key = "YYYY-MM")
    monthly_credit: dict[str, float] = {}

    for occ in occurrences:
        d = occ["date"]
        delta = occ["amount"] if occ["kind"] == "receita" else -occ["amount"]
        daily[d] = daily.get(d, 0.0) + delta

        if occ.get("payment_method") == "credito" and occ["kind"] == "despesa":
            month_key = d[:7]  # "YYYY-MM"
            monthly_credit[month_key] = monthly_credit.get(month_key, 0.0) + occ["amount"]

    # Build day-by-day series; attach credit_bill on the last day of each month
    series = []
    balance = float(initial_balance)
    current = range_start
    while current <= range_end:
        ds = current.strftime("%Y-%m-%d")
        if ds in daily:
            balance += daily[ds]

        point = {"date": ds, "balance": round(balance, 2)}

        # Attach the credit bill on the first day of the *next* month (= billing date)
        month_key = ds[:7]
        if month_key in monthly_credit:
            # Emit on last day of this month so it aligns with the period it represents
            next_month = (current.replace(day=1) + relativedelta(months=1))
            last_day_of_month = (next_month - timedelta(days=1)).strftime("%Y-%m-%d")
            if ds == last_day_of_month or current == range_end:
                point["credit_bill"] = round(monthly_credit[month_key], 2)

        series.append(point)
        current += timedelta(days=1)

    return series
