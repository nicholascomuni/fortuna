from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request, abort
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from extensions import db
from models import Transaction, Settings, User, CreditCard, CreditPurchase, CardCharge, Plan, Account
from projection import build_projection, merge_credit_purchases
import credit_cards as cc


def _generate_interest_children(parent: Transaction) -> list[Transaction]:
    """
    Given a parent transaction with interest fields set, generate and return
    the list of child Transaction objects (not yet added to the session).
    Each child represents the incremental compound interest earned in that period.
    """
    rate = parent.interest_rate
    count = parent.interest_count
    period = parent.interest_period  # 'mensal' | 'anual'

    if not rate or not count or not period:
        return []

    delta = relativedelta(months=1) if period == "mensal" else relativedelta(years=1)
    base = float(parent.amount)
    children = []
    current_date = parent.date + delta

    # A parceled invoice ("parcelar fatura") reuses this exact same parent+
    # children/compound-growth machinery, but the parent already IS
    # installment 1 (routes.py::parcelar_fatura divided its amount before
    # calling this) — so children just need "(n/total)" labels, not the
    # generic Rendimento/Reajuste ones.
    is_invoice_installment = parent.source == "credit_invoice"
    total_installments = count + 1

    for n in range(1, count + 1):
        # Value after n periods minus value after n-1 periods = incremental interest
        value_before = base * ((1 + rate / 100) ** (n - 1))
        value_after  = base * ((1 + rate / 100) ** n)
        increment    = round(value_after - value_before, 2)

        if is_invoice_installment:
            # Each installment is a real payment of its own — its amount is
            # the compounded VALUE at that period (installment 2 = base
            # grown one period, installment 3 = two periods, ...), not the
            # delta between periods. The delta is right for "Reajuste" below
            # (an extra charge layered on top of an already-settled amount)
            # but would badly understate a loan installment here.
            amount = round(value_after, 2)
            description = f"{parent.description} ({n + 1}/{total_installments})"
        else:
            amount = increment
            # Despesas use interest for cost growth over time (e.g. inflation
            # on a long-term commitment) rather than investment income, so
            # the label matches — the math (compound growth of the base
            # amount) is identical.
            label = "Rendimento" if parent.kind == "receita" else "Reajuste"
            description = f"{label} — {parent.description}"

        child = Transaction(
            user_id=parent.user_id,
            plan_id=parent.plan_id,
            account_id=parent.account_id,
            description=description,
            amount=amount,
            kind=parent.kind,
            type="pontual",
            date=current_date,
            category=parent.category,
            payment_method=parent.payment_method if parent.kind == "despesa" else "a_vista",
            is_interest_child=True,
            parent_id=parent.id,
        )
        children.append(child)
        current_date += delta

    return children

bp = Blueprint("api", __name__)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _uid() -> int:
    """
    Resolve the authenticated user id — and refuse a "pending 2FA" token
    (issued by /auth/login while waiting for the TOTP code) here, since this
    is the single choke point nearly every protected endpoint calls first.
    Without this, a pre_token — obtainable with just the password — would be
    a fully working access token everywhere except /auth/login/2fa, defeating
    the point of the second factor.
    """
    if get_jwt().get("scope") == "2fa_pending":
        abort(401, description="Complete a verificação em duas etapas antes de continuar.")
    return int(get_jwt_identity())


def _current_plan_id(uid: int) -> int:
    """
    The plan the user is currently viewing/editing. Auto-creates a first
    plan on the fly for the rare case a user has none yet (e.g. a row
    inserted directly, bypassing the boot-time migration).
    """
    user = User.query.get_or_404(uid)
    if user.active_plan_id:
        return user.active_plan_id
    plan = Plan(user_id=uid, name="Plano principal")
    db.session.add(plan)
    db.session.flush()
    user.active_plan_id = plan.id
    db.session.commit()
    return plan.id


def _plan_accounts_total(plan_id: int) -> float:
    total = db.session.query(db.func.sum(Account.initial_balance)).filter(Account.plan_id == plan_id).scalar()
    return float(total or 0)


def _parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def _get_or_create_settings(user_id: int) -> Settings:
    s = Settings.query.filter_by(user_id=user_id).first()
    if not s:
        s = Settings(user_id=user_id, initial_balance=0, initial_balance_date=date.today())
        db.session.add(s)
        db.session.commit()
    return s


VALID_PAYMENT_METHODS = ("a_vista", "debito")


def _validate_transaction(data: dict, pid: int) -> list[str]:
    errors = []
    account_id = data.get("account_id")
    if account_id in (None, ""):
        errors.append("Conta é obrigatória.")
    elif not Account.query.filter_by(id=account_id, plan_id=pid).first():
        errors.append("Conta inválida.")
    if not data.get("description", "").strip():
        errors.append("Descrição é obrigatória.")
    try:
        amt = float(data.get("amount", 0))
        if amt <= 0:
            errors.append("Valor deve ser maior que zero.")
    except (TypeError, ValueError):
        errors.append("Valor inválido.")
    if data.get("kind") not in ("receita", "despesa"):
        errors.append("Tipo deve ser 'receita' ou 'despesa'.")
    if data.get("type") not in ("pontual", "recorrente"):
        errors.append("Modalidade deve ser 'pontual' ou 'recorrente'.")
    method = data.get("payment_method", "a_vista")
    if method not in VALID_PAYMENT_METHODS:
        errors.append("Forma de pagamento inválida.")
    try:
        _parse_date(data.get("date", ""))
    except (ValueError, TypeError):
        errors.append("Data inválida.")
    if data.get("type") == "recorrente":
        if data.get("frequency") not in ("semanal", "mensal", "anual"):
            errors.append("Frequência deve ser 'semanal', 'mensal' ou 'anual'.")
        if data.get("recurrence_end_type") not in ("por_data", "por_ocorrencias"):
            errors.append("Fim da recorrência deve ser 'por_data' ou 'por_ocorrencias'.")
        if data.get("recurrence_end_type") == "por_data":
            try:
                _parse_date(data.get("recurrence_end_date", ""))
            except (ValueError, TypeError):
                errors.append("Data de fim da recorrência inválida.")
        if data.get("recurrence_end_type") == "por_ocorrencias":
            try:
                cnt = int(data.get("recurrence_count", 0))
                if cnt <= 0:
                    errors.append("Número de ocorrências deve ser maior que zero.")
            except (TypeError, ValueError):
                errors.append("Número de ocorrências inválido.")
    return errors


