import os
import sys

# Garante que o diretório do app.py esteja no path, independente de onde for executado
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Use the OS certificate store (via truststore) instead of certifi's bundled
# CAs for all outbound HTTPS (e.g. the OpenAI API). Needed on networks with a
# TLS-inspecting corporate proxy whose root CA isn't in certifi's bundle but
# is trusted by the OS — harmless elsewhere, since it just adds the OS store
# as a trust source.
import truststore
truststore.inject_into_ssl()

from dotenv import load_dotenv
# Local dev convenience — reads backend/.env if present (e.g. OPENAI_API_KEY).
# Never overrides a real environment variable already set (production sets
# these directly, no .env file is deployed there).
load_dotenv()

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException
from flask_cors import CORS
from extensions import db, jwt, limiter
from routes import bp as api_bp
from auth import auth_bp
from agent import ai_bp


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
        _add_column_if_missing(conn, "credit_purchases", "type", "VARCHAR(12) NOT NULL DEFAULT 'pontual'")
        _add_column_if_missing(conn, "credit_purchases", "frequency", "VARCHAR(10)")
        _add_column_if_missing(conn, "credit_purchases", "recurrence_end_type", "VARCHAR(20)")
        _add_column_if_missing(conn, "credit_purchases", "recurrence_end_date", "DATE")
        _add_column_if_missing(conn, "credit_purchases", "recurrence_count", "INTEGER")
        _add_column_if_missing(conn, "users", "active_plan_id", "INTEGER REFERENCES plans(id)")
        _add_column_if_missing(conn, "transactions", "plan_id", "INTEGER REFERENCES plans(id)")
        _add_column_if_missing(conn, "transactions", "account_id", "INTEGER REFERENCES accounts(id)")
        _add_column_if_missing(conn, "credit_cards", "plan_id", "INTEGER REFERENCES plans(id)")
        _add_column_if_missing(conn, "credit_cards", "account_id", "INTEGER REFERENCES accounts(id)")
        _add_column_if_missing(conn, "credit_purchases", "plan_id", "INTEGER REFERENCES plans(id)")
        _add_column_if_missing(conn, "card_charges", "plan_id", "INTEGER REFERENCES plans(id)")
        # DEFAULT true here (unlike the model's Python-side default=False) is
        # intentional: it only backfills EXISTING rows on this ALTER TABLE,
        # grandfathering already-registered users as verified. New signups
        # always pass email_verified=False explicitly in auth.py::register().
        _add_column_if_missing(conn, "users", "email_verified", "BOOLEAN NOT NULL DEFAULT true")
        _add_column_if_missing(conn, "users", "email_verify_token", "VARCHAR(64)")
        _add_column_if_missing(conn, "users", "email_verify_sent_at", "TIMESTAMP")
        _add_column_if_missing(conn, "users", "totp_secret", "VARCHAR(32)")
        _add_column_if_missing(conn, "users", "totp_enabled", "BOOLEAN NOT NULL DEFAULT false")
        _add_column_if_missing(conn, "ai_messages", "conversation_id", "INTEGER REFERENCES ai_conversations(id)")
        _add_column_if_missing(conn, "ai_conversations", "model", "VARCHAR(60)")
        _add_column_if_missing(conn, "users", "terms_accepted_at", "TIMESTAMP")


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


def _migrate_users_to_plans(database):
    """
    One-time, per-user migration: give every user without an active_plan_id
    a default Plan ("Plano principal") and Account ("Conta principal",
    balance = their old Settings.initial_balance), then backfill plan_id
    (and account_id, for Transactions) onto everything they already have —
    including anything _migrate_legacy_credit_transactions just created, so
    this must run after it.

    Each user is migrated in its own transaction: create the Plan/Account
    speculatively, then atomically claim active_plan_id — if another
    Gunicorn worker claimed it first, roll back (discarding the speculative
    rows) and move on. Same spirit as the atomic claim in
    _migrate_legacy_credit_transactions, adapted because here the "claim
    value" (the new plan's id) doesn't exist until after we create it.
    """
    from models import User, Settings, Transaction, CreditCard, CreditPurchase, CardCharge, Plan, Account

    candidate_ids = [
        uid for (uid,) in db.session.query(User.id).filter(User.active_plan_id.is_(None)).all()
    ]

    for uid in candidate_ids:
        settings = Settings.query.filter_by(user_id=uid).first()
        initial_balance = settings.initial_balance if settings else 0

        plan = Plan(user_id=uid, name="Plano principal")
        database.session.add(plan)
        database.session.flush()  # need plan.id

        account = Account(plan_id=plan.id, name="Conta principal", initial_balance=initial_balance)
        database.session.add(account)
        database.session.flush()  # need account.id

        result = database.session.execute(
            User.__table__.update()
            .where(User.id == uid, User.active_plan_id.is_(None))
            .values(active_plan_id=plan.id)
        )
        if result.rowcount == 0:
            # Another worker already migrated this user — discard our speculative plan/account.
            database.session.rollback()
            continue

        database.session.execute(
            Transaction.__table__.update()
            .where(Transaction.user_id == uid)
            .values(plan_id=plan.id, account_id=account.id)
        )
        database.session.execute(
            CreditCard.__table__.update().where(CreditCard.user_id == uid).values(plan_id=plan.id)
        )
        database.session.execute(
            CreditPurchase.__table__.update().where(CreditPurchase.user_id == uid).values(plan_id=plan.id)
        )
        database.session.execute(
            CardCharge.__table__.update().where(CardCharge.user_id == uid).values(plan_id=plan.id)
        )
        database.session.commit()


