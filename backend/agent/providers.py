"""
Provider dispatch — turns a model id from model_registry into a bound
LangChain chat model. This is the one place that knows about SDK-specific
env vars; everything else (graph.py, runner.py) only ever talks to the
LangChain BaseChatModel interface, which is what makes the rest of the
agent model-agnostic.
"""

import os

from .model_registry import get_model_config

TEMPERATURE = float(os.environ.get("OPENAI_TEMPERATURE", "0.7"))


def _openai_chat_model(model_id: str):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(model=model_id, api_key=api_key, temperature=TEMPERATURE)


def _anthropic_chat_model(model_id: str):
    # Placeholder: model_registry keeps every Anthropic entry `enabled:
    # False` today, so routes.py never lets a request reach this. When
    # Claude support actually ships, install langchain-anthropic, flip the
    # registry entry to enabled, and swap this body for:
    #   from langchain_anthropic import ChatAnthropic
    #   return ChatAnthropic(model=model_id, api_key=os.environ.get("ANTHROPIC_API_KEY"), temperature=TEMPERATURE)
    raise NotImplementedError("Suporte à Anthropic ainda não foi implementado.")


_PROVIDERS = {
    "openai": _openai_chat_model,
    "anthropic": _anthropic_chat_model,
}


def get_chat_model(model_id: str):
    """Returns a bound chat model, or None if its provider isn't configured
    (e.g. missing API key) — callers treat None as "assistant unconfigured"."""
    config = get_model_config(model_id)
    if not config:
        return None
    return _PROVIDERS[config["provider"]](model_id)