# ── Settings ─────────────────────────────────────────────────────────────────

@bp.route("/settings", methods=["GET"])
@jwt_required()
def get_settings():
    return jsonify(_get_or_create_settings(_uid()).to_dict())


@bp.route("/settings", methods=["PUT"])
@jwt_required()
def put_settings():
    data = request.get_json(force=True)
    s = _get_or_create_settings(_uid())
    if "initial_balance" in data:
        try:
            s.initial_balance = float(data["initial_balance"])
        except (TypeError, ValueError):
            return jsonify({"error": "Saldo inicial inválido."}), 400
    if "initial_balance_date" in data:
        try:
            s.initial_balance_date = _parse_date(data["initial_balance_date"])
        except (ValueError, TypeError):
            return jsonify({"error": "Data do saldo inicial inválida."}), 400
    if "currency" in data:
        s.currency = data["currency"] or "BRL"
    if "language" in data:
        s.language = data["language"] or "pt-BR"
    db.session.commit()
    return jsonify(s.to_dict())


# ── Transactions ──────────────────────────────────────────────────────────────

@bp.route("/transactions", methods=["GET"])
@jwt_required()
def list_transactions():
    uid = _uid()
    q = Transaction.query.filter_by(user_id=uid, plan_id=_current_plan_id(uid))
    if request.args.get("kind"):
        q = q.filter_by(kind=request.args["kind"])
    if request.args.get("category"):
        q = q.filter_by(category=request.args["category"])
    if request.args.get("type"):
        q = q.filter_by(type=request.args["type"])
    if request.args.get("source_card_id"):
        q = q.filter_by(source_card_id=request.args["source_card_id"])
    if request.args.get("account_id"):
        q = q.filter_by(account_id=request.args["account_id"])
    start = request.args.get("start")
    end = request.args.get("end")
    if start:
        q = q.filter(Transaction.date >= _parse_date(start))
    if end:
        q = q.filter(Transaction.date <= _parse_date(end))
    return jsonify([t.to_dict() for t in q.order_by(Transaction.date).all()])


def _build_transaction_from_data(uid: int, pid: int, data: dict) -> Transaction:
    """
    Validate *data* and construct a new Transaction (plus its interest
    children, if any) inside the current session — not committed.
    Raises ValueError(errors_list) on invalid input.
    """
    errors = _validate_transaction(data, pid)
    if errors:
        raise ValueError(errors)

    raw_rate = data.get("interest_rate")
    interest_rate = float(raw_rate) if raw_rate not in (None, "", 0, "0") else None

    tx = Transaction(
        user_id=uid,
        plan_id=pid,
        account_id=data.get("account_id") or None,
        description=data["description"].strip(),
        amount=float(data["amount"]),
        kind=data["kind"],
        type=data["type"],
        date=_parse_date(data["date"]),
        category=(data.get("category") or "").strip() or None,
        payment_method=data.get("payment_method", "a_vista"),
        interest_rate=interest_rate,
        interest_period=data.get("interest_period") if interest_rate else None,
        interest_count=int(data["interest_count"]) if interest_rate and data.get("interest_count") else None,
    )
    if data["type"] == "recorrente":
        tx.frequency = data["frequency"]
        tx.recurrence_end_type = data["recurrence_end_type"]
        if data["recurrence_end_type"] == "por_data":
            tx.recurrence_end_date = _parse_date(data["recurrence_end_date"])
        else:
            tx.recurrence_count = int(data["recurrence_count"])

    db.session.add(tx)
    db.session.flush()  # get tx.id before generating children

    # Interest children are only generated for pontual transactions.
    # For recorrente, the projection engine handles compound interest dynamically.
    if tx.type == "pontual":
        for child in _generate_interest_children(tx):
            db.session.add(child)

    return tx


@bp.route("/transactions", methods=["POST"])
@jwt_required()
def create_transaction():
    uid = _uid()
    pid = _current_plan_id(uid)
    data = request.get_json(force=True)
    try:
        tx = _build_transaction_from_data(uid, pid, data)
    except ValueError as e:
        return jsonify({"errors": e.args[0]}), 400
    db.session.commit()
    return jsonify(tx.to_dict()), 201


def _apply_transaction_data(tx: Transaction, pid: int, data: dict) -> None:
    """
    Validate *data* and overwrite *tx*'s fields in place, regenerating its
    interest children — not committed. Raises ValueError(errors_list) on
    invalid input.
    """
    errors = _validate_transaction(data, pid)
    if errors:
        raise ValueError(errors)

    raw_rate = data.get("interest_rate")
    interest_rate = float(raw_rate) if raw_rate not in (None, "", 0, "0") else None

    tx.description = data["description"].strip()
    tx.amount = float(data["amount"])
    tx.kind = data["kind"]
    tx.type = data["type"]
    tx.date = _parse_date(data["date"])
    tx.category = (data.get("category") or "").strip() or None
    tx.payment_method = data.get("payment_method", "a_vista")
    tx.account_id = data.get("account_id") or None
    tx.interest_rate = interest_rate
    tx.interest_period = data.get("interest_period") if interest_rate else None
    tx.interest_count = int(data["interest_count"]) if interest_rate and data.get("interest_count") else None
    tx.frequency = None
    tx.recurrence_end_type = None
    tx.recurrence_end_date = None
    tx.recurrence_count = None

    if data["type"] == "recorrente":
        tx.frequency = data["frequency"]
        tx.recurrence_end_type = data["recurrence_end_type"]
        if data["recurrence_end_type"] == "por_data":
            tx.recurrence_end_date = _parse_date(data["recurrence_end_date"])
        else:
            tx.recurrence_count = int(data["recurrence_count"])

    # Regenerate interest children (pontual only — recorrente uses projection engine)
    for child in list(tx.children):
        db.session.delete(child)
    db.session.flush()

    if tx.type == "pontual":
        for child in _generate_interest_children(tx):
            db.session.add(child)


