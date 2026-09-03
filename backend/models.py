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

    transactions = db.relationship("Transaction", backref="user", lazy=True, cascade="all, delete-orphan")
    settings = db.relationship("Settings", backref="user", uselist=False, cascade="all, delete-orphan")

    def set_password(self, plain: str):
        self.password_hash = bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

    def check_password(self, plain: str) -> bool:
        return bcrypt.checkpw(plain.encode(), self.password_hash.encode())

    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email}


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
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
        }


class CreditPurchase(db.Model):
    __tablename__ = "credit_purchases"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    card_id = db.Column(db.Integer, db.ForeignKey("credit_cards.id"), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    total_amount = db.Column(db.Numeric(12, 2), nullable=False)
    category = db.Column(db.String(100), nullable=True)
    purchase_date = db.Column(db.Date, nullable=False)
    installments = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

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
            "charges": [c.to_dict() for c in self.charges],
        }


class CardCharge(db.Model):
    __tablename__ = "card_charges"

    id = db.Column(db.Integer, primary_key=True)
    purchase_id = db.Column(db.Integer, db.ForeignKey("credit_purchases.id"), nullable=False)
    card_id = db.Column(db.Integer, db.ForeignKey("credit_cards.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
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
