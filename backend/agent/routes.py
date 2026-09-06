from flask import Blueprint, jsonify, request, Response, stream_with_context
from flask_jwt_extended import jwt_required

from extensions import db
from models import AiConversation, AiMessage
import routes as api_routes

from .actions import execute_pending_actions
from .model_registry import AVAILABLE_MODELS, get_model_config, resolve_model_id
from .runner import run_agent_turn, run_agent_turn_stream

ai_bp = Blueprint("ai", __name__)


@ai_bp.route("/models", methods=["GET"])
@jwt_required()
def list_models():
    return jsonify(AVAILABLE_MODELS)


@ai_bp.route("/conversations", methods=["GET"])
@jwt_required()
def list_conversations():
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    rows = (
        AiConversation.query.filter_by(user_id=uid, plan_id=pid)
        .order_by(AiConversation.updated_at.desc())
        .limit(200)
        .all()
    )
    return jsonify([c.to_dict() for c in rows])


@ai_bp.route("/conversations", methods=["POST"])
@jwt_required()
def create_conversation():
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    data = request.get_json(silent=True) or {}
    requested_model = data.get("model")
    model = requested_model if get_model_config(requested_model) and get_model_config(requested_model)["enabled"] else None
    conversation = AiConversation(user_id=uid, plan_id=pid, model=model)
    db.session.add(conversation)
    db.session.commit()
    return jsonify(conversation.to_dict()), 201


@ai_bp.route("/conversations/<int:conversation_id>", methods=["PATCH"])
@jwt_required()
def update_conversation(conversation_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    conversation = AiConversation.query.filter_by(id=conversation_id, user_id=uid, plan_id=pid).first_or_404()
    data = request.get_json(force=True)
    if "model" in data:
        config = get_model_config(data.get("model"))
        if not config or not config["enabled"]:
            return jsonify({"error": "Modelo inválido ou indisponível."}), 400
        conversation.model = data["model"]
        db.session.commit()
    return jsonify(conversation.to_dict())


@ai_bp.route("/conversations/<int:conversation_id>", methods=["DELETE"])
@jwt_required()
def delete_conversation(conversation_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    conversation = AiConversation.query.filter_by(id=conversation_id, user_id=uid, plan_id=pid).first_or_404()
    db.session.delete(conversation)
    db.session.commit()
    return jsonify({"message": "Conversa excluída."})


@ai_bp.route("/conversations/<int:conversation_id>/messages", methods=["GET"])
@jwt_required()
def list_conversation_messages(conversation_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    AiConversation.query.filter_by(id=conversation_id, user_id=uid, plan_id=pid).first_or_404()
    rows = (
        AiMessage.query.filter_by(conversation_id=conversation_id)
        .order_by(AiMessage.created_at)
        .limit(500)
        .all()
    )
    return jsonify([m.to_dict() for m in rows])


@ai_bp.route("/conversations/<int:conversation_id>/messages", methods=["POST"])
@jwt_required()
def post_conversation_message(conversation_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    conversation = AiConversation.query.filter_by(id=conversation_id, user_id=uid, plan_id=pid).first_or_404()
    data = request.get_json(force=True)
    text = (data.get("content") or "").strip()
    if not text:
        return jsonify({"error": "Mensagem vazia."}), 400
    model_id = resolve_model_id(conversation.model)
    new_msgs = run_agent_turn(uid, pid, conversation, text, model_id)
    return jsonify({"conversation": conversation.to_dict(), "messages": [m.to_dict() for m in new_msgs]}), 201


@ai_bp.route("/conversations/<int:conversation_id>/messages/stream", methods=["POST"])
@jwt_required()
def post_conversation_message_stream(conversation_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    conversation = AiConversation.query.filter_by(id=conversation_id, user_id=uid, plan_id=pid).first_or_404()
    data = request.get_json(force=True)
    text = (data.get("content") or "").strip()
    if not text:
        return jsonify({"error": "Mensagem vazia."}), 400
    model_id = resolve_model_id(conversation.model)

    return Response(
        stream_with_context(run_agent_turn_stream(uid, pid, conversation, text, model_id)),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@ai_bp.route("/messages/<int:message_id>/confirm", methods=["POST"])
@jwt_required()
def confirm_message(message_id):
    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    m = AiMessage.query.filter_by(id=message_id, user_id=uid, plan_id=pid).first_or_404()
    if not m.pending_actions:
        return jsonify({"error": "Esta mensagem não tem ações pendentes."}), 400
    summary = execute_pending_actions(uid, pid, m)
    return jsonify([m.to_dict(), summary.to_dict()])


@ai_bp.route("/messages/<int:message_id>/cancel", methods=["POST"])
@jwt_required()
def cancel_message(message_id):
    import json

    uid = api_routes._uid()
    pid = api_routes._current_plan_id(uid)
    m = AiMessage.query.filter_by(id=message_id, user_id=uid, plan_id=pid).first_or_404()
    if not m.pending_actions:
        return jsonify({"error": "Esta mensagem não tem ações pendentes."}), 400
    pending = json.loads(m.pending_actions)
    for a in pending:
        if a["status"] == "pending":
            a["status"] = "cancelled"
    m.pending_actions = json.dumps(pending)
    cancel_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=m.conversation_id, role="assistant", content="Ok, cancelado — nenhuma alteração foi feita.")
    db.session.add(cancel_msg)
    db.session.commit()
    return jsonify([m.to_dict(), cancel_msg.to_dict()])