@bp.route("/transactions/<int:tx_id>", methods=["PUT"])
@jwt_required()
def update_transaction(tx_id):
    uid = _uid()
    pid = _current_plan_id(uid)
    tx = Transaction.query.filter_by(id=tx_id, user_id=uid, plan_id=pid).first_or_404()
    if tx.source == "credit_invoice":
        return jsonify({"error": "Esta fatura é gerada automaticamente a partir das compras no cartão. Edite as compras em Cartões."}), 409
    data = request.get_json(force=True)
    try:
        _apply_transaction_data(tx, pid, data)
    except ValueError as e:
        return jsonify({"errors": e.args[0]}), 400
    db.session.commit()
    return jsonify(tx.to_dict())


def _delete_transaction_family(tx: Transaction, uid: int, pid: int) -> Transaction:
    """Deletes tx (or, if it's an interest child, its whole parent family) — not committed. Returns the row actually deleted."""
    if tx.is_interest_child and tx.parent_id:
        tx = Transaction.query.filter_by(id=tx.parent_id, user_id=uid, plan_id=pid).first_or_404()
    db.session.delete(tx)
    return tx


@bp.route("/transactions/<int:tx_id>", methods=["DELETE"])
@jwt_required()
def delete_transaction(tx_id):
    uid = _uid()
    pid = _current_plan_id(uid)
    tx = Transaction.query.filter_by(id=tx_id, user_id=uid, plan_id=pid).first_or_404()
    if tx.source == "credit_invoice":
        return jsonify({"error": "Esta fatura é gerada automaticamente a partir das compras no cartão. Edite as compras em Cartões."}), 409
    _delete_transaction_family(tx, uid, pid)
    db.session.commit()
    return jsonify({"message": "Movimentação excluída com sucesso."})


@bp.route("/transactions/<int:tx_id>/parcelar-fatura", methods=["POST"])
@jwt_required()
def parcelar_fatura(tx_id):
    """
    Finance an invoice ("parcelar a fatura") instead of paying it in full on
    the due date — splits it into N growing installments, reusing the exact
    same parent+interest-children/compound-growth machinery as "juros em
    despesas" (_generate_interest_children). The parent Transaction (already
    the invoice row synced by credit_cards.sync_invoice_transaction) becomes
    installment 1/N — its amount is reduced to total/N — and interest_count
    is set to N-1 so the loop generates exactly the remaining N-1 growing
    installments as children.

    Once interest_rate is set here, sync_invoice_transaction leaves this row
    alone on future syncs (see its own docstring) instead of overwriting the
    amount back to the raw charge total — so new purchases billing the same
    month won't silently clobber an active installment plan.
    """
    uid = _uid()
    pid = _current_plan_id(uid)
    tx = Transaction.query.filter_by(id=tx_id, user_id=uid, plan_id=pid).first_or_404()
    data = request.get_json(force=True)
    try:
        _finance_invoice(tx, data)
    except ValueError as e:
        return jsonify({"errors": e.args[0] if isinstance(e.args[0], list) else [str(e)]}), 400
    db.session.commit()
    return jsonify(tx.to_dict())


def _finance_invoice(tx: Transaction, data: dict) -> None:
    """
    Validate *data* and turn an invoice Transaction into N growing
    installments ("parcelar a fatura") — not committed. Raises
    ValueError(errors_list) on invalid input or invalid state.
    """
    if tx.source != "credit_invoice":
        raise ValueError(["Só é possível parcelar lançamentos de fatura."])
    if tx.interest_rate:
        raise ValueError(["Esta fatura já está parcelada."])

    errors = []

    count = None
    try:
        count = int(data.get("interest_count", 0))
        if count < 2 or count > 60:
            errors.append("Número de parcelas deve estar entre 2 e 60.")
    except (TypeError, ValueError):
        errors.append("Número de parcelas inválido.")

    rate = None
    try:
        rate = float(data.get("interest_rate", 0))
        if rate <= 0:
            errors.append("Taxa de juros deve ser maior que zero.")
    except (TypeError, ValueError):
        errors.append("Taxa de juros inválida.")

    period = data.get("interest_period")
    if period not in ("mensal", "anual"):
        errors.append("Período deve ser 'mensal' ou 'anual'.")

    if errors:
        raise ValueError(errors)

    base_description = tx.description
    total = float(tx.amount)

    tx.amount = round(total / count, 2)
    tx.interest_rate = rate
    tx.interest_period = period
    tx.interest_count = count - 1  # parent = installment 1; children = installments 2..count

    for child in list(tx.children):
        db.session.delete(child)
    db.session.flush()

    for child in _generate_interest_children(tx):
        db.session.add(child)

    tx.description = f"{base_description} (1/{count})"


# ── Recurring rules ───────────────────────────────────────────────────────────

@bp.route("/recurring", methods=["GET"])
@jwt_required()
def list_recurring():
    uid = _uid()
    txs = (
        Transaction.query
        .filter_by(user_id=uid, plan_id=_current_plan_id(uid), type="recorrente")
        .order_by(Transaction.date)
        .all()
    )
    return jsonify([t.to_dict() for t in txs])


# ── Projection ────────────────────────────────────────────────────────────────

def _compute_projection_data(uid: int, pid: int, range_start: date, range_end: date, account_id=None) -> dict:
    max_end = range_start + relativedelta(years=5)
    if range_end > max_end:
        range_end = max_end

    # Total starting balance is the sum of every account in the plan, unless
    # the caller asked to see just one account's own trajectory.
    if account_id:
        account = Account.query.filter_by(id=account_id, plan_id=pid).first_or_404()
        initial_balance = float(account.initial_balance)
    else:
        initial_balance = _plan_accounts_total(pid)

    tx_filters = [
        Transaction.user_id == uid,
        Transaction.plan_id == pid,
        db.or_(
            Transaction.type == "recorrente",
            db.and_(
                Transaction.type == "pontual",
                Transaction.date >= range_start,
                Transaction.date <= range_end,
            ),
        ),
    ]
    if account_id:
        tx_filters.append(Transaction.account_id == account_id)

    transactions = (
        Transaction.query.filter(*tx_filters)
        .order_by(Transaction.date)
        .all()
    )

    result = build_projection(transactions, initial_balance, range_start, range_end)

    # Card purchases are shown for visibility only — they never move the
    # balance (only the aggregated invoice Transaction above does), so this
    # merge happens after summary/chart are already computed. Recurring
    # purchases are fetched regardless of purchase_date (like recurring
    # Transactions above) since an old start date can still have occurrences
    # inside this range; merge_credit_purchases expands them.
    purchases = CreditPurchase.query.filter(
        CreditPurchase.user_id == uid,
        CreditPurchase.plan_id == pid,
        db.or_(
            CreditPurchase.type == "recorrente",
            db.and_(
                CreditPurchase.purchase_date >= range_start,
                CreditPurchase.purchase_date <= range_end,
            ),
        ),
    ).all()
    result["rows"] = merge_credit_purchases(
        result["rows"], purchases, initial_balance, range_start, range_end
    )

    return result


