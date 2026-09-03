import os
import sys

# Garante que o diretório do app.py esteja no path, independente de onde for executado
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from extensions import db, jwt
from routes import bp as api_bp
from auth import auth_bp


def _add_column_if_missing(conn, table: str, column: str, ddl: str):
    """
    Add a column, tolerating a concurrent worker having just added it.

    Gunicorn boots multiple workers that each call create_app() at roughly
    the same time; a column-existence check followed by a separate ALTER is
    not atomic, so two workers can both see the column missing and race to
    add it. Only one wins — the other must not crash the whole worker (which
    is what happened in production: the losing worker's DuplicateColumn
    exception failed the app boot and triggered an App Runner rollback).
    """
    from sqlalchemy import text, inspect as sa_inspect
    from sqlalchemy.exc import ProgrammingError, OperationalError

    insp = sa_inspect(conn)
    existing = {c["name"] for c in insp.get_columns(table)}
    if column in existing:
        return
    try:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
        conn.commit()
    except (ProgrammingError, OperationalError):
        # Another worker already added it concurrently — safe to ignore.
        conn.rollback()


def _migrate(database):
    """Add columns introduced after initial schema creation."""
    with database.engine.connect() as conn:
        _add_column_if_missing(conn, "settings", "currency", "VARCHAR(10) NOT NULL DEFAULT 'BRL'")
        _add_column_if_missing(conn, "settings", "language", "VARCHAR(10) NOT NULL DEFAULT 'pt-BR'")
        _add_column_if_missing(conn, "settings", "credit_migration_done", "BOOLEAN NOT NULL DEFAULT false")
        _add_column_if_missing(conn, "transactions", "interest_rate", "FLOAT")
        _add_column_if_missing(conn, "transactions", "interest_period", "VARCHAR(10)")
        _add_column_if_missing(conn, "transactions", "interest_count", "INTEGER")
        _add_column_if_missing(conn, "transactions", "parent_id", "INTEGER REFERENCES transactions(id)")
        _add_column_if_missing(conn, "transactions", "is_interest_child", "BOOLEAN NOT NULL DEFAULT false")
        _add_column_if_missing(conn, "transactions", "source", "VARCHAR(20)")
        _add_column_if_missing(conn, "transactions", "source_card_id", "INTEGER REFERENCES credit_cards(id)")


def _migrate_legacy_credit_transactions(database):
    """
    One-time, per-user migration of the old payment_method="credito" hack
    (Transaction rows, possibly forced into type="recorrente" for installments)
    into the new CreditCard / CreditPurchase / CardCharge model.
    """
    from datetime import date as _date
    from dateutil.relativedelta import relativedelta
    from models import User, Settings, Transaction, CreditCard, CreditPurchase, CardCharge
    import credit_cards as cc

    # Claim each user's migration with an atomic UPDATE before doing any work.
    # Gunicorn boots multiple workers that each call create_app() at roughly
    # the same time; only the worker whose UPDATE actually flips a row from
    # false->true (rowcount == 1) proceeds — this avoids two workers both
    # reading credit_migration_done=false and duplicating the migration.
    candidate_ids = [
        uid for (uid,) in
        db.session.query(User.id).join(Settings).filter(Settings.credit_migration_done.is_(False)).all()
    ]
    claimed_ids = []
    for uid in candidate_ids:
        result = db.session.execute(
            Settings.__table__.update()
            .where(Settings.user_id == uid, Settings.credit_migration_done.is_(False))
            .values(credit_migration_done=True)
        )
        if result.rowcount == 1:
            claimed_ids.append(uid)
    database.session.commit()

    users = User.query.filter(User.id.in_(claimed_ids)).all() if claimed_ids else []

    for user in users:
        legacy_txs = (
            Transaction.query.filter_by(user_id=user.id, payment_method="credito")
            .filter(Transaction.is_interest_child.is_(False))
            .all()
        )

        if legacy_txs:
            placeholder_card = CreditCard(
                user_id=user.id,
                name="Cartão (migrado)",
                due_day=10,
                is_migrated_placeholder=True,
            )
            database.session.add(placeholder_card)
            database.session.flush()

            touched_months = set()

            for tx in legacy_txs:
                installments = (
                    tx.recurrence_count
                    if (tx.type == "recorrente" and tx.recurrence_count)
                    else 1
                )
                installments = min(installments, 60)
                total_amount = round(float(tx.amount) * installments, 2)

                purchase = CreditPurchase(
                    user_id=user.id,
                    card_id=placeholder_card.id,
                    description=tx.description,
                    total_amount=total_amount,
                    category=tx.category,
                    purchase_date=tx.date,
                    installments=installments,
                )
                database.session.add(purchase)
                database.session.flush()

                per_installment = round(total_amount / installments, 2)
                current = tx.date
                for n in range(1, installments + 1):
                    amt = (
                        per_installment
                        if n < installments
                        else round(total_amount - per_installment * (installments - 1), 2)
                    )
                    database.session.add(CardCharge(
                        purchase_id=purchase.id,
                        card_id=placeholder_card.id,
                        user_id=user.id,
                        installment_number=n,
                        billing_date=current,
                        amount=amt,
                    ))
                    touched_months.add((current.year, current.month))
                    current = current + relativedelta(months=1)

                database.session.delete(tx)

            database.session.flush()
            for (y, m) in touched_months:
                cc.sync_invoice_transaction(user.id, placeholder_card, y, m)

    database.session.commit()


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
        _migrate_legacy_credit_transactions(db)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5000)
