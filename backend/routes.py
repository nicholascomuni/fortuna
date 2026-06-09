from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models import Transaction, Settings, User
from projection import build_projection

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
    )
    if data["type"] == "recorrente":
        tx.frequency = data["frequency"]
        tx.recurrence_end_type = data["recurrence_end_type"]
        if data["recurrence_end_type"] == "por_data":
            tx.recurrence_end_date = _parse_date(data["recurrence_end_date"])
        else:
            tx.recurrence_count = int(data["recurrence_count"])

    db.session.add(tx)
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

    tx.description = data["description"].strip()
    tx.amount = float(data["amount"])
    tx.kind = data["kind"]
    tx.type = data["type"]
    tx.date = _parse_date(data["date"])
    tx.category = (data.get("category") or "").strip() or None
    tx.payment_method = data.get("payment_method", "a_vista")
    tx.installments = int(data["installments"]) if data.get("payment_method") == "credito" and data.get("installments") else None
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

    db.session.commit()
    return jsonify(tx.to_dict())


@bp.route("/transactions/<int:tx_id>", methods=["DELETE"])
@jwt_required()
def delete_transaction(tx_id):
    tx = Transaction.query.filter_by(id=tx_id, user_id=_uid()).first_or_404()
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