@bp.route("/projection", methods=["GET"])
@jwt_required()
def get_projection():
    uid = _uid()
    pid = _current_plan_id(uid)
    today = date.today()

    start_str = request.args.get("start")
    end_str = request.args.get("end")
    range_start = _parse_date(start_str) if start_str else today
    range_end = _parse_date(end_str) if end_str else (today + relativedelta(months=12))

    account_id = request.args.get("account_id")
    result = _compute_projection_data(uid, pid, range_start, range_end, account_id)
    return jsonify(result)


# ── Simulation ───────────────────────────────────────────────────────────────

@bp.route("/projection/simulate", methods=["POST"])
@jwt_required()
def simulate_projection():
    uid = _uid()
    data = request.get_json(force=True)

    start_str = data.get("start")
    end_str = data.get("end")
    try:
        range_start = _parse_date(start_str)
        range_end = _parse_date(end_str)
    except (ValueError, TypeError):
        return jsonify({"error": "Datas inválidas."}), 400

    max_end = range_start + relativedelta(years=5)
    if range_end > max_end:
        range_end = max_end

    initial_balance = _plan_accounts_total(_current_plan_id(uid))

    # Build Transaction-like objects from the payload (never saved to DB)
    from types import SimpleNamespace

    def _make_tx(d, idx):
        tx = SimpleNamespace()
        tx.id = d.get("id") or f"sim-{idx}"
        tx.user_id = uid
        tx.description = d.get("description", "")
        tx.amount = float(d.get("amount", 0))
        tx.kind = d.get("kind", "despesa")
        tx.type = d.get("type", "pontual")
        tx.date = _parse_date(d["date"])
        tx.category = d.get("category")
        tx.frequency = d.get("frequency")
        tx.recurrence_end_type = d.get("recurrence_end_type")
        tx.recurrence_end_date = (
            _parse_date(d["recurrence_end_date"])
            if d.get("recurrence_end_date") else None
        )
        tx.recurrence_count = d.get("recurrence_count")
        return tx

    transactions = [_make_tx(d, i) for i, d in enumerate(data.get("transactions", []))]

    result = build_projection(transactions, initial_balance, range_start, range_end)
    return jsonify(result)


# ── Categories ────────────────────────────────────────────────────────────────

@bp.route("/categories", methods=["GET"])
@jwt_required()
def list_categories():
    uid = _uid()
    rows = (
        db.session.query(Transaction.category)
        .filter(Transaction.user_id == uid, Transaction.plan_id == _current_plan_id(uid), Transaction.category.isnot(None))
        .distinct()
        .all()
    )
    return jsonify(sorted({r[0] for r in rows if r[0]}))


# ── Credit cards ──────────────────────────────────────────────────────────────

def _validate_card(data: dict, pid: int) -> list[str]:
    errors = []
    if not (data.get("name") or "").strip():
        errors.append("Nome do cartão é obrigatório.")
    try:
        due_day = int(data.get("due_day"))
        if due_day < 1 or due_day > 31:
            errors.append("Dia de vencimento deve estar entre 1 e 31.")
    except (TypeError, ValueError):
        errors.append("Dia de vencimento inválido.")
    limit = data.get("credit_limit")
    if limit not in (None, ""):
        try:
            if float(limit) <= 0:
                errors.append("Limite deve ser maior que zero.")
        except (TypeError, ValueError):
            errors.append("Limite inválido.")
    account_id = data.get("account_id")
    if account_id not in (None, ""):
        if not Account.query.filter_by(id=account_id, plan_id=pid).first():
            errors.append("Conta de pagamento inválida.")
    return errors


@bp.route("/cards", methods=["GET"])
@jwt_required()
def list_cards():
    uid = _uid()
    pid = _current_plan_id(uid)
    cards = CreditCard.query.filter_by(user_id=uid, plan_id=pid).order_by(CreditCard.created_at).all()

    today = date.today()
    month_start = today.replace(day=1)

    # The headline number on each card is "how much is my next bill" — NOT
    # strictly this calendar month's invoice. A purchase always bills
    # starting the month AFTER it's made (see credit_cards.compute_billing_date),
    # so right after adding a purchase there's often nothing due this exact
    # calendar month; showing R$0,00 there read as broken. Instead, find each
    # card's nearest upcoming billing_date (today onward) and sum just that
    # one invoice's charges.
    future_charges = (
        db.session.query(CardCharge.card_id, CardCharge.billing_date, db.func.sum(CardCharge.amount))
        .filter(CardCharge.plan_id == pid, CardCharge.billing_date >= today)
        .group_by(CardCharge.card_id, CardCharge.billing_date)
        .all()
    )
    next_invoice_by_card: dict[int, tuple] = {}
    for card_id, billing_date, total in future_charges:
        current = next_invoice_by_card.get(card_id)
        if current is None or billing_date < current[0]:
            next_invoice_by_card[card_id] = (billing_date, float(total))

    # Credit-limit usage must reflect every installment not yet elapsed (this
    # month onward), not just the next invoice — a card can have several
    # future invoices outstanding at once.
    open_totals = dict(
        db.session.query(CardCharge.card_id, db.func.sum(CardCharge.amount))
        .filter(
            CardCharge.plan_id == pid,
            CardCharge.billing_date >= month_start,
        )
        .group_by(CardCharge.card_id)
        .all()
    )

    result = []
    for card in cards:
        d = card.to_dict()
        next_date, next_amount = next_invoice_by_card.get(card.id, (None, 0.0))
        open_balance = float(open_totals.get(card.id, 0) or 0)
        d["next_invoice"] = round(next_amount, 2)
        d["next_invoice_date"] = next_date.strftime("%Y-%m-%d") if next_date else None
        d["open_balance"] = round(open_balance, 2)
        d["limit_used_pct"] = (
            round(open_balance / float(card.credit_limit) * 100, 1) if card.credit_limit else None
        )
        result.append(d)
    return jsonify(result)


