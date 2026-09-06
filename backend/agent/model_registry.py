"""
Model-agnostic catalog of chat models the assistant can use.

Each entry is a plain dict — the API surface (GET /api/ai/models) returns
this list almost verbatim, so it doubles as the frontend's source of truth
for what appears in the model dropdown. "enabled" gates both selection here
and in routes.py; a disabled entry (e.g. the Anthropic placeholder) is
still listed so the UI can show it as an upcoming option.
"""

AVAILABLE_MODELS = [
    {"id": "gpt-4o-mini", "label": "GPT-4o mini", "provider": "openai", "enabled": True, "default": True},
    {"id": "gpt-4o", "label": "GPT-4o", "provider": "openai", "enabled": True, "default": False},
    {"id": "claude-sonnet-4.5", "label": "Claude Sonnet (em breve)", "provider": "anthropic", "enabled": False, "default": False},
]

_BY_ID = {m["id"]: m for m in AVAILABLE_MODELS}

DEFAULT_MODEL_ID = next(m["id"] for m in AVAILABLE_MODELS if m["default"])


def get_model_config(model_id: str | None) -> dict | None:
    return _BY_ID.get(model_id)


def resolve_model_id(model_id: str | None) -> str:
    """Falls back to the default model for None, unknown, or disabled ids."""
    config = _BY_ID.get(model_id)
    if config and config["enabled"]:
        return model_id
    return DEFAULT_MODEL_ID
