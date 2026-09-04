#!/usr/bin/env python3
"""
Import scripts/prod_export.json (from export_prod_data.py) into your local
dev backend (http://localhost:5000).

Replays the data through the app's own API instead of writing SQLite
directly, so business logic (credit card invoices, interest children) is
regenerated correctly rather than duplicated.

Usage:
    python scripts/import_local_data.py
"""
import json
import urllib.error
import urllib.request
from pathlib import Path

LOCAL_API = "http://localhost:5000/api"
IN_FILE = Path(__file__).parent / "prod_export.json"
LOCAL_PASSWORD = "local-dev-only"  # only ever used against your own localhost


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(LOCAL_API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())
    except urllib.error.URLError:
        print("Não consegui conectar em http://localhost:5000 — o backend local está rodando?")
        raise SystemExit(1)


def get_or_create_local_user(email):
    status, body = call("POST", "/auth/login", {"email": email, "password": LOCAL_PASSWORD})
    if status == 200:
        print(f"Login local OK ({email}).")
        return body["token"]

    status, body = call("POST", "/auth/register", {
        "name": email.split("@")[0], "email": email, "password": LOCAL_PASSWORD,
    })
    if status != 201:
        print(f"Falha ao criar usuário local: {body}")
        raise SystemExit(1)
    print(f"Usuário local criado ({email} / senha: {LOCAL_PASSWORD}).")
    return body["token"]


def main():
    if not IN_FILE.exists():
        print(f"{IN_FILE} não existe. Rode primeiro: python scripts/export_prod_data.py")
        raise SystemExit(1)
    export = json.loads(IN_FILE.read_text(encoding="utf-8"))

    token = get_or_create_local_user(export["email"])

    # Settings
    s = export["settings"]
    call("PUT", "/settings", {
        "initial_balance": s["initial_balance"],
        "initial_balance_date": s["initial_balance_date"],
        "currency": s["currency"],
        "language": s["language"],
    }, token=token)
    print("Saldo inicial importado.")

    # Cards -- keep a prod_id -> local_id map for the purchases step
    card_id_map = {}
    for c in export["cards"]:
        status, new_card = call("POST", "/cards", {
            "name": c["name"], "bank": c["bank"], "due_day": c["due_day"],
            "credit_limit": c["credit_limit"], "color": c["color"],
        }, token=token)
        if status != 201:
            print(f"Falha ao criar cartão {c['name']}: {new_card}")
            continue
        card_id_map[c["id"]] = new_card["id"]
    print(f"{len(card_id_map)} cartões importados.")

    # Credit purchases -- POST regenerates charges + invoice transactions
    imported_purchases = 0
    for p in export["credit_purchases"]:
        local_card_id = card_id_map.get(p["card_id"])
        if local_card_id is None:
            print(f"Pulando compra '{p['description']}': cartão original não foi importado.")
            continue
        status, _ = call("POST", "/credit-purchases", {
            "description": p["description"], "total_amount": p["total_amount"],
            "category": p["category"], "purchase_date": p["purchase_date"],
            "installments": p["installments"], "card_id": local_card_id,
        }, token=token)
        if status == 201:
            imported_purchases += 1
        else:
            print(f"Falha ao importar compra '{p['description']}': status {status}")
    print(f"{imported_purchases} compras no cartão importadas (faturas geradas automaticamente).")

    # Plain transactions -- skip auto-generated invoices and interest children
    # (both are regenerated: invoices by the purchases above, interest
    # children by re-creating their parent transaction).
    imported_tx = 0
    for t in export["transactions"]:
        if t.get("source") == "credit_invoice" or t.get("is_interest_child"):
            continue
        payload = {
            "description": t["description"], "amount": t["amount"], "kind": t["kind"],
            "type": t["type"], "date": t["date"], "category": t["category"],
            "payment_method": t["payment_method"], "interest_rate": t["interest_rate"],
            "interest_period": t["interest_period"], "interest_count": t["interest_count"],
        }
        if t["type"] == "recorrente":
            payload["frequency"] = t["frequency"]
            payload["recurrence_end_type"] = t["recurrence_end_type"]
            payload["recurrence_end_date"] = t["recurrence_end_date"]
            payload["recurrence_count"] = t["recurrence_count"]
        status, body = call("POST", "/transactions", payload, token=token)
        if status == 201:
            imported_tx += 1
        else:
            print(f"Falha ao importar transação '{t['description']}': {body}")
    print(f"{imported_tx} movimentações importadas.")

    print(f"\nPronto. Login local: {export['email']} / {LOCAL_PASSWORD}")


if __name__ == "__main__":
    main()