def _migrate_ensure_default_accounts(database):
    """
    Transactions now require an account (see routes.py::_validate_transaction),
    so every plan needs at least one to remain usable. Covers two gaps left
    by older code: (1) a plan created before this rule existed might have
    zero accounts — give it a default one; (2) any Transaction still missing
    account_id gets backfilled onto its plan's oldest account, so the "every
    transaction has an account" invariant holds for old data too, not just
    new entries going forward.
    """
    from models import Plan, Account, Transaction

    plan_ids_without_accounts = [
        pid for (pid,) in
        db.session.query(Plan.id)
        .outerjoin(Account, Account.plan_id == Plan.id)
        .filter(Account.id.is_(None))
        .all()
    ]
    for pid in plan_ids_without_accounts:
        database.session.add(Account(plan_id=pid, name="Conta principal", initial_balance=0))
    if plan_ids_without_accounts:
        database.session.commit()

    orphan_plan_ids = [
        pid for (pid,) in
        db.session.query(Transaction.plan_id)
        .filter(Transaction.account_id.is_(None), Transaction.plan_id.isnot(None))
        .distinct()
        .all()
    ]
    for pid in orphan_plan_ids:
        default_account = Account.query.filter_by(plan_id=pid).order_by(Account.created_at).first()
        if not default_account:
            continue
        database.session.execute(
            Transaction.__table__.update()
            .where(Transaction.plan_id == pid, Transaction.account_id.is_(None))
            .values(account_id=default_account.id)
        )
    if orphan_plan_ids:
        database.session.commit()


def _migrate_ai_messages_to_conversations(database):
    """
    One-time migration: AiMessage predates AiConversation (the whole history
    used to be a single unbroken thread per plan). Any row still missing a
    conversation_id gets grouped by (user_id, plan_id) into one new
    AiConversation each, titled from that group's first user message, so
    pre-existing chat history doesn't just vanish from the sidebar.
    """
    from models import AiMessage, AiConversation

    orphan_groups = (
        db.session.query(AiMessage.user_id, AiMessage.plan_id)
        .filter(AiMessage.conversation_id.is_(None))
        .distinct()
        .all()
    )

    for uid, pid in orphan_groups:
        msgs = (
            AiMessage.query
            .filter_by(user_id=uid, plan_id=pid, conversation_id=None)
            .order_by(AiMessage.created_at)
            .all()
        )
        if not msgs:
            continue

        first_user_msg = next((m for m in msgs if m.role == "user"), msgs[0])
        title = (first_user_msg.content or "Conversa")[:60]

        conversation = AiConversation(user_id=uid, plan_id=pid, title=title, updated_at=msgs[-1].created_at)
        database.session.add(conversation)
        database.session.flush()  # need conversation.id

        database.session.execute(
            AiMessage.__table__.update()
            .where(AiMessage.id.in_([m.id for m in msgs]))
            .values(conversation_id=conversation.id)
        )
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

    jwt_secret = os.environ.get("JWT_SECRET_KEY")
    if not jwt_secret:
        # No fallback to a fixed string here on purpose — a hardcoded
        # secret checked into source lets anyone forge a token for any
        # user id. A random one still lets local/dev boot without config
        # (it just invalidates existing tokens on every restart, same as
        # today), while production always sets JWT_SECRET_KEY for real
        # (see infra/main.tf's Secrets Manager wiring).
        import secrets as _secrets
        jwt_secret = _secrets.token_hex(32)
    app.config["JWT_SECRET_KEY"] = jwt_secret
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 60 * 60 * 24 * 14  # 14 dias

    # Comma-separated list of allowed origins in production (e.g. the
    # Cloudflare Pages domain). Falls back to "*" for local development.
    cors_origins = os.environ.get("CORS_ORIGINS", "*")
    origins = [o.strip() for o in cors_origins.split(",")] if cors_origins != "*" else "*"
    # No supports_credentials — auth is a Bearer header (see api/client.js),
    # never cookies, so the browser never needs credentialed CORS mode.
    CORS(app, origins=origins)
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(ai_bp, url_prefix="/api/ai")

    @app.errorhandler(HTTPException)
    def _json_http_error(e):
        # Every other error path in this API already returns JSON (via
        # jsonify(...)) — an abort(...)-raised HTTPException is the one
        # exception, so normalize it too instead of Flask's default HTML
        # error page, which the frontend's fetch client can't parse as JSON.
        return jsonify({"error": e.description}), e.code

    with app.app_context():
        db.create_all()
        _migrate(db)
        _migrate_legacy_credit_transactions(db)
        _migrate_users_to_plans(db)
        _migrate_ensure_default_accounts(db)
        _migrate_ai_messages_to_conversations(db)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5000)
