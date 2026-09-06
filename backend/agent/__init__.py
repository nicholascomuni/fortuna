"""
AI chat assistant package — LangChain/LangGraph orchestration, model-agnostic.

See routes.py for the Flask blueprint (ai_bp) and runner.py for the agent
turn orchestration. graph.py holds the LangGraph state machine; tools.py,
executors.py, actions.py and prompts.py hold the business logic that used
to live in a single backend/ai_agent.py file.
"""

from .routes import ai_bp

__all__ = ["ai_bp"]
