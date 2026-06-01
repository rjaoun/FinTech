from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import jwt
import json
import re
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------- ENV / DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
DEFAULT_CATEGORIES = [
    {"id": "food", "name": "Food & Dining", "icon": "restaurant", "color": "#C85A40", "type": "expense"},
    {"id": "transport", "name": "Transport", "icon": "car", "color": "#4A7059", "type": "expense"},
    {"id": "shopping", "name": "Shopping", "icon": "bag", "color": "#D4A574", "type": "expense"},
    {"id": "bills", "name": "Bills & Utilities", "icon": "receipt", "color": "#8B6F47", "type": "expense"},
    {"id": "entertainment", "name": "Entertainment", "icon": "film", "color": "#A55A7E", "type": "expense"},
    {"id": "health", "name": "Health", "icon": "medkit", "color": "#5A8A9C", "type": "expense"},
    {"id": "education", "name": "Education", "icon": "school", "color": "#6B8E7F", "type": "expense"},
    {"id": "travel", "name": "Travel", "icon": "airplane", "color": "#C8955A", "type": "expense"},
    {"id": "groceries", "name": "Groceries", "icon": "basket", "color": "#7A9B6E", "type": "expense"},
    {"id": "other_exp", "name": "Other", "icon": "ellipsis-horizontal", "color": "#787672", "type": "expense"},
    {"id": "salary", "name": "Salary", "icon": "cash", "color": "#1E3F32", "type": "income"},
    {"id": "freelance", "name": "Freelance", "icon": "briefcase", "color": "#4A7059", "type": "income"},
    {"id": "investment", "name": "Investment", "icon": "trending-up", "color": "#6B8E7F", "type": "income"},
    {"id": "gift", "name": "Gift", "icon": "gift", "color": "#A55A7E", "type": "income"},
    {"id": "other_inc", "name": "Other Income", "icon": "add-circle", "color": "#787672", "type": "income"},
]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- AUTH HELPERS ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ---------- MODELS ----------
class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=80)

class LoginBody(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    currency: str = "USD"
    role: str = "user"
    created_at: str

class AuthResponse(BaseModel):
    user: UserOut
    access_token: str

class TransactionIn(BaseModel):
    amount: float
    type: Literal["income", "expense"]
    category: str
    description: str = ""
    date: Optional[str] = None  # ISO string

class TransactionOut(TransactionIn):
    id: str
    user_id: str
    created_at: str
    recurring_rule_id: Optional[str] = None

RECURRING_FREQUENCIES = ("daily", "weekly", "biweekly", "monthly", "quarterly", "yearly")

class RecurringIn(BaseModel):
    amount: float
    type: Literal["income", "expense"]
    category: str
    description: str = ""
    frequency: Literal["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]
    start_date: Optional[str] = None  # ISO YYYY-MM-DD; defaults to today
    end_date: Optional[str] = None  # ISO YYYY-MM-DD; optional stop date

class RecurringOut(BaseModel):
    id: str
    user_id: str
    amount: float
    type: str
    category: str
    description: str
    frequency: str
    start_date: str
    end_date: Optional[str] = None
    next_date: str
    active: bool
    created_at: str

class BudgetIn(BaseModel):
    category: str
    amount: float
    month: str  # format YYYY-MM

class BudgetOut(BudgetIn):
    id: str
    user_id: str
    created_at: str

class GoalIn(BaseModel):
    title: str
    target_amount: float
    current_amount: float = 0
    deadline: Optional[str] = None

class GoalOut(GoalIn):
    id: str
    user_id: str
    created_at: str

class GoalContributionIn(BaseModel):
    amount: float

class CategorySuggestIn(BaseModel):
    description: str
    amount: Optional[float] = None

# ---------- AUTH ENDPOINTS ----------
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(body: RegisterBody):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "currency": "USD",
        "role": "user",
        "created_at": now,
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    return {
        "user": {"id": user_id, "email": email, "name": body.name, "currency": "USD", "role": "user", "created_at": now},
        "access_token": token,
    }

@api_router.post("/auth/login", response_model=AuthResponse)
async def login(body: LoginBody):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "currency": user.get("currency", "USD"),
            "role": user.get("role", "user"),
            "created_at": user["created_at"],
        },
        "access_token": token,
    }

@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "currency": user.get("currency", "USD"),
        "role": user.get("role", "user"),
        "created_at": user["created_at"],
    }

