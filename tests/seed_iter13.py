# Seeds admin account with TEST_ data for iteration 13 UI tests (swipe delete + cards stack). Run with "clean" arg to remove.
import json
import os
import sys
from datetime import date, timedelta

import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
tok = requests.post(f"{BASE}/api/auth/login", json={"email": "admin@financefocus.app", "password": "admin123"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}


def clean():
    for t in requests.get(f"{BASE}/api/transactions", headers=H).json():
        if (t.get("description") or "").startswith("TEST_"):
            requests.delete(f"{BASE}/api/transactions/{t['id']}", headers=H)
    for r in requests.get(f"{BASE}/api/recurring", headers=H).json():
        if (r.get("description") or "").startswith("TEST_"):
            requests.delete(f"{BASE}/api/recurring/{r['id']}?delete_generated=true", headers=H)
    for c in requests.get(f"{BASE}/api/credit-cards", headers=H).json():
        if c["name"].startswith("TEST_"):
            requests.delete(f"{BASE}/api/credit-cards/{c['id']}", headers=H)


if len(sys.argv) > 1 and sys.argv[1] == "clean":
    clean()
    print("cleaned")
    sys.exit(0)

clean()
today = date.today().isoformat()
out = {}
for k in ["TEST_swipe_one", "TEST_swipe_cancel"]:
    out[k] = requests.post(f"{BASE}/api/transactions", headers=H, json={"amount": 11.11, "type": "expense", "category": "food", "description": k, "date": today}).json()["id"]
start = (date.today() - timedelta(days=14)).isoformat()
for k in ["TEST_recA", "TEST_recB"]:
    rid = requests.post(f"{BASE}/api/recurring", headers=H, json={"amount": 7.77, "type": "expense", "category": "bills", "description": k, "frequency": "weekly", "start_date": start}).json()["id"]
    gen = [t for t in requests.get(f"{BASE}/api/transactions", headers=H).json() if t.get("recurring_rule_id") == rid]
    out[k] = {"rule": rid, "tx": [g["id"] for g in gen]}
cards = []
for n, col in [("TEST_Alpha", "#1E3F32"), ("TEST_Bravo", "#3B2F63"), ("TEST_Charlie", "#7A3E2B")]:
    cards.append(requests.post(f"{BASE}/api/credit-cards", headers=H, json={"name": n, "balance": 500, "credit_limit": 2000, "apr": 20, "statement_day": 10, "color": col}).json()["id"])
out["cards"] = cards
out["card_order"] = [c["id"] + ":" + c["name"] for c in requests.get(f"{BASE}/api/credit-cards", headers=H).json()]
print(json.dumps(out))
