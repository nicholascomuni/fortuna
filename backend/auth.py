import base64
import io
import os
import re
import secrets
from datetime import datetime, timedelta

import pyotp
import qrcode
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, get_jwt
from extensions import db, limiter
from models import User, Plan, PlanShare, Account
from email_utils import send_verification_email
from routes import _uid, _delete_plan_cascade

auth_bp = Blueprint("auth", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
VERIFICATION_RESEND_COOLDOWN = timedelta(seconds=60)
EMAIL_VERIFY_TOKEN_EXPIRES = timedelta(hours=24)
PENDING_2FA_EXPIRES = timedelta(minutes=5)


def _validate_register(data):
    errors = []
    if not data.get("name", "").strip():
        errors.append("Nome é obrigatório.")
    email = data.get("email", "").strip().lower()
    if not EMAIL_RE.match(email):
        errors.append("E-mail inválido.")
    if len(data.get("password", "")) < 6:
        errors.append("A senha deve ter pelo menos 6 caracteres.")
    if not data.get("terms_accepted"):
        errors.append("É necessário aceitar os Termos de Uso e a Política de Privacidade.")
    return errors, email


def _send_verification(user: User) -> None:
    token = secrets.token_urlsafe(32)
    user.email_verify_token = token
    user.email_verify_sent_at = datetime.utcnow()
    db.session.commit()
    send_verification_email(user, token, FRONTEND_URL)


@auth_bp.route("/register", methods=["POST"])
@limiter.limit("10 per hour")
def register():
    data = request.get_json(force=True)
    errors, email = _validate_register(data)
    if errors:
        return jsonify({"errors": errors}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"errors": ["Este e-mail já está cadastrado."]}), 409

    user = User(name=data["name"].strip(), email=email, email_verified=False, terms_accepted_at=datetime.utcnow())
    user.set_password(data["password"])
    db.session.add(user)
    db.session.flush()  # need user.id

    plan = Plan(user_id=user.id, name="Plano principal")
    db.session.add(plan)
    db.session.flush()  # need plan.id
    user.active_plan_id = plan.id

    # Every transaction now requires an account (see routes.py::_validate_transaction),
    # so a fresh plan needs one to start with — otherwise the user would be
    # unable to log anything until they went and created one manually first.
    db.session.add(Account(plan_id=plan.id, name="Conta principal", initial_balance=0))

    db.session.commit()
    _send_verification(user)

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()}), 201


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    data = request.get_json(force=True)
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"errors": ["E-mail ou senha incorretos."]}), 401

    if user.totp_enabled:
        # A scoped, short-lived token — routes.py::_uid() refuses it on every
        # normal endpoint, so it's only good for /auth/login/2fa below.
        pre_token = create_access_token(
            identity=str(user.id),
            expires_delta=PENDING_2FA_EXPIRES,
            additional_claims={"scope": "2fa_pending"},
        )
        return jsonify({"requires_2fa": True, "pre_token": pre_token})

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()})


@auth_bp.route("/login/2fa", methods=["POST"])
@limiter.limit("10 per minute")
@jwt_required()
def login_2fa():
    claims = get_jwt()
    if claims.get("scope") != "2fa_pending":
        return jsonify({"error": "Token inválido para esta etapa."}), 401

    uid = int(get_jwt_identity())
    user = User.query.get_or_404(uid)
    data = request.get_json(force=True)
    code = (data.get("code") or "").strip()

    if not user.totp_enabled or not user.totp_secret:
        return jsonify({"error": "A autenticação em duas etapas não está ativada para este usuário."}), 400
    if not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
        return jsonify({"error": "Código inválido."}), 401

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()})


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user = User.query.get_or_404(_uid())
    return jsonify(user.to_dict())


@auth_bp.route("/me", methods=["DELETE"])
@jwt_required()
def delete_account():
    """Permanently deletes the account and every plan it owns (reusing the
    same cascade routes.py::delete_plan uses), plus any PlanShare grants
    where this user was the recipient rather than the owner."""
    uid = _uid()
    user = User.query.get_or_404(uid)
    data = request.get_json(force=True)
    if not user.check_password(data.get("password", "")):
        return jsonify({"error": "Senha incorreta."}), 403

    for plan in Plan.query.filter_by(user_id=uid).all():
        _delete_plan_cascade(plan)
    PlanShare.query.filter_by(email=user.email).delete(synchronize_session=False)
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "Conta excluída com sucesso."})


# ── Email verification ───────────────────────────────────────────────────────

@auth_bp.route("/verify-email", methods=["POST"])
def verify_email():
    data = request.get_json(force=True)
    token = (data.get("token") or "").strip()
    user = User.query.filter_by(email_verify_token=token).first() if token else None
    if not user:
        return jsonify({"error": "Link de verificação inválido ou expirado."}), 400
    if not user.email_verify_sent_at or datetime.utcnow() - user.email_verify_sent_at > EMAIL_VERIFY_TOKEN_EXPIRES:
        return jsonify({"error": "Link de verificação inválido ou expirado."}), 400
    user.email_verified = True
    user.email_verify_token = None
    db.session.commit()
    return jsonify({"message": "E-mail verificado com sucesso!"})


@auth_bp.route("/resend-verification", methods=["POST"])
@jwt_required()
def resend_verification():
    user = User.query.get_or_404(_uid())
    if user.email_verified:
        return jsonify({"message": "Este e-mail já está verificado."})
    if user.email_verify_sent_at and datetime.utcnow() - user.email_verify_sent_at < VERIFICATION_RESEND_COOLDOWN:
        return jsonify({"error": "Aguarde um minuto antes de reenviar."}), 429
    _send_verification(user)
    return jsonify({"message": "E-mail de verificação reenviado."})


# ── Two-factor authentication (TOTP) ────────────────────────────────────────

@auth_bp.route("/2fa/setup", methods=["POST"])
@jwt_required()
def setup_2fa():
    user = User.query.get_or_404(_uid())
    if user.totp_enabled:
        return jsonify({"error": "A autenticação em duas etapas já está ativada."}), 400

    secret = pyotp.random_base32()
    user.totp_secret = secret  # not active until /2fa/enable confirms a code
    db.session.commit()

    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="Minhas Finanças")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_code = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    return jsonify({"secret": secret, "otpauth_uri": uri, "qr_code": qr_code})


@auth_bp.route("/2fa/enable", methods=["POST"])
@jwt_required()
def enable_2fa():
    user = User.query.get_or_404(_uid())
    data = request.get_json(force=True)
    code = (data.get("code") or "").strip()

    if not user.totp_secret:
        return jsonify({"error": "Inicie a configuração do 2FA primeiro."}), 400
    if not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
        return jsonify({"error": "Código inválido."}), 400

    user.totp_enabled = True
    db.session.commit()
    return jsonify(user.to_dict())


@auth_bp.route("/2fa/disable", methods=["POST"])
@jwt_required()
def disable_2fa():
    user = User.query.get_or_404(_uid())
    data = request.get_json(force=True)
    if not user.check_password(data.get("password", "")):
        return jsonify({"error": "Senha incorreta."}), 403

    user.totp_enabled = False
    user.totp_secret = None
    db.session.commit()
    return jsonify(user.to_dict())
