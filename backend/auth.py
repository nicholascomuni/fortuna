import re
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from extensions import db
from models import User

auth_bp = Blueprint("auth", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_register(data):
    errors = []
    if not data.get("name", "").strip():
        errors.append("Nome é obrigatório.")
    email = data.get("email", "").strip().lower()
    if not EMAIL_RE.match(email):
        errors.append("E-mail inválido.")
    if len(data.get("password", "")) < 6:
        errors.append("A senha deve ter pelo menos 6 caracteres.")
    return errors, email


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True)
    errors, email = _validate_register(data)
    if errors:
        return jsonify({"errors": errors}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"errors": ["Este e-mail já está cadastrado."]}), 409

    user = User(name=data["name"].strip(), email=email)
    user.set_password(data["password"])
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"errors": ["E-mail ou senha incorretos."]}), 401

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()})


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    uid = int(get_jwt_identity())
    user = User.query.get_or_404(uid)
    return jsonify(user.to_dict())