@api_router.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    # Stateless JWT — client just discards. Endpoint exists for symmetry.
    return {"ok": True}

# ---------- CATEGORIES ----------
@api_router.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)):
    return DEFAULT_CATEGORIES

# ---------- RECURRING HELPERS ----------
def _parse_date(s: str) -> datetime:
    # Accept both YYYY-MM-DD and ISO strings. Always return timezone-aware (UTC).
    s = s.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except Exception:
        dt = datetime.strptime(s[:10], "%Y-%m-%d")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

def _advance(dt: datetime, frequency: str) -> datetime:
    if frequency == "daily":
        return dt + timedelta(days=1)
    if frequency == "weekly":
        return dt + timedelta(days=7)
    if frequency == "biweekly":
        return dt + timedelta(days=14)
    if frequency == "monthly":
        # approximate calendar month
        year = dt.year + (1 if dt.month == 12 else 0)
        month = 1 if dt.month == 12 else dt.month + 1
        day = min(dt.day, 28)
        new_dt = dt.replace(year=year, month=month, day=day)
        # Preserve timezone
        if dt.tzinfo and new_dt.tzinfo is None:
            new_dt = new_dt.replace(tzinfo=dt.tzinfo)
        return new_dt
    if frequency == "quarterly":
        month = dt.month + 3
        year = dt.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        day = min(dt.day, 28)
        new_dt = dt.replace(year=year, month=month, day=day)
        # Preserve timezone
        if dt.tzinfo and new_dt.tzinfo is None:
            new_dt = new_dt.replace(tzinfo=dt.tzinfo)
        return new_dt
    if frequency == "yearly":
        try:
            new_dt = dt.replace(year=dt.year + 1)
        except ValueError:
            new_dt = dt.replace(year=dt.year + 1, day=28)
        # Preserve timezone
        if dt.tzinfo and new_dt.tzinfo is None:
            new_dt = new_dt.replace(tzinfo=dt.tzinfo)
        return new_dt
    return dt + timedelta(days=1)

async def materialize_due(user_id: str) -> int:
    """Create any past-due transactions for this user's active recurring rules. Returns count created."""
    now = datetime.now(timezone.utc)
    rules = await db.recurring_rules.find(
        {"user_id": user_id, "active": True}, {"_id": 0}
    ).to_list(length=500)
    created = 0
    for rule in rules:
        next_dt = _parse_date(rule["next_date"])
        end_dt = _parse_date(rule["end_date"]) if rule.get("end_date") else None
        safety = 0
        while next_dt <= now and safety < 500:
            if end_dt and next_dt > end_dt:
                break
            tid = str(uuid.uuid4())
            doc = {
                "id": tid,
                "user_id": user_id,
                "amount": float(rule["amount"]),
                "type": rule["type"],
                "category": rule["category"],
                "description": rule["description"],
                "date": next_dt.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "recurring_rule_id": rule["id"],
            }
            await db.transactions.insert_one(doc)
            created += 1
            next_dt = _advance(next_dt, rule["frequency"])
            safety += 1
        update: dict = {"next_date": next_dt.isoformat()}
        if end_dt and next_dt > end_dt:
            update["active"] = False
        await db.recurring_rules.update_one(
            {"id": rule["id"], "user_id": user_id},
            {"$set": update},
        )
    return created

# ---------- TRANSACTIONS ----------
@api_router.post("/transactions", response_model=TransactionOut)
async def create_transaction(body: TransactionIn, user: dict = Depends(get_current_user)):
    tid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": tid,
        "user_id": user["id"],
        "amount": float(body.amount),
        "type": body.type,
        "category": body.category,
        "description": body.description or "",
        "date": body.date or now,
        "created_at": now,
        "recurring_rule_id": None,
    }
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/transactions", response_model=List[TransactionOut])
async def list_transactions(
    user: dict = Depends(get_current_user),
    limit: int = 200,
    type: Optional[str] = None,
    category: Optional[str] = None,
):
    await materialize_due(user["id"])
    q: dict = {"user_id": user["id"]}
    if type:
        q["type"] = type
    if category:
        q["category"] = category
    cursor = db.transactions.find(q, {"_id": 0}).sort("date", -1).limit(limit)
    return await cursor.to_list(length=limit)

