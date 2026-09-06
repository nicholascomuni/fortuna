"""
LangGraph state machine for one agent turn.

    call_model ──(no tool_calls)──────────────► END
        ▲  │
        │  └──(only read tool_calls)──► execute_reads ──┐
        │                                                │
        └────────────────────────────────────────────────┘
        │
        └──(any write tool_call)──► confirm_writes ──► END

Read tool calls execute immediately and loop back so the model can use
their results. A write tool call is never executed here — confirm_writes
just serializes it into a pending action for the user to confirm later
(see actions.execute_pending_actions). If a model response mixes read and
write tool calls, the write ones win and the read ones are dropped for
that turn — same rule the old manual loop used.
"""

import json
from typing import Annotated, Literal, Optional, TypedDict

from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from .actions import build_pending_actions
from .executors import READ_EXECUTORS
from .providers import get_chat_model
from .tools import TOOLS, WRITE_TOOL_NAMES

MAX_TOOL_ITERATIONS = 6
RECURSION_LIMIT = MAX_TOOL_ITERATIONS * 2 + 2


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    uid: int
    pid: int
    model_id: str
    pending: Optional[list]
    final_text: Optional[str]


def call_model(state: AgentState):
    model = get_chat_model(state["model_id"]).bind_tools(TOOLS)
    ai_message = model.invoke(state["messages"])
    return {"messages": [ai_message]}


def route_after_model(state: AgentState) -> Literal["reads", "confirm", "end"]:
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    if not tool_calls:
        return "end"
    if any(tc["name"] in WRITE_TOOL_NAMES for tc in tool_calls):
        return "confirm"
    return "reads"


def execute_reads(state: AgentState):
    from langchain_core.messages import ToolMessage

    last = state["messages"][-1]
    tool_messages = []
    for tc in last.tool_calls:
        try:
            result = READ_EXECUTORS[tc["name"]](state["uid"], state["pid"], tc["args"])
        except Exception as e:
            result = {"error": str(e)}
        tool_messages.append(ToolMessage(content=json.dumps(result, default=str)[:8000], tool_call_id=tc["id"]))
    return {"messages": tool_messages}


def confirm_writes(state: AgentState):
    last = state["messages"][-1]
    write_calls = [tc for tc in last.tool_calls if tc["name"] in WRITE_TOOL_NAMES]
    pending, descriptions = build_pending_actions(write_calls)
    prefix = (last.content or "").strip()
    confirm_text = (prefix + "\n\n" if prefix else "") + "\n".join(descriptions) + "\n\nConfirma?"
    return {"pending": pending, "final_text": confirm_text}


_builder = StateGraph(AgentState)
_builder.add_node("call_model", call_model)
_builder.add_node("execute_reads", execute_reads)
_builder.add_node("confirm_writes", confirm_writes)
_builder.set_entry_point("call_model")
_builder.add_conditional_edges("call_model", route_after_model, {
    "reads": "execute_reads",
    "confirm": "confirm_writes",
    "end": END,
})
_builder.add_edge("execute_reads", "call_model")
_builder.add_edge("confirm_writes", END)

GRAPH = _builder.compile()
