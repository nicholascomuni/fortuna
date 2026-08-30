from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models import Transaction, Settings, User
from projection import build_projection


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

    for n in range(1, count + 1):
        # Value after n periods minus value after n-1 periods = incremental interest
        value_before = base * ((1 + rate / 100) ** (n - 1))
        value_after  = base * ((1 + rate / 100) ** n)
        increment    = round(value_after - value_before, 2)

        child = Transaction(
            user_id=parent.user_id,
            description=f"Rendimento — {parent.description}",
            amount=increment,
            kind="receita",
            type="pontual",
            date=current_date,
            category=parent.category,
            payment_method="a_vista",
            is_interest_child=True,
            parent_id=parent.id,
        )
        children.append(child)
        current_date += delta

    return children

bp = Blueprint("api", __name__)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _uid() -> int:
    return int(get_jwt_identity())


def _parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def _get_or_create_settings(user_id: int) -> Settings:
    s = Settings.query.filter_by(user_id=user_id).first()
    if not s:
        s = Settings(user_id=user_id, initial_balance=0, initial_balance_date=date.today())
        db.session.add(s)
        db.session.commit()
    return s


VALID_PAYMENT_METHODS = ("a_vista", "debito", "credito")


def _normalize_credit_installments(data: dict) -> dict:
    """If payment_method=credito with installments>1, convert to recorrente mensal."""
    data = dict(data)
    method = data.get("payment_method", "a_vista")
    if method == "credito":
        installments = int(data.get("installments") or 1)
        if installments > 1:
            data["type"] = "recorrente"
            data["frequency"] = "mensal"
            data["recurrence_end_type"] = "por_ocorrencias"
            data["recurrence_count"] = installments
    return data


def _validate_transaction(data: dict) -> list[str]:
    errors = []
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
    if method == "credito":
        try:
            inst = int(data.get("installments") or 1)
            if inst < 1:
                errors.append("Número de parcelas deve ser maior que zero.")
        except (TypeError, ValueError):
            errors.append("Número de parcelas inválido.")
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
    q = Transaction.query.filter_by(user_id=uid)
    if request.args.get("kind"):
        q = q.filter_by(kind=request.args["kind"])
    if request.args.get("category"):
        q = q.filter_by(category=request.args["category"])
    if request.args.get("type"):
        q = q.filter_by(type=request.args["type"])
    start = request.args.get("start")
    end = request.args.get("end")
    if start:
        q = q.filter(Transaction.date >= _parse_date(start))
    if end:
        q = q.filter(Transaction.date <= _parse_date(end))
    return jsonify([t.to_dict() for t in q.order_by(Transaction.date).all()])