def _build_card_from_data(uid: int, pid: int, data: dict) -> CreditCard:
    """Validate *data* and construct a new CreditCard — not committed. Raises ValueError(errors_list) on invalid input."""
    errors = _validate_card(data, pid)
    if errors:
        raise ValueError(errors)

    card = CreditCard(
        user_id=uid,
        plan_id=pid,
        account_id=data.get("account_id") or None,
        name=data["name"].strip(),
        bank=(data.get("bank") or "").strip() or None,
        due_day=int(data["due_day"]),
        credit_limit=float(data["credit_limit"]) if data.get("credit_limit") not in (None, "") else None,
        color=(data.get("color") or "").strip() or None,
    )
    db.session.add(card)
    return card


@bp.route("/cards", methods=["POST"])
@jwt_required()
def create_card():
    uid = _uid()
    pid = _current_plan_id(uid)
    data = request.get_json(force=True)
    try:
        card = _build_card_from_data(uid, pid, data)
    except ValueError as e:
        return jsonify({"errors": e.args[0]}), 400
    db.session.commit()
    return jsonify(card.to_dict()), 201


def _apply_card_data(card: CreditCard, pid: int, data: dict) -> None:
    """Validate *data* and overwrite *card*'s fields in place — not committed. Raises ValueError(errors_list) on invalid input."""
    errors = _validate_card(data, pid)
    if errors:
        raise ValueError(errors)

    card.name = data["name"].strip()
    card.bank = (data.get("bank") or "").strip() or None
    card.due_day = int(data["due_day"])
    card.credit_limit = float(data["credit_limit"]) if data.get("credit_limit") not in (None, "") else None
    card.color = (data.get("color") or "").strip() or None
    card.account_id = data.get("account_id") or None


@bp.route("/cards/<int:card_id>", methods=["PUT"])
@jwt_required()
def update_card(card_id):
    uid = _uid()
    pid = _current_plan_id(uid)
    card = CreditCard.query.filter_by(id=card_id, user_id=uid, plan_id=pid).first_or_404()
    data = request.get_json(force=True)
    try:
        _apply_card_data(card, pid, data)
    except ValueError as e:
        return jsonify({"errors": e.args[0]}), 400
    db.session.commit()
    return jsonify(card.to_dict())


def _delete_card_obj(card: CreditCard) -> None:
    """Deletes *card* — not committed. Raises ValueError(message) if it has purchases linked."""
    if CreditPurchase.query.filter_by(card_id=card.id).count() > 0:
        raise ValueError("Este cartão possui compras vinculadas. Exclua ou transfira as compras antes de remover o cartão.")
    db.session.delete(card)


@bp.route("/cards/<int:card_id>", methods=["DELETE"])
@jwt_required()
def delete_card(card_id):
    uid = _uid()
    pid = _current_plan_id(uid)
    card = CreditCard.query.filter_by(id=card_id, user_id=uid, plan_id=pid).first_or_404()
    try:
        _delete_card_obj(card)
    except ValueError as e:
        return jsonify({"error": str(e)}), 409
    db.session.commit()
    return jsonify({"message": "Cartão excluído com sucesso."})


# ── Credit purchases ──────────────────────────────────────────────────────────

def _validate_credit_purchase(data: dict, uid: int, pid: int) -> list[str]:
    errors = []
    if not (data.get("description") or "").strip():
        errors.append("Descrição é obrigatória.")
    try:
        if float(data.get("total_amount", 0)) <= 0:
            errors.append("Valor deve ser maior que zero.")
    except (TypeError, ValueError):
        errors.append("Valor inválido.")
    ptype = data.get("type", "pontual")
    if ptype not in ("pontual", "recorrente"):
        errors.append("Modalidade deve ser 'pontual' ou 'recorrente'.")
    if ptype == "pontual":
        try:
            inst = int(data.get("installments") or 1)
            if inst < 1:
                errors.append("Número de parcelas deve ser maior que zero.")
        except (TypeError, ValueError):
            errors.append("Número de parcelas inválido.")
    try:
        _parse_date(data.get("purchase_date", ""))
    except (ValueError, TypeError):
        errors.append("Data da compra inválida.")
    card_id = data.get("card_id")
    if not card_id or not CreditCard.query.filter_by(id=card_id, user_id=uid, plan_id=pid).first():
        errors.append("Cartão inválido.")
    if ptype == "recorrente":
        if data.get("frequency") not in ("semanal", "mensal", "anual"):
            errors.append("Frequência deve ser 'semanal', 'mensal' ou 'anual'.")
        if data.get("recurrence_end_type") not in ("por_data", "por_ocorrencias"):
            errors.append("Fim da recorrência deve ser 'por_data' ou 'por_ocorrencias'.")
        if data.get("recurrence_end_type") == "por_data":
            try:
                _parse_date(data.get("recurrence_end_date", ""))
            except (ValueError, TypeError):
                errors.append("Data de fim da recorrência inválida.")
        if data.get("recurrence_end_type") == "por_ocorrencias":
            try:
                cnt = int(data.get("recurrence_count", 0))
                if cnt <= 0:
                    errors.append("Número de ocorrências deve ser maior que zero.")
            except (TypeError, ValueError):
                errors.append("Número de ocorrências inválido.")
    return errors


@bp.route("/credit-purchases", methods=["GET"])
@jwt_required()
def list_credit_purchases():
    uid = _uid()
    q = CreditPurchase.query.filter_by(user_id=uid, plan_id=_current_plan_id(uid))
    if request.args.get("card_id"):
        q = q.filter_by(card_id=request.args["card_id"])
    start = request.args.get("start")
    end = request.args.get("end")
    if start:
        q = q.filter(CreditPurchase.purchase_date >= _parse_date(start))
    if end:
        q = q.filter(CreditPurchase.purchase_date <= _parse_date(end))
    return jsonify([p.to_dict() for p in q.order_by(CreditPurchase.purchase_date).all()])


