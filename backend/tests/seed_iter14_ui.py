# Seed helper for iteration-14 UI test: creates TEST_ recurring rules (expense+income) next month + real rows this month for admin
import os, sys, json, requests
from datetime import datetime, timezone

B = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
tok = requests.post(f"{B}/api/auth/login", json={"email": "admin@financefocus.app", "password": "admin123"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}

if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
    for r in requests.get(f"{B}/api/recurring", headers=H).json():
        if (r.get("description") or "").startswith("TEST_"):
            requests.delete(f"{B}/api/recurring/{r['id']}?delete_generated=true", headers=H)
    for t in requests.get(f"{B}/api/transactions", headers=H).json():
        if (t.get("description") or "").startswith("TEST_"):
            requests.delete(f"{B}/api/transactions/{t['id']}", headers=H)
    print("cleaned")
    sys.exit(0)

now = datetime.now(timezone.utc)
y, m = (now.year, now.month + 1) if now.month < 12 else (now.year + 1, 1)
start = datetime(y, m, 10, 12, 0, tzinfo=timezone.utc).isoformat()
out = {}
for key, body in {
    "exp": {"amount": 111, "type": "expense", "category": "bills", "description": "TEST_UIRent"},
    "exp2": {"amount": 22, "type": "expense", "category": "bills", "description": "TEST_UIGym"},
    "inc": {"amount": 999, "type": "income", "category": "salary", "description": "TEST_UISalary"},
    "inc2": {"amount": 50, "type": "income", "category": "salary", "description": "TEST_UIBonus"},
}.items():
    r = requests.post(f"{B}/api/recurring", headers=H, json={**body, "frequency": "monthly", "start_date": start})
    out[key] = r.json()["id"]
for key, body in {
    "real_exp": {"amount": 33, "type": "expense", "category": "food", "description": "TEST_UIRealExp", "paid": True},
    "real_inc": {"amount": 44, "type": "income", "category": "salary", "description": "TEST_UIRealInc"},
    "real_del": {"amount": 5, "type": "expense", "category": "food", "description": "TEST_UIRealDel", "paid": True},
}.items():
    out[key] = requests.post(f"{B}/api/transactions", headers=H, json=body).json()["id"]
out["next_month"] = f"{y}-{m:02d}"
print(json.dumps(out))
