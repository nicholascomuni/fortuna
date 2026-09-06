from datetime import datetime
from extensions import db
import bcrypt


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Which Plan's data the user is currently viewing/editing.
    active_plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=True)

    # Email verification. Default False at the Python/ORM level (fresh installs,
    # new registrations) — existing installs grandfather their current users to
    # verified via the boot-time ALTER TABLE default (see app.py::_migrate), so
    # this requirement only applies going forward, not retroactively.
    email_verified = db.Column(db.Boolean, nullable=False, default=False)
    email_verify_token = db.Column(db.String(64), nullable=True)
    email_verify_sent_at = db.Column(db.DateTime, nullable=True)

    # When the user accepted the Terms of Use / Privacy Policy at signup.
    # Nullable so existing accounts from before this field existed aren't
    # retroactively marked as having accepted anything they never saw.
    terms_accepted_at = db.Column(db.DateTime, nullable=True)

    # TOTP-based two-factor authentication (Google Authenticator, Authy, etc.)
    totp_secret = db.Column(db.String(32), nullable=True)
    totp_enabled = db.Column(db.Boolean, nullable=False, default=False)

    transactions = db.relationship("Transaction", backref="user", lazy=True, cascade="all, delete-orphan")
    settings = db.relationship("Settings", backref="user", uselist=False, cascade="all, delete-orphan")
    plans = db.relationship("Plan", backref="user", lazy=True, cascade="all, delete-orphan", foreign_keys="Plan.user_id")
    active_plan = db.relationship("Plan", foreign_keys=[active_plan_id])

    def set_password(self, plain: str):
        self.password_hash = bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

    def check_password(self, plain: str) -> bool:
        return bcrypt.checkpw(plain.encode(), self.password_hash.encode())

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "active_plan": self.active_plan.to_dict() if self.active_plan_id else None,
            "email_verified": bool(self.email_verified),
            "totp_enabled": bool(self.totp_enabled),
        }


class Plan(db.Model):
    """A self-contained 'plano de contas' — its own accounts, transactions and cards."""
    __tablename__ = "plans"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    accounts = db.relationship("Account", backref="plan", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "created_at": self.created_at.isoformat()}


class PlanShare(db.Model):
    """
    Grants another user (identified by email — they may not have registered
    yet) access to a Plan the caller owns, at a given permission level.
    Resolved by email at read-time rather than a stored user_id, so sharing
    with someone who signs up later just works once their email matches.
    """
    __tablename__ = "plan_shares"

    id = db.Column(db.Integer, primary_key=True)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    permission = db.Column(db.String(10), nullable=False, default="read")  # 'read' | 'edit'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "plan_id": self.plan_id,
            "email": self.email,
            "permission": self.permission,
            "created_at": self.created_at.isoformat(),
        }


class Account(db.Model):
    """A bank account inside a Plan. Transactions may optionally point to one."""
    __tablename__ = "accounts"

    id = db.Column(db.Integer, primary_key=True)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    bank = db.Column(db.String(80), nullable=True)
    initial_balance = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "bank": self.bank,
            "initial_balance": float(self.initial_balance),
            "created_at": self.created_at.isoformat(),
        }


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=True)
    account_id = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    kind = db.Column(db.String(10), nullable=False)       # 'receita' | 'despesa'
    type = db.Column(db.String(12), nullable=False)       # 'pontual' | 'recorrente'
    date = db.Column(db.Date, nullable=False)
    category = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Recurrence fields
    frequency = db.Column(db.String(10), nullable=True)
    recurrence_end_type = db.Column(db.String(20), nullable=True)
    recurrence_end_date = db.Column(db.Date, nullable=True)
    recurrence_count = db.Column(db.Integer, nullable=True)

    # Payment fields
    payment_method = db.Column(db.String(20), nullable=True, default="a_vista")
    installments = db.Column(db.Integer, nullable=True)

    # Compound interest
    interest_rate = db.Column(db.Float, nullable=True)       # % per period
    interest_period = db.Column(db.String(10), nullable=True) # 'mensal' | 'anual'
    interest_count = db.Column(db.Integer, nullable=True)     # number of periods

    # Interest child link
    parent_id = db.Column(db.Integer, db.ForeignKey("transactions.id"), nullable=True)
    is_interest_child = db.Column(db.Boolean, nullable=False, default=False)

    # System-managed origin (e.g. auto-generated credit card invoice payment)
    source = db.Column(db.String(20), nullable=True)              # None | "credit_invoice"
    source_card_id = db.Column(db.Integer, db.ForeignKey("credit_cards.id"), nullable=True)

    children = db.relationship(
        "Transaction",
        backref=db.backref("parent", remote_side="Transaction.id"),
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys="Transaction.parent_id",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "description": self.description,
            "amount": float(self.amount),
            "kind": self.kind,
            "type": self.type,
            "date": self.date.strftime("%Y-%m-%d"),
            "category": self.category,
            "created_at": self.created_at.isoformat(),
            "frequency": self.frequency,
            "recurrence_end_type": self.recurrence_end_type,
            "recurrence_end_date": (
                self.recurrence_end_date.strftime("%Y-%m-%d")
                if self.recurrence_end_date else None
            ),
            "recurrence_count": self.recurrence_count,
            "payment_method": self.payment_method or "a_vista",
            "installments": self.installments,
            "interest_rate": self.interest_rate,
            "interest_period": self.interest_period,
            "interest_count": self.interest_count,
            "parent_id": self.parent_id,
            "is_interest_child": bool(self.is_interest_child),
            "source": self.source,
            "source_card_id": self.source_card_id,
            "account_id": self.account_id,
        }