def _build_credit_purchase_from_data(uid: int, pid: int, data: dict) -> CreditPurchase:
    """Validate *data*, build the CreditPurchase and its CardCharge/invoice side-effects — not committed. Raises ValueError(errors_list)."""
    errors = _validate_credit_purchase(data, uid, pid)
    if errors:
        raise ValueError(errors)

    card = CreditCard.query.filter_by(id=data["card_id"], user_id=uid, plan_id=pid).first_or_404()
    ptype = data.get("type", "pontual")
    purchase = CreditPurchase(
        user_id=uid,
        plan_id=pid,
        card_id=card.id,
        description=data["description"].strip(),
        total_amount=float(data["total_amount"]),
        category=(data.get("category") or "").strip() or None,
        purchase_date=_parse_date(data["purchase_date"]),
        installments=int(data.get("installments") or 1) if ptype == "pontual" else 1,
        type=ptype,
        frequency=data.get("frequency") if ptype == "recorrente" else None,
        recurrence_end_type=data.get("recurrence_end_type") if ptype == "recorrente" else None,
        recurrence_end_date=(
            _parse_date(data["recurrence_end_date"])
            if ptype == "recorrente" and data.get("recurrence_end_type") == "por_data" else None
        ),
        recurrence_count=(
            int(data["recurrence_count"])
            if ptype == "recorrente" and data.get("recurrence_end_type") == "por_ocorrencias" else None
        ),
    )
    cc.create_purchase(uid, card, purchase)
    return purchase


@bp.route("/credit-purchases", methods=["POST"])
@jwt_required()
def create_credit_purchase():
    uid = _uid()
    pid = _current_plan_id(uid)
    data = request.get_json(force=True)
    try:
        purchase = _build_credit_purchase_from_data(uid, pid, data)
    except ValueError as e:
        return jsonify({"errors": e.args[0]}), 400
    db.session.commit()
    return jsonify(purchase.to_dict()), 201


def _apply_credit_purchase_data(uid: int, pid: int, purchase: CreditPurchase, data: dict) -> None:
    """Validate *data* and overwrite *purchase* in place, syncing CardCharge/invoice side-effects — not committed. Raises ValueError(errors_list)."""
    errors = _validate_credit_purchase(data, uid, pid)
    if errors:
        raise ValueError(errors)

    old_card = CreditCard.query.filter_by(id=purchase.card_id, user_id=uid, plan_id=pid).first_or_404()
    new_card = CreditCard.query.filter_by(id=data["card_id"], user_id=uid, plan_id=pid).first_or_404()
    ptype = data.get("type", "pontual")

    purchase.description = data["description"].strip()
    purchase.total_amount = float(data["total_amount"])
    purchase.category = (data.get("category") or "").strip() or None
    purchase.purchase_date = _parse_date(data["purchase_date"])
    purchase.installments = int(data.get("installments") or 1) if ptype == "pontual" else 1
    purchase.card_id = new_card.id
    purchase.type = ptype
    purchase.frequency = data.get("frequency") if ptype == "recorrente" else None
    purchase.recurrence_end_type = data.get("recurrence_end_type") if ptype == "recorrente" else None
    purchase.recurrence_end_date = (
        _parse_date(data["recurrence_end_date"])
        if ptype == "recorrente" and data.get("recurrence_end_type") == "por_data" else None
    )
    purchase.recurrence_count = (
        int(data["recurrence_count"])
        if ptype == "recorrente" and data.get("recurrence_end_type") == "por_ocorrencias" else None
    )

    cc.update_purchase(uid, old_card, new_card, purchase)


@bp.route("/credit-purchases/<int:purchase_id>", methods=["PUT"])
@jwt_required()
def update_credit_purchase(purchase_id):
    uid = _uid()
    pid = _current_plan_id(uid)
    purchase = CreditPurchase.query.filter_by(id=purchase_id, user_id=uid, plan_id=pid).first_or_404()
    data = request.get_json(force=True)
    try:
        _apply_credit_purchase_data(uid, pid, purchase, data)
    except ValueError as e:
        return jsonify({"errors": e.args[0]}), 400
    db.session.commit()
    return jsonify(purchase.to_dict())


def _delete_credit_purchase_obj(uid: int, pid: int, purchase: CreditPurchase) -> None:
    card = CreditCard.query.filter_by(id=purchase.card_id, user_id=uid, plan_id=pid).first_or_404()
    cc.delete_purchase(uid, card, purchase)


@bp.route("/credit-purchases/<int:purchase_id>", methods=["DELETE"])
@jwt_required()
def delete_credit_purchase(purchase_id):
    uid = _uid()
    pid = _current_plan_id(uid)
    purchase = CreditPurchase.query.filter_by(id=purchase_id, user_id=uid, plan_id=pid).first_or_404()
    _delete_credit_purchase_obj(uid, pid, purchase)
    db.session.commit()
    return jsonify({"message": "Compra excluída com sucesso."})


# ── Profile ───────────────────────────────────────────────────────────────────

@bp.route("/auth/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    uid = _uid()
    data = request.get_json(force=True)
    user = User.query.get_or_404(uid)

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"error": "Nome não pode ser vazio."}), 400
        user.name = name

    if "email" in data:
        email = (data["email"] or "").strip().lower()
        if not email or "@" not in email:
            return jsonify({"error": "E-mail inválido."}), 400
        existing = User.query.filter(User.email == email, User.id != uid).first()
        if existing:
            return jsonify({"error": "E-mail já está em uso."}), 409
        user.email = email

    if "password" in data:
        pw = data["password"] or ""
        if len(pw) < 6:
            return jsonify({"error": "Senha deve ter ao menos 6 caracteres."}), 400
        current_pw = data.get("current_password", "")
        if not user.check_password(current_pw):
            return jsonify({"error": "Senha atual incorreta."}), 403
        user.set_password(pw)

    db.session.commit()
    return jsonify(user.to_dict())


# ── Reports ──────────────────────────────────────────────────────────────────

