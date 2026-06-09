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
        conn.commit()


def create_app():
    app = Flask(__name__)

    db_path = os.environ.get(
        "DATABASE_URL",
        f"sqlite:///{os.path.join(os.path.dirname(__file__), 'finance.db')}",
    )
    app.config["SQLALCHEMY_DATABASE_URI"] = db_path
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Change this to a long random string in production
    app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "dev-secret-mude-em-producao")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 60 * 60 * 24 * 30  # 30 dias

    CORS(app)
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