@api_router.delete("/transactions/{tid}")
async def delete_transaction(tid: str, user: dict = Depends(get_current_user)):
    res = await db.transactions.delete_one({"id": tid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"ok": True}

@api_router.put("/transactions/{tid}", response_model=TransactionOut)
async def update_transaction(tid: str, body: TransactionIn, user: dict = Depends(get_current_user)):
    update = {
        "amount": float(body.amount),
        "type": body.type,
        "category": body.category,
        "description": body.description or "",
        "date": body.date or datetime.now(timezone.utc).isoformat(),
    }
    res = await db.transactions.find_one_and_update(
        {"id": tid, "user_id": user["id"]},
        {"$set": update},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Transaction not found")
    res.pop("_id", None)
    return res

# ---------- DASHBOARD ----------
@api_router.get("/dashboard/summary")
async def dashboard_summary(
    user: dict = Depends(get_current_user),
    month: Optional[str] = None,  # YYYY-MM; defaults to current
):
    await materialize_due(user["id"])
    txs = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(length=5000)
    total_income = sum(t["amount"] for t in txs if t["type"] == "income")
    total_expense = sum(t["amount"] for t in txs if t["type"] == "expense")
    balance = total_income - total_expense

    now = datetime.now(timezone.utc)
    target_month = month if month else now.strftime("%Y-%m")
    month_income = 0.0
    month_expense = 0.0
    by_category: dict = {}
    monthly: dict = {}
    month_cumulative_balance = 0.0  # cumulative balance up to end of target_month
    month_txs: list = []
    for t in txs:
        try:
            dt = datetime.fromisoformat(t["date"].replace("Z", "+00:00"))
        except Exception:
            continue
        key = dt.strftime("%Y-%m")
        monthly.setdefault(key, {"income": 0.0, "expense": 0.0})
        monthly[key][t["type"]] += t["amount"]
        if key <= target_month:
            if t["type"] == "income":
                month_cumulative_balance += t["amount"]
            else:
                month_cumulative_balance -= t["amount"]
        if key == target_month:
            month_txs.append(t)
            if t["type"] == "income":
                month_income += t["amount"]
            else:
                month_expense += t["amount"]
                by_category[t["category"]] = by_category.get(t["category"], 0.0) + t["amount"]

    # 6-month series ending at target_month
    try:
        year, mo = map(int, target_month.split("-"))
        end_dt = datetime(year, mo, 1, tzinfo=timezone.utc)
    except Exception:
        end_dt = now
    series_keys: list = []
    cur = end_dt
    for _ in range(6):
        series_keys.append(cur.strftime("%Y-%m"))
        # step back one month
        cy = cur.year - 1 if cur.month == 1 else cur.year
        cm = 12 if cur.month == 1 else cur.month - 1
        cur = datetime(cy, cm, 1, tzinfo=timezone.utc)
    series_keys.reverse()
    monthly_series = [
        {
            "month": k,
            "income": monthly.get(k, {}).get("income", 0.0),
            "expense": monthly.get(k, {}).get("expense", 0.0),
        }
        for k in series_keys
    ]

    category_breakdown = [
        {"category": k, "amount": v}
        for k, v in sorted(by_category.items(), key=lambda x: -x[1])
    ]

    recent = sorted(month_txs, key=lambda t: t.get("date", ""), reverse=True)[:5]

    return {
        "balance": balance,
        "total_income": total_income,
        "total_expense": total_expense,
        "month": target_month,
        "month_balance": month_cumulative_balance,
        "month_income": month_income,
        "month_expense": month_expense,
        "month_savings": month_income - month_expense,
        "monthly_series": monthly_series,
        "category_breakdown": category_breakdown,
        "recent_transactions": recent,
        "transaction_count": len(txs),
        "month_transaction_count": len(month_txs),
    }

# ---------- CALENDAR ----------
@api_router.get("/calendar")
async def calendar_events(
    month: str,  # YYYY-MM
    user: dict = Depends(get_current_user),
):
    """Return per-day income/expense aggregates for the given month, including projected
    upcoming recurring transactions if the month is in the future."""
    await materialize_due(user["id"])
    try:
        year, mo = map(int, month.split("-"))
    except Exception:
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")

    start = datetime(year, mo, 1, tzinfo=timezone.utc)
    if mo == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, mo + 1, 1, tzinfo=timezone.utc)

    # Pull all transactions for the month
    cursor = db.transactions.find(
        {
            "user_id": user["id"],
            "date": {"$gte": start.isoformat(), "$lt": end.isoformat()},
        },
        {"_id": 0},
    ).sort("date", 1)
    actual = await cursor.to_list(length=2000)

    # Project future recurring transactions inside this month (those that don't
    # yet exist because materialize_due only catches past-due rules).
    rules = await db.recurring_rules.find(
        {"user_id": user["id"], "active": True}, {"_id": 0}
    ).to_list(length=200)
    now = datetime.now(timezone.utc)
    projected: list = []
    for rule in rules:
        next_dt = _parse_date(rule["next_date"])
        end_dt = _parse_date(rule["end_date"]) if rule.get("end_date") else None
        safety = 0
        while next_dt < end and safety < 200:
            if end_dt and next_dt > end_dt:
                break
            # Skip past dates; materialize_due already handled them.
            if next_dt >= start and next_dt > now:
                projected.append({
                    "id": f"proj-{rule['id']}-{next_dt.isoformat()}",
                    "user_id": user["id"],
                    "amount": float(rule["amount"]),
                    "type": rule["type"],
                    "category": rule["category"],
                    "description": rule["description"],
                    "date": next_dt.isoformat(),
                    "created_at": next_dt.isoformat(),
                    "recurring_rule_id": rule["id"],
                    "projected": True,
                })
            next_dt = _advance(next_dt, rule["frequency"])
            safety += 1

    # Build per-day aggregates
    by_day: dict = {}
    for t in actual + projected:
        try:
            dt = datetime.fromisoformat(t["date"].replace("Z", "+00:00"))
        except Exception:
            continue
        day_key = dt.strftime("%Y-%m-%d")
        agg = by_day.setdefault(day_key, {
            "date": day_key,
            "income": 0.0,
            "expense": 0.0,
            "projected_income": 0.0,
            "projected_expense": 0.0,
            "events": [],
        })
        if t.get("projected"):
            agg[f"projected_{t['type']}"] += t["amount"]
        else:
            agg[t["type"]] += t["amount"]
        agg["events"].append({
            "id": t["id"],
            "amount": t["amount"],
            "type": t["type"],
            "category": t["category"],
            "description": t.get("description", ""),
            "projected": bool(t.get("projected")),
            "recurring_rule_id": t.get("recurring_rule_id"),
            "date": t["date"],
        })

    days = sorted(by_day.values(), key=lambda d: d["date"])
    totals = {
        "income": sum(d["income"] for d in days),
        "expense": sum(d["expense"] for d in days),
        "projected_income": sum(d["projected_income"] for d in days),
        "projected_expense": sum(d["projected_expense"] for d in days),
    }
    return {"month": month, "days": days, "totals": totals}

# ---------- BUDGETS ----------
@api_router.post("/budgets", response_model=BudgetOut)
async def create_budget(body: BudgetIn, user: dict = Depends(get_current_user)):
    bid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": bid,
        "user_id": user["id"],
        "category": body.category,
        "amount": float(body.amount),
        "month": body.month,
        "created_at": now,
    }
    # Upsert: one budget per (user, category, month)
    await db.budgets.update_one(
        {"user_id": user["id"], "category": body.category, "month": body.month},
        {"$set": doc},
        upsert=True,
    )
    out = await db.budgets.find_one(
        {"user_id": user["id"], "category": body.category, "month": body.month},
        {"_id": 0},
    )
    return out