def _compute_reports_data(uid: int, pid: int, range_start: date, range_end: date) -> dict:
    # Fetch all transactions for the user (pontual in range + all recorrente)
    from projection import expand_transaction
    transactions = (
        Transaction.query.filter(
            Transaction.user_id == uid,
            Transaction.plan_id == pid,
            db.or_(
                Transaction.type == "recorrente",
                db.and_(
                    Transaction.type == "pontual",
                    Transaction.date >= range_start,
                    Transaction.date <= range_end,
                ),
            ),
        )
        .order_by(Transaction.date)
        .all()
    )

    # Expand all occurrences within the range
    occurrences = []
    for tx in transactions:
        occurrences.extend(expand_transaction(tx, range_start, range_end))

    if not occurrences:
        return {
            "period": {"start": range_start.isoformat(), "end": range_end.isoformat()},
            "kpis": {}, "monthly": [], "by_category": [],
            "top_expenses": [], "top_incomes": [], "payment_methods": [],
        }

    # ── Monthly aggregation ───────────────────────────────────────────────────
    from collections import defaultdict
    monthly: dict[str, dict] = defaultdict(lambda: {"receita": 0.0, "despesa": 0.0})
    for occ in occurrences:
        month = occ["date"][:7]  # "YYYY-MM"
        monthly[month][occ["kind"]] += occ["amount"]

    monthly_list = sorted(
        [
            {
                "month": k,
                "receita": round(v["receita"], 2),
                "despesa": round(v["despesa"], 2),
                "saldo":   round(v["receita"] - v["despesa"], 2),
            }
            for k, v in monthly.items()
        ],
        key=lambda x: x["month"],
    )

    num_months = len(monthly_list) or 1
    total_receita  = sum(m["receita"] for m in monthly_list)
    total_despesa  = sum(m["despesa"] for m in monthly_list)
    avg_receita    = total_receita / num_months
    avg_despesa    = total_despesa / num_months
    avg_saldo      = (total_receita - total_despesa) / num_months
    savings_rate   = (avg_saldo / avg_receita * 100) if avg_receita > 0 else 0.0
    months_runway  = (avg_saldo / avg_despesa * 12) if avg_despesa > 0 and avg_saldo > 0 else 0.0

    # ── By category ──────────────────────────────────────────────────────────
    cat_despesa: dict[str, float] = defaultdict(float)
    cat_receita: dict[str, float] = defaultdict(float)
    for occ in occurrences:
        cat = occ["category"] or "Sem categoria"
        if occ["kind"] == "despesa":
            cat_despesa[cat] += occ["amount"]
        else:
            cat_receita[cat] += occ["amount"]

    by_category_despesa = sorted(
        [{"category": k, "total": round(v, 2), "pct": round(v / total_despesa * 100, 1) if total_despesa else 0}
         for k, v in cat_despesa.items()],
        key=lambda x: -x["total"],
    )
    by_category_receita = sorted(
        [{"category": k, "total": round(v, 2), "pct": round(v / total_receita * 100, 1) if total_receita else 0}
         for k, v in cat_receita.items()],
        key=lambda x: -x["total"],
    )

    # ── Top individual occurrences ───────────────────────────────────────────
    top_expenses = sorted(
        [o for o in occurrences if o["kind"] == "despesa"],
        key=lambda x: -x["amount"],
    )[:5]
    top_incomes = sorted(
        [o for o in occurrences if o["kind"] == "receita"],
        key=lambda x: -x["amount"],
    )[:5]

    # ── Payment methods ───────────────────────────────────────────────────────
    method_totals: dict[str, float] = defaultdict(float)
    for occ in occurrences:
        if occ["kind"] == "despesa":
            method = occ.get("payment_method") or "a_vista"
            method_totals[method] += occ["amount"]

    payment_methods = sorted(
        [{"method": k, "total": round(v, 2), "pct": round(v / total_despesa * 100, 1) if total_despesa else 0}
         for k, v in method_totals.items()],
        key=lambda x: -x["total"],
    )

    return {
        "period": {"start": range_start.isoformat(), "end": range_end.isoformat()},
        "kpis": {
            "avg_monthly_income":  round(avg_receita, 2),
            "avg_monthly_expense": round(avg_despesa, 2),
            "avg_monthly_savings": round(avg_saldo, 2),
            "savings_rate":        round(savings_rate, 1),
            "total_income":        round(total_receita, 2),
            "total_expense":       round(total_despesa, 2),
            "net":                 round(total_receita - total_despesa, 2),
            "num_months":          num_months,
            "months_runway":       round(months_runway, 1),
        },
        "monthly":            monthly_list,
        "by_category_expense": by_category_despesa,
        "by_category_income":  by_category_receita,
        "top_expenses":       top_expenses,
        "top_incomes":        top_incomes,
        "payment_methods":    payment_methods,
    }


@bp.route("/reports", methods=["GET"])
@jwt_required()
def get_reports():
    uid = _uid()
    pid = _current_plan_id(uid)
    start_str = request.args.get("start")
    end_str   = request.args.get("end")

    try:
        range_start = _parse_date(start_str) if start_str else date.today().replace(month=1, day=1)
        range_end   = _parse_date(end_str)   if end_str   else date.today()
    except (ValueError, TypeError):
        return jsonify({"error": "Datas inválidas."}), 400

    return jsonify(_compute_reports_data(uid, pid, range_start, range_end))


# ── Export / Import ───────────────────────────────────────────────────────────

@bp.route("/data/export", methods=["GET"])
@jwt_required()
def export_data():
    uid = _uid()
    user = User.query.get_or_404(uid)
    settings = _get_or_create_settings(uid)
    transactions = (
        Transaction.query.filter_by(user_id=uid, plan_id=_current_plan_id(uid))
        .order_by(Transaction.date).all()
    )

    payload = {
        "version": 1,
        "exported_at": datetime.utcnow().isoformat(),
        "user": {"name": user.name, "email": user.email},
        "settings": settings.to_dict(),
        "transactions": [t.to_dict() for t in transactions],
    }
    return jsonify(payload)


@bp.route("/data/import", methods=["POST"])
@jwt_required()
def import_data():
    uid = _uid()
    pid = _current_plan_id(uid)
    data = request.get_json(force=True)

    if data.get("version") != 1:
        return jsonify({"error": "Formato de arquivo não reconhecido."}), 400

    mode = data.get("mode", "merge")  # "merge" | "replace"

    if mode == "replace":
        Transaction.query.filter_by(user_id=uid, plan_id=pid).delete()
        db.session.flush()

    imported = 0
    skipped = 0
    for t in data.get("transactions", []):
        try:
            tx = Transaction(
                user_id=uid,
                plan_id=pid,
                description=(t.get("description") or "").strip() or "Importado",
                amount=float(t.get("amount", 0)),
                kind=t.get("kind", "despesa"),
                type=t.get("type", "pontual"),
                date=_parse_date(t["date"]),
                category=(t.get("category") or None),
                payment_method=t.get("payment_method", "a_vista"),
                installments=t.get("installments"),
                frequency=t.get("frequency"),
                recurrence_end_type=t.get("recurrence_end_type"),
                recurrence_end_date=(
                    _parse_date(t["recurrence_end_date"]) if t.get("recurrence_end_date") else None
                ),
                recurrence_count=t.get("recurrence_count"),
            )
            db.session.add(tx)
            imported += 1
        except Exception:
            skipped += 1

    if data.get("settings"):
        s = _get_or_create_settings(uid)
        sett = data["settings"]
        if "initial_balance" in sett:
            try:
                s.initial_balance = float(sett["initial_balance"])
            except (TypeError, ValueError):
                pass
        if "initial_balance_date" in sett and sett["initial_balance_date"]:
            try:
                s.initial_balance_date = _parse_date(sett["initial_balance_date"])
            except (ValueError, TypeError):
                pass
        if "currency" in sett:
            s.currency = sett["currency"] or "BRL"
        if "language" in sett:
            s.language = sett["language"] or "pt-BR"

    db.session.commit()
    return jsonify({"imported": imported, "skipped": skipped})


