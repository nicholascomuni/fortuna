#!/usr/bin/env python3
"""
Export your production data (Minhas Financas) to a local JSON file.

Run this YOURSELF, in your own terminal. It asks for your production
email/password right here and sends them only to the app's own /auth/login
endpoint -- nothing is shared with Claude or written anywhere else.

Usage:
    python scripts/export_prod_data.py
"""
import getpass
import json
import urllib.error
import urllib.request
from pathlib import Path

PROD_API = "https://qtjzdd6axz.us-east-1.awsapprunner.com/api"
OUT_FILE = Path(__file__).parent / "prod_export.json"


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(PROD_API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def main():
    print(f"Login em {PROD_API}")
    email = input("E-mail: ").strip()
    password = getpass.getpass("Senha: ")

    status, body = call("POST", "/auth/login", {"email": email, "password": password})
    if status != 200:
        print(f"Falha no login ({status}): {body}")
        return
    token = body["token"]
    print("Login OK. Baixando dados...")

    _, settings = call("GET", "/settings", token=token)
    _, transactions = call("GET", "/transactions", token=token)
    _, cards = call("GET", "/cards", token=token)
    _, purchases = call("GET", "/credit-purchases", token=token)

    export = {
        "email": email,
        "settings": settings,
        "transactions": transactions,
        "cards": cards,
        "credit_purchases": purchases,
    }

    OUT_FILE.write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nExportado para {OUT_FILE}")
    print(f"  {len(transactions)} transações")
    print(f"  {len(cards)} cartões")
    print(f"  {len(purchases)} compras no cartão")
    print("\nAgora rode: python scripts/import_local_data.py")


if __name__ == "__main__":
    main()
