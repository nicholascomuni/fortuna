import os
import sys

# Garante que o diretório do app.py esteja no path, independente de onde for executado
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from extensions import db, jwt
from routes import bp as api_bp
from auth import auth_bp


def _migrate(database):
    """Add columns introduced after initial schema creation."""
    with database.engine.connect() as conn:
        from sqlalchemy import text, inspect as sa_inspect
        insp = sa_inspect(database.engine)
        settings_cols = {c["name"] for c in insp.get_columns("settings")}
        if "currency" not in settings_cols:
            conn.execute(text("ALTER TABLE settings ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'BRL'"))
        if "language" not in settings_cols:
            conn.execute(text("ALTER TABLE settings ADD COLUMN language VARCHAR(10) NOT NULL DEFAULT 'pt-BR'"))
        tx_cols = {c["name"] for c in insp.get_columns("transactions")}
        if "interest_rate" not in tx_cols:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN interest_rate FLOAT"))
        if "interest_period" not in tx_cols:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN interest_period VARCHAR(10)"))
        if "interest_count" not in tx_cols:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN interest_count INTEGER"))
        if "parent_id" not in tx_cols:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN parent_id INTEGER REFERENCES transactions(id)"))
        if "is_interest_child" not in tx_cols:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN is_interest_child BOOLEAN NOT NULL DEFAULT false"))
        conn.commit()


def create_app():
    app = Flask(__name__)

    db_url = os.environ.get(
        "DATABASE_URL",
        f"sqlite:///{os.path.join(os.path.dirname(__file__), 'finance.db')}",
    )
    # SQLAlchemy 1.4+ dropped support for the legacy "postgres://" scheme
    # that some providers (and older AWS docs) still hand out.
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Change this to a long random string in production
    app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "dev-secret-mude-em-producao")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 60 * 60 * 24 * 30  # 30 dias

    # Comma-separated list of allowed origins in production (e.g. the
    # Cloudflare Pages domain). Falls back to "*" for local development.
    cors_origins = os.environ.get("CORS_ORIGINS", "*")
    origins = [o.strip() for o in cors_origins.split(",")] if cors_origins != "*" else "*"
    CORS(app, origins=origins, supports_credentials=True)
    db.init_app(app)
    jwt.init_app(app)

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(api_bp, url_prefix="/api")

    with app.app_context():
        db.create_all()
        _migrate(db)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5000)