# ── Plans ("planos de contas") ──────────────────────────────────────────────

@bp.route("/plans", methods=["GET"])
@jwt_required()
def list_plans():
    uid = _uid()
    active_id = _current_plan_id(uid)
    plans = Plan.query.filter_by(user_id=uid).order_by(Plan.created_at).all()
    return jsonify([{**p.to_dict(), "is_active": p.id == active_id} for p in plans])


@bp.route("/plans", methods=["POST"])
@jwt_required()
def create_plan():
    uid = _uid()
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"errors": ["Nome do plano é obrigatório."]}), 400

    # A new plan starts empty — no cards or transactions — except for one
    # default account, since every transaction now requires one (see
    # _validate_transaction below) and a plan with zero accounts would be
    # unusable until the user manually created one first.
    plan = Plan(user_id=uid, name=name)
    db.session.add(plan)
    db.session.flush()
    db.session.add(Account(plan_id=plan.id, name="Conta principal", initial_balance=0))

    user = User.query.get_or_404(uid)
    user.active_plan_id = plan.id
    db.session.commit()
    return jsonify({**plan.to_dict(), "is_active": True}), 201


@bp.route("/plans/<int:plan_id>", methods=["PUT"])
@jwt_required()
def update_plan(plan_id):
    uid = _uid()
    plan = Plan.query.filter_by(id=plan_id, user_id=uid).first_or_404()
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"errors": ["Nome do plano é obrigatório."]}), 400
    plan.name = name
    db.session.commit()
    return jsonify(plan.to_dict())


@bp.route("/plans/<int:plan_id>/activate", methods=["POST"])
@jwt_required()
def activate_plan(plan_id):
    uid = _uid()
    plan = Plan.query.filter_by(id=plan_id, user_id=uid).first_or_404()
    user = User.query.get_or_404(uid)
    user.active_plan_id = plan.id
    db.session.commit()
    return jsonify({**plan.to_dict(), "is_active": True})


# ── Accounts ("contas bancárias") ───────────────────────────────────────────

def _validate_account(data: dict) -> list[str]:
    errors = []
    if not (data.get("name") or "").strip():
        errors.append("Nome da conta é obrigatório.")
    if data.get("initial_balance") not in (None, ""):
        try:
            float(data["initial_balance"])
        except (TypeError, ValueError):
            errors.append("Saldo inicial inválido.")
    return errors


@bp.route("/accounts", methods=["GET"])
@jwt_required()
def list_accounts():
    pid = _current_plan_id(_uid())
    accounts = Account.query.filter_by(plan_id=pid).order_by(Account.created_at).all()
    return jsonify([a.to_dict() for a in accounts])


def _build_account_from_data(pid: int, data: dict) -> Account:
    """Validate *data* and construct a new Account — not committed. Raises ValueError(errors_list) on invalid input."""
    errors = _validate_account(data)
    if errors:
        raise ValueError(errors)

    account = Account(
        plan_id=pid,
        name=data["name"].strip(),
        bank=(data.get("bank") or "").strip() or None,
        initial_balance=float(data.get("initial_balance") or 0),
    )
    db.session.add(account)
    return account


@bp.route("/accounts", methods=["POST"])
@jwt_required()
def create_account():
    pid = _current_plan_id(_uid())
    data = request.get_json(force=True)
    try:
        account = _build_account_from_data(pid, data)
    except ValueError as e:
        return jsonify({"errors": e.args[0]}), 400
    db.session.commit()
    return jsonify(account.to_dict()), 201


def _apply_account_data(account: Account, data: dict) -> None:
    """Validate *data* and overwrite *account*'s fields in place — not committed. Raises ValueError(errors_list) on invalid input."""
    errors = _validate_account(data)
    if errors:
        raise ValueError(errors)

    account.name = data["name"].strip()
    account.bank = (data.get("bank") or "").strip() or None
    account.initial_balance = float(data.get("initial_balance") or 0)


@bp.route("/accounts/<int:account_id>", methods=["PUT"])
@jwt_required()
def update_account(account_id):
    pid = _current_plan_id(_uid())
    account = Account.query.filter_by(id=account_id, plan_id=pid).first_or_404()
    data = request.get_json(force=True)
    try:
        _apply_account_data(account, data)
    except ValueError as e:
        return jsonify({"errors": e.args[0]}), 400
    db.session.commit()
    return jsonify(account.to_dict())


def _delete_account_obj(account: Account) -> None:
    """Deletes *account* — not committed. Raises ValueError(message) if it's still linked to transactions or a card."""
    if Transaction.query.filter_by(account_id=account.id).count() > 0:
        raise ValueError("Esta conta possui movimentações vinculadas. Edite ou exclua essas movimentações antes de remover a conta.")
    if CreditCard.query.filter_by(account_id=account.id).count() > 0:
        raise ValueError("Esta conta é a conta de pagamento de um cartão. Troque a conta do cartão antes de remover esta conta.")
    db.session.delete(account)


@bp.route("/accounts/<int:account_id>", methods=["DELETE"])
@jwt_required()
def delete_account(account_id):
    pid = _current_plan_id(_uid())
    account = Account.query.filter_by(id=account_id, plan_id=pid).first_or_404()
    try:
        _delete_account_obj(account)
    except ValueError as e:
        return jsonify({"error": str(e)}), 409
    db.session.commit()
    return jsonify({"message": "Conta excluída com sucesso."})
