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
        }


class Settings(db.Model):
    __tablename__ = "settings"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
    initial_balance = db.Column(db.Numeric(12, 2), default=0)
    initial_balance_date = db.Column(db.Date, nullable=True)
    currency = db.Column(db.String(10), nullable=False, default="BRL")
    language = db.Column(db.String(10), nullable=False, default="pt-BR")

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