@bp.route("/transactions", methods=["POST"])
@jwt_required()
def create_transaction():
    data = _normalize_credit_installments(request.get_json(force=True))
    errors = _validate_transaction(data)
    if errors:
        return jsonify({"errors": errors}), 400

    raw_rate = data.get("interest_rate")
    interest_rate = float(raw_rate) if raw_rate not in (None, "", 0, "0") else None

    tx = Transaction(
        user_id=_uid(),
        description=data["description"].strip(),
        amount=float(data["amount"]),
        kind=data["kind"],
        type=data["type"],
        date=_parse_date(data["date"]),
        category=(data.get("category") or "").strip() or None,
        payment_method=data.get("payment_method", "a_vista"),
        installments=int(data["installments"]) if data.get("payment_method") == "credito" and data.get("installments") else None,
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

    db.session.commit()
    return jsonify(tx.to_dict()), 201


@bp.route("/transactions/<int:tx_id>", methods=["PUT"])
@jwt_required()
def update_transaction(tx_id):
    tx = Transaction.query.filter_by(id=tx_id, user_id=_uid()).first_or_404()
    data = _normalize_credit_installments(request.get_json(force=True))
    errors = _validate_transaction(data)
    if errors:
        return jsonify({"errors": errors}), 400

    raw_rate = data.get("interest_rate")
    interest_rate = float(raw_rate) if raw_rate not in (None, "", 0, "0") else None

    tx.description = data["description"].strip()
    tx.amount = float(data["amount"])
    tx.kind = data["kind"]
    tx.type = data["type"]
    tx.date = _parse_date(data["date"])
    tx.category = (data.get("category") or "").strip() or None
    tx.payment_method = data.get("payment_method", "a_vista")
    tx.installments = int(data["installments"]) if data.get("payment_method") == "credito" and data.get("installments") else None
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

    db.session.commit()
    return jsonify(tx.to_dict())


@bp.route("/transactions/<int:tx_id>", methods=["DELETE"])
@jwt_required()
def delete_transaction(tx_id):
    tx = Transaction.query.filter_by(id=tx_id, user_id=_uid()).first_or_404()
    # If deleting a child, delete the whole family via the parent
    if tx.is_interest_child and tx.parent_id:
        tx = Transaction.query.filter_by(id=tx.parent_id, user_id=_uid()).first_or_404()
    db.session.delete(tx)
    db.session.commit()
    return jsonify({"message": "Movimentação excluída com sucesso."})


# ── Recurring rules ───────────────────────────────────────────────────────────

@bp.route("/recurring", methods=["GET"])
@jwt_required()
def list_recurring():
    txs = (
        Transaction.query
        .filter_by(user_id=_uid(), type="recorrente")
        .order_by(Transaction.date)
        .all()
    )
    return jsonify([t.to_dict() for t in txs])


# ── Projection ────────────────────────────────────────────────────────────────

@bp.route("/projection", methods=["GET"])
@jwt_required()
def get_projection():
    uid = _uid()
    settings = _get_or_create_settings(uid)
    today = date.today()

    start_str = request.args.get("start")
    end_str = request.args.get("end")
    range_start = _parse_date(start_str) if start_str else today
    range_end = _parse_date(end_str) if end_str else (today + relativedelta(months=12))

    max_end = range_start + relativedelta(years=5)
    if range_end > max_end:
        range_end = max_end

    transactions = (
        Transaction.query.filter(
            Transaction.user_id == uid,
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

    result = build_projection(transactions, float(settings.initial_balance), range_start, range_end)
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

    settings = _get_or_create_settings(uid)

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

    result = build_projection(transactions, float(settings.initial_balance), range_start, range_end)
    return jsonify(result)


# ── Categories ────────────────────────────────────────────────────────────────

@bp.route("/categories", methods=["GET"])
@jwt_required()
def list_categories():
    rows = (
        db.session.query(Transaction.category)
        .filter(Transaction.user_id == _uid(), Transaction.category.isnot(None))
        .distinct()
        .all()
    )
    return jsonify(sorted({r[0] for r in rows if r[0]}))


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

@bp.route("/reports", methods=["GET"])
@jwt_required()
def get_reports():
    uid = _uid()
    start_str = request.args.get("start")
    end_str   = request.args.get("end")

    try:
        range_start = _parse_date(start_str) if start_str else date.today().replace(month=1, day=1)
        range_end   = _parse_date(end_str)   if end_str   else date.today()
    except (ValueError, TypeError):
        return jsonify({"error": "Datas inválidas."}), 400

    # Fetch all transactions for the user (pontual in range + all recorrente)
    from projection import expand_transaction
    transactions = (
        Transaction.query.filter(
            Transaction.user_id == uid,
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
        return jsonify({
            "period": {"start": range_start.isoformat(), "end": range_end.isoformat()},
            "kpis": {}, "monthly": [], "by_category": [],
            "top_expenses": [], "top_incomes": [], "payment_methods": [],
        })

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

    return jsonify({
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
    })


# ── Export / Import ───────────────────────────────────────────────────────────

@bp.route("/data/export", methods=["GET"])
@jwt_required()
def export_data():
    uid = _uid()
    user = User.query.get_or_404(uid)
    settings = _get_or_create_settings(uid)
    transactions = Transaction.query.filter_by(user_id=uid).order_by(Transaction.date).all()

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
    data = request.get_json(force=True)

    if data.get("version") != 1:
        return jsonify({"error": "Formato de arquivo não reconhecido."}), 400

    mode = data.get("mode", "merge")  # "merge" | "replace"

    if mode == "replace":
        Transaction.query.filter_by(user_id=uid).delete()
        db.session.flush()

    imported = 0
    skipped = 0
    for t in data.get("transactions", []):
        try:
            tx = Transaction(
                user_id=uid,
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