class Settings(db.Model):
    __tablename__ = "settings"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
    initial_balance = db.Column(db.Numeric(12, 2), default=0)
    initial_balance_date = db.Column(db.Date, nullable=True)
    currency = db.Column(db.String(10), nullable=False, default="BRL")
    language = db.Column(db.String(10), nullable=False, default="pt-BR")
    credit_migration_done = db.Column(db.Boolean, nullable=False, default=False)

    def to_dict(self):
        return {
            "initial_balance": float(self.initial_balance),
            "initial_balance_date": (
                self.initial_balance_date.strftime("%Y-%m-%d")
                if self.initial_balance_date else None
            ),
            "currency": self.currency or "BRL",
            "language": self.language or "pt-BR",
        }


class CreditCard(db.Model):
    __tablename__ = "credit_cards"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=True)
    account_id = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=True)  # pays the invoice
    name = db.Column(db.String(80), nullable=False)
    bank = db.Column(db.String(80), nullable=True)
    due_day = db.Column(db.Integer, nullable=False)
    credit_limit = db.Column(db.Numeric(12, 2), nullable=True)
    color = db.Column(db.String(20), nullable=True)
    is_migrated_placeholder = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    purchases = db.relationship("CreditPurchase", backref="card", lazy=True)
    charges = db.relationship("CardCharge", backref="card", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "bank": self.bank,
            "due_day": self.due_day,
            "credit_limit": float(self.credit_limit) if self.credit_limit is not None else None,
            "color": self.color,
            "is_migrated_placeholder": bool(self.is_migrated_placeholder),
            "created_at": self.created_at.isoformat(),
            "account_id": self.account_id,
        }


class CreditPurchase(db.Model):
    __tablename__ = "credit_purchases"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=True)
    card_id = db.Column(db.Integer, db.ForeignKey("credit_cards.id"), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    total_amount = db.Column(db.Numeric(12, 2), nullable=False)
    category = db.Column(db.String(100), nullable=True)
    purchase_date = db.Column(db.Date, nullable=False)
    installments = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Recurrence — mirrors Transaction's recurrence fields. 'pontual' keeps
    # today's installment behavior; 'recorrente' charges the full amount
    # every period instead of splitting it.
    type = db.Column(db.String(12), nullable=False, default="pontual")
    frequency = db.Column(db.String(10), nullable=True)
    recurrence_end_type = db.Column(db.String(20), nullable=True)
    recurrence_end_date = db.Column(db.Date, nullable=True)
    recurrence_count = db.Column(db.Integer, nullable=True)

    charges = db.relationship(
        "CardCharge", backref="purchase", lazy=True,
        cascade="all, delete-orphan", order_by="CardCharge.installment_number",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "card_id": self.card_id,
            "description": self.description,
            "total_amount": float(self.total_amount),
            "category": self.category,
            "purchase_date": self.purchase_date.strftime("%Y-%m-%d"),
            "installments": self.installments,
            "created_at": self.created_at.isoformat(),
            "type": self.type or "pontual",
            "frequency": self.frequency,
            "recurrence_end_type": self.recurrence_end_type,
            "recurrence_end_date": (
                self.recurrence_end_date.strftime("%Y-%m-%d")
                if self.recurrence_end_date else None
            ),
            "recurrence_count": self.recurrence_count,
            "charges": [c.to_dict() for c in self.charges],
        }


class AiConversation(db.Model):
    """One AI assistant chat thread — a plan can have many, like ChatGPT/Claude's history sidebar."""
    __tablename__ = "ai_conversations"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=False)
    title = db.Column(db.String(120), nullable=True)  # set from the first user message once sent
    model = db.Column(db.String(60), nullable=True)  # chat model id (agent/model_registry.py); None -> default model
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

    messages = db.relationship(
        "AiMessage", backref="conversation", lazy=True,
        cascade="all, delete-orphan", order_by="AiMessage.created_at",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "model": self.model,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class AiMessage(db.Model):
    """One turn of the AI assistant chat, belonging to a conversation."""
    __tablename__ = "ai_messages"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=False)
    conversation_id = db.Column(db.Integer, db.ForeignKey("ai_conversations.id"), nullable=True)
    role = db.Column(db.String(10), nullable=False)  # 'user' | 'assistant'
    content = db.Column(db.Text, nullable=False)
    # JSON array of proposed mutations awaiting user confirmation, e.g.
    # [{"id": "...", "tool": "create_transaction", "arguments": {...}, "status": "pending"}]
    pending_actions = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        import json
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "role": self.role,
            "content": self.content,
            "pending_actions": json.loads(self.pending_actions) if self.pending_actions else None,
            "created_at": self.created_at.isoformat(),
        }


class CardCharge(db.Model):
    __tablename__ = "card_charges"

    id = db.Column(db.Integer, primary_key=True)
    purchase_id = db.Column(db.Integer, db.ForeignKey("credit_purchases.id"), nullable=False)
    card_id = db.Column(db.Integer, db.ForeignKey("credit_cards.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    plan_id = db.Column(db.Integer, db.ForeignKey("plans.id"), nullable=True)
    installment_number = db.Column(db.Integer, nullable=False)
    billing_date = db.Column(db.Date, nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "purchase_id": self.purchase_id,
            "card_id": self.card_id,
            "installment_number": self.installment_number,
            "billing_date": self.billing_date.strftime("%Y-%m-%d"),
            "amount": float(self.amount),
        }