@api_router.get("/budgets")
async def list_budgets(user: dict = Depends(get_current_user), month: Optional[str] = None):
    q: dict = {"user_id": user["id"]}
    if month:
        q["month"] = month
    budgets = await db.budgets.find(q, {"_id": 0}).to_list(length=500)

    # Compute spent per category for the month
    result = []
    for b in budgets:
        m = b["month"]
        start = f"{m}-01"
        # Next month boundary
        year, mo = map(int, m.split("-"))
        if mo == 12:
            nxt = f"{year+1}-01-01"
        else:
            nxt = f"{year}-{mo+1:02d}-01"
        cursor = db.transactions.find(
            {
                "user_id": user["id"],
                "category": b["category"],
                "type": "expense",
                "date": {"$gte": start, "$lt": nxt},
            },
            {"_id": 0, "amount": 1},
        )
        spent = 0.0
        async for t in cursor:
            spent += t["amount"]
        b["spent"] = spent
        result.append(b)
    return result

@api_router.delete("/budgets/{bid}")
async def delete_budget(bid: str, user: dict = Depends(get_current_user)):
    res = await db.budgets.delete_one({"id": bid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"ok": True}

# ---------- GOALS ----------
@api_router.post("/goals", response_model=GoalOut)
async def create_goal(body: GoalIn, user: dict = Depends(get_current_user)):
    gid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": gid,
        "user_id": user["id"],
        "title": body.title,
        "target_amount": float(body.target_amount),
        "current_amount": float(body.current_amount),
        "deadline": body.deadline,
        "created_at": now,
    }
    await db.goals.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/goals", response_model=List[GoalOut])
