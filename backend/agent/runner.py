"""
Agent turn orchestration — loads conversation history, runs the LangGraph
graph (graph.py), and persists whatever AiMessage the turn produces (final
answer, pending-action confirmation, or an error/fallback message). Mirrors
the old ai_agent.py orchestration 1:1, just backed by LangGraph instead of
a hand-rolled while loop, and parameterized by model_id for model-agnosticism.
"""

import json
from datetime import datetime

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.errors import GraphRecursionError

from extensions import db
from models import AiMessage

from .graph import GRAPH, RECURSION_LIMIT
from .prompts import build_system_prompt
from .providers import get_chat_model

MAX_HISTORY = 24

_NOT_CONFIGURED_TEXT = "O assistente de IA ainda não está configurado (falta a chave da API OpenAI no servidor)."
_FALLBACK_TEXT = "Desculpe, não consegui concluir essa solicitação — tente reformular de forma mais direta."


def _build_initial_messages(uid: int, pid: int, conversation) -> list:
    history_rows = (
        AiMessage.query.filter_by(conversation_id=conversation.id)
        .order_by(AiMessage.created_at.desc())
        .limit(MAX_HISTORY)
        .all()
    )
    history_rows.reverse()

    messages = [SystemMessage(content=build_system_prompt(uid, pid))]
    for m in history_rows:
        messages.append(HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content))
    return messages


def _save_user_message(uid, pid, conversation, user_text) -> AiMessage:
    is_first_message = len(conversation.messages) == 0
    user_msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="user", content=user_text)
    db.session.add(user_msg)
    if is_first_message:
        conversation.title = user_text[:60]
    conversation.updated_at = datetime.utcnow()
    db.session.commit()
    return user_msg


def _persist_final_state(uid, pid, conversation, final_state) -> AiMessage:
    pending = final_state.get("pending")
    if pending is not None:
        msg = AiMessage(
            user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant",
            content=final_state.get("final_text") or "", pending_actions=json.dumps(pending),
        )
    else:
        last_ai = final_state["messages"][-1]
        msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant", content=last_ai.content or "")
    db.session.add(msg)
    db.session.commit()
    return msg


def _not_configured_message(uid, pid, conversation) -> AiMessage:
    msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant", content=_NOT_CONFIGURED_TEXT)
    db.session.add(msg)
    db.session.commit()
    return msg


def _error_message(uid, pid, conversation, error) -> AiMessage:
    msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant", content=f"Erro ao consultar a IA: {error}")
    db.session.add(msg)
    db.session.commit()
    return msg


def _fallback_message(uid, pid, conversation) -> AiMessage:
    msg = AiMessage(user_id=uid, plan_id=pid, conversation_id=conversation.id, role="assistant", content=_FALLBACK_TEXT)
    db.session.add(msg)
    db.session.commit()
    return msg


def run_agent_turn(uid: int, pid: int, conversation, user_text: str, model_id: str) -> list:
    user_msg = _save_user_message(uid, pid, conversation, user_text)
    new_messages = [user_msg]

    if get_chat_model(model_id) is None:
        new_messages.append(_not_configured_message(uid, pid, conversation))
        return new_messages

    initial_state = {
        "messages": _build_initial_messages(uid, pid, conversation),
        "uid": uid, "pid": pid, "model_id": model_id,
        "pending": None, "final_text": None,
    }
    try:
        final_state = GRAPH.invoke(initial_state, config={"recursion_limit": RECURSION_LIMIT})
    except GraphRecursionError:
        new_messages.append(_fallback_message(uid, pid, conversation))
        return new_messages
    except Exception as e:
        new_messages.append(_error_message(uid, pid, conversation, e))
        return new_messages

    new_messages.append(_persist_final_state(uid, pid, conversation, final_state))
    return new_messages


def _sse(event_type: str, **data) -> str:
    return f"data: {json.dumps({'type': event_type, **data}, default=str)}\n\n"


def run_agent_turn_stream(uid: int, pid: int, conversation, user_text: str, model_id: str):
    """Same orchestration as run_agent_turn, but streams the model's answer
    token-by-token as SSE 'delta' events. Uses LangGraph's stream_mode
    "messages" to get per-node token chunks (filtered to the call_model
    node — the only one that ever emits assistant text) alongside
    stream_mode "values" to get the full graph state after each step, so
    the last "values" payload has everything needed to persist the turn
    exactly like run_agent_turn does."""
    user_msg = _save_user_message(uid, pid, conversation, user_text)
    yield _sse("message", message=user_msg.to_dict())

    if get_chat_model(model_id) is None:
        msg = _not_configured_message(uid, pid, conversation)
        yield _sse("message", message=msg.to_dict())
        yield _sse("done", conversation=conversation.to_dict())
        return

    initial_state = {
        "messages": _build_initial_messages(uid, pid, conversation),
        "uid": uid, "pid": pid, "model_id": model_id,
        "pending": None, "final_text": None,
    }

    final_state = None
    try:
        for mode, payload in GRAPH.stream(
            initial_state, config={"recursion_limit": RECURSION_LIMIT}, stream_mode=["messages", "values"],
        ):
            if mode == "messages":
                chunk, metadata = payload
                if metadata.get("langgraph_node") == "call_model" and chunk.content:
                    yield _sse("delta", content=chunk.content)
            elif mode == "values":
                final_state = payload
    except GraphRecursionError:
        yield _sse("message", message=_fallback_message(uid, pid, conversation).to_dict())
        yield _sse("done", conversation=conversation.to_dict())
        return
    except Exception as e:
        yield _sse("message", message=_error_message(uid, pid, conversation, e).to_dict())
        yield _sse("done", conversation=conversation.to_dict())
        return

    final_msg = _persist_final_state(uid, pid, conversation, final_state)
    yield _sse("message", message=final_msg.to_dict())
    yield _sse("done", conversation=conversation.to_dict())