async def list_goals(user: dict = Depends(get_current_user)):
    return await db.goals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(length=200)

@api_router.post("/goals/{gid}/contribute", response_model=GoalOut)
async def contribute_goal(gid: str, body: GoalContributionIn, user: dict = Depends(get_current_user)):
    res = await db.goals.find_one_and_update(
        {"id": gid, "user_id": user["id"]},
        {"$inc": {"current_amount": float(body.amount)}},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Goal not found")
    res.pop("_id", None)
    return res

@api_router.delete("/goals/{gid}")
async def delete_goal(gid: str, user: dict = Depends(get_current_user)):
    res = await db.goals.delete_one({"id": gid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"ok": True}

# ---------- RECURRING RULES ----------
@api_router.post("/recurring", response_model=RecurringOut)
async def create_recurring(body: RecurringIn, user: dict = Depends(get_current_user)):
    rid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    start_dt = _parse_date(body.start_date) if body.start_date else now
    end_dt_iso: Optional[str] = None
    if body.end_date:
        end_dt = _parse_date(body.end_date)
        if end_dt < start_dt:
            raise HTTPException(status_code=400, detail="end_date must be after start_date")
        end_dt_iso = end_dt.isoformat()
    doc = {
        "id": rid,
        "user_id": user["id"],
        "amount": float(body.amount),
        "type": body.type,
        "category": body.category,
        "description": body.description or "",
        "frequency": body.frequency,
        "start_date": start_dt.isoformat(),
        "end_date": end_dt_iso,
        "next_date": start_dt.isoformat(),
        "active": True,
        "created_at": now.isoformat(),
    }
    await db.recurring_rules.insert_one(doc)
    # Materialize any already-due instances (including today's)
    await materialize_due(user["id"])
    fresh = await db.recurring_rules.find_one({"id": rid}, {"_id": 0})
    return fresh

@api_router.get("/recurring", response_model=List[RecurringOut])
async def list_recurring(user: dict = Depends(get_current_user)):
    # Opportunistically catch up any due instances
    await materialize_due(user["id"])
    return await db.recurring_rules.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(length=200)

@api_router.delete("/recurring/{rid}")
async def delete_recurring(
    rid: str,
    user: dict = Depends(get_current_user),
    delete_generated: bool = False,
):
    rule = await db.recurring_rules.find_one({"id": rid, "user_id": user["id"]})
    if not rule:
        raise HTTPException(status_code=404, detail="Recurring rule not found")
    await db.recurring_rules.delete_one({"id": rid, "user_id": user["id"]})
    if delete_generated:
        await db.transactions.delete_many({"user_id": user["id"], "recurring_rule_id": rid})
    return {"ok": True}

@api_router.patch("/recurring/{rid}", response_model=RecurringOut)
async def toggle_recurring(rid: str, user: dict = Depends(get_current_user)):
    rule = await db.recurring_rules.find_one({"id": rid, "user_id": user["id"]})
    if not rule:
        raise HTTPException(status_code=404, detail="Recurring rule not found")
    new_active = not rule.get("active", True)
    await db.recurring_rules.update_one(
        {"id": rid, "user_id": user["id"]},
        {"$set": {"active": new_active}},
    )
    fresh = await db.recurring_rules.find_one({"id": rid}, {"_id": 0})
    return fresh

# ---------- AI INSIGHTS ----------
async def _ai_chat(session_id: str, system: str, prompt: str) -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=session_id,
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    response = await chat.send_message(UserMessage(text=prompt))
    return response

def _extract_json(text: str):
    # Strip code fences
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        # Find first JSON object in text
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                return None
    return None

@api_router.post("/ai/insights")
async def ai_insights(user: dict = Depends(get_current_user)):
    txs = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(length=300)
    if not txs:
        return {
            "summary": "Start adding transactions to unlock personalised insights.",
            "top_categories": [],
            "anomalies": [],
            "tips": [
                "Record every expense for 7 days to see where your money goes.",
                "Set a monthly budget for your top spending category.",
            ],
            "forecast_next_month": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    compact = [
        {
            "amount": round(t["amount"], 2),
            "type": t["type"],
            "category": t["category"],
            "description": t.get("description", ""),
            "date": t["date"][:10],
        }
        for t in txs[:150]
    ]

    system = (
        "You are a calm, thoughtful personal finance coach. Always respond with STRICT JSON only — "
        "no prose, no markdown, no code fences. Amounts are in the user's currency (USD unless noted). "
        "Keep tone warm, specific, and actionable."
    )
    prompt = f"""Analyse these transactions and return JSON with this exact shape:
{{
  "summary": "<1-2 sentence overview of the user's financial behaviour this period>",
  "top_categories": [
    {{"category": "<name>", "amount": <number>, "insight": "<1 sentence observation>"}}
  ],
  "anomalies": [
    {{"description": "<what stood out>", "severity": "low|medium|high"}}
  ],
  "tips": ["<short actionable tip>", "<short actionable tip>", "<short actionable tip>"],
  "forecast_next_month": {{"expected_expense": <number>, "confidence": "low|medium|high"}}
}}

Transactions:
{json.dumps(compact)}
"""
    try:
        raw = await _ai_chat(f"insights-{user['id']}", system, prompt)
        data = _extract_json(raw)
        if not data:
            raise ValueError("AI returned unparseable output")
        data["generated_at"] = datetime.now(timezone.utc).isoformat()
        return data
    except Exception as e:
        logging.exception("AI insights failed")
        # Fallback deterministic insight
        total_exp = sum(t["amount"] for t in txs if t["type"] == "expense")
        by_cat: dict = {}
        for t in txs:
            if t["type"] == "expense":
                by_cat[t["category"]] = by_cat.get(t["category"], 0) + t["amount"]
        top = sorted(by_cat.items(), key=lambda x: -x[1])[:3]
        return {
            "summary": f"You've tracked {len(txs)} transactions totaling ${total_exp:.2f} in expenses.",
            "top_categories": [{"category": k, "amount": round(v, 2), "insight": "Largest share of spending."} for k, v in top],
            "anomalies": [],
            "tips": [
                "Review your top category for subscriptions you can cancel.",
                "Aim to save 20% of income each month.",
            ],
            "forecast_next_month": {"expected_expense": round(total_exp / max(1, len(txs)) * 30, 2), "confidence": "low"},
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "fallback": True,
            "error": str(e),
        }

@api_router.post("/ai/suggest-category")
async def ai_suggest_category(body: CategorySuggestIn, user: dict = Depends(get_current_user)):
    if not body.description.strip():
        raise HTTPException(status_code=400, detail="description is required")
    cats = [c["id"] + " (" + c["name"] + ")" for c in DEFAULT_CATEGORIES]
    system = (
        "You classify a short transaction description into ONE category id from the allowed list. "
        "Return STRICT JSON: {\"category\":\"<id>\",\"confidence\":<0-1 float>}. No prose."
    )
    prompt = f"""Allowed categories (id: name):
{json.dumps(cats)}

Transaction description: "{body.description}"
Amount: {body.amount if body.amount is not None else 'unknown'}

Pick the best-matching category id."""
    try:
        raw = await _ai_chat(f"cat-{user['id']}", system, prompt)
        data = _extract_json(raw) or {}
        cat = data.get("category", "other_exp")
        valid_ids = {c["id"] for c in DEFAULT_CATEGORIES}
        if cat not in valid_ids:
            cat = "other_exp"
        return {"category": cat, "confidence": float(data.get("confidence", 0.5))}
    except Exception as e:
        logging.exception("AI category suggest failed")
        return {"category": "other_exp", "confidence": 0.0, "error": str(e)}

# ---------- HEALTH ----------
@api_router.get("/")
async def root():
    return {"message": "FinanceFocus API", "status": "ok"}

# ---------- MOUNT ----------
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- STARTUP ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.transactions.create_index([("user_id", 1), ("date", -1)])
    await db.budgets.create_index([("user_id", 1), ("month", 1), ("category", 1)])
    await db.goals.create_index([("user_id", 1), ("created_at", -1)])
    await db.recurring_rules.create_index([("user_id", 1), ("active", 1)])

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@financefocus.app").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "currency": "USD",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin user %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
