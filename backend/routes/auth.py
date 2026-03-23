from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import jwt, hashlib, os, re
from firebase import firebase_get, firebase_set

router   = APIRouter()
security = HTTPBearer()

SECRET_KEY = os.getenv("JWT_SECRET", "fayda-secret-key")
ALGORITHM  = "HS256"
TOKEN_EXP  = 24

# ── Models ──────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    phone:         str
    password:      str
    referral_code: Optional[str] = None

class LoginRequest(BaseModel):
    phone:    str
    password: str

class RegisterRequest(BaseModel):
    phone:    str
    password: str
    role:     str = "user"

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class BalanceRequest(BaseModel):
    balance: int

class DeductRequest(BaseModel):
    amount: int

class DepositSettingsRequest(BaseModel):
    telebirr_phone: str
    account_name:   str

class DepositRequestModel(BaseModel):
    amount:   int
    sms_text: str
    phone:    str

# ── Helpers ─────────────────────────────────────────────────────
def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()

def generate_ref_code():
    import random
    agents = firebase_get("agents") or {}
    used = {v.get("ref_code") for v in agents.values() if v.get("ref_code")}
    for _ in range(100):
        code = str(random.randint(1000, 9999))
        if code not in used:
            return code
    return str(random.randint(1000, 9999))

def norm_phone(p: str) -> str:
    p = re.sub(r'\s+', '', p)
    if p.startswith('+251'): p = '0' + p[4:]
    return p

def create_token(phone: str, role: str) -> str:
    return jwt.encode({
        "sub":  phone,
        "role": role,
        "exp":  datetime.utcnow() + timedelta(hours=TOKEN_EXP),
    }, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(creds: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

def require_admin(token=Depends(verify_token)):
    if token.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return token

# ── Signup ───────────────────────────────────────────────────────
@router.post("/signup")
def signup(req: SignupRequest):
    phone = norm_phone(req.phone)
    if not re.match(r'^0[97]\d{8}$', phone):
        raise HTTPException(400, "ትክክለኛ ስልክ ቁጥር ያስገቡ (09xxxxxxxx ወይም 07xxxxxxxx)")
    users = firebase_get("users") or {}
    if phone in users:
        raise HTTPException(400, "ይህ ስልክ ቁጥር አስቀድሞ ተመዝግቧል")
    users[phone] = {
        "password":    hash_pw(req.password),
        "role":        "user",
        "active":      True,
        "balance":     0,
        "created":     datetime.utcnow().isoformat(),
        "referred_by": req.referral_code or "",
    }
    firebase_set("users", users)
    if req.referral_code:
        users[phone]["referred_by"] = req.referral_code
        firebase_set("users", users)
    token = create_token(phone, "user")
    return {"token": token, "role": "user", "phone": phone, "balance": 0}

# ── Login ────────────────────────────────────────────────────────
@router.post("/login")
def login(req: LoginRequest):
    phone = norm_phone(req.phone)
    users = firebase_get("users") or {}
    user  = users.get(phone)
    if not user or user["password"] != hash_pw(req.password):
        raise HTTPException(401, "ስልክ ቁጥር ወይም password ስህተት ነው")
    if not user.get("active", True):
        raise HTTPException(403, "Account ተዘግቷል — admin ያነጋግሩ")
    token = create_token(phone, user["role"])
    return {"token": token, "role": user["role"], "phone": phone, "balance": user.get("balance", 0)}

# ── Me ───────────────────────────────────────────────────────────
@router.get("/me")
def me(token=Depends(verify_token)):
    users = firebase_get("users") or {}
    user  = users.get(token["sub"], {})
    return {"phone": token["sub"], "role": token["role"], "balance": user.get("balance", 0)}

# ── Admin: register ──────────────────────────────────────────────
@router.post("/register")
def register(req: RegisterRequest, token=Depends(require_admin)):
    phone = norm_phone(req.phone)
    users = firebase_get("users") or {}
    if phone in users:
        raise HTTPException(400, "ስልክ ቁጥሩ አስቀድሞ አለ")
    users[phone] = {
        "password": hash_pw(req.password),
        "role":     req.role,
        "active":   True,
        "balance":  0,
        "created":  datetime.utcnow().isoformat(),
    }
    firebase_set("users", users)
    if req.role == "agent":
        agents = firebase_get("agents") or {}
        agents[phone] = {"phone": phone, "count": 0, "created": datetime.utcnow().isoformat()}
        firebase_set("agents", agents)
    return {"message": "Created", "phone": phone}

# ── List users ───────────────────────────────────────────────────
@router.get("/users")
def list_users(token=Depends(require_admin)):
    users = firebase_get("users") or {}
    return [
        {"phone": p, "role": d["role"], "active": d.get("active", True),
         "balance": d.get("balance", 0), "created": d.get("created", "")}
        for p, d in users.items()
    ]

# ── Delete user ──────────────────────────────────────────────────
@router.delete("/users/{phone}")
def delete_user(phone: str, token=Depends(require_admin)):
    users = firebase_get("users") or {}
    if phone not in users:
        raise HTTPException(404, "User not found")
    if phone == token["sub"]:
        raise HTTPException(400, "ራስዎን መሰረዝ አይቻልም")
    del users[phone]
    firebase_set("users", users)
    return {"message": "Deleted"}

# ── Toggle active ────────────────────────────────────────────────
@router.patch("/users/{phone}/toggle")
def toggle_user(phone: str, token=Depends(require_admin)):
    users = firebase_get("users") or {}
    if phone not in users:
        raise HTTPException(404, "User not found")
    users[phone]["active"] = not users[phone].get("active", True)
    firebase_set("users", users)
    return {"active": users[phone]["active"]}

# ── Update balance (admin) ───────────────────────────────────────
@router.patch("/users/{phone}/balance")
def update_balance(phone: str, req: BalanceRequest, token=Depends(require_admin)):
    users = firebase_get("users") or {}
    if phone not in users:
        raise HTTPException(404, "User not found")
    users[phone]["balance"] = req.balance
    firebase_set("users", users)
    return {"balance": req.balance}

# ── Deduct balance (per ID generated) ───────────────────────────
@router.post("/deduct")
def deduct(req: DeductRequest, token=Depends(verify_token)):
    phone = token["sub"]
    users = firebase_get("users") or {}
    user  = users.get(phone)
    if not user:
        raise HTTPException(404, "User not found")
    current = user.get("balance", 0)
    if current < req.amount:
        raise HTTPException(400, "በቂ ብር የለም")
    users[phone]["balance"] = current - req.amount
    users[phone]["ids_generated"] = user.get("ids_generated", 0) + 1
    firebase_set("users", users)
    return {"balance": users[phone]["balance"]}

# ── Deposit request ──────────────────────────────────────────────
@router.post("/deposit-request")
def deposit_request(req: DepositRequestModel, token=Depends(verify_token)):
    requests_data = firebase_get("deposit_requests") or {}
    key = f"{req.phone}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    requests_data[key] = {
        "phone":    req.phone,
        "amount":   req.amount,
        "sms_text": req.sms_text,
        "status":   "pending",
        "created":  datetime.utcnow().isoformat(),
    }
    firebase_set("deposit_requests", requests_data)
    return {"message": "Request submitted"}

# ── Get deposit requests (admin) ─────────────────────────────────
@router.get("/deposit-requests")
def get_deposit_requests(token=Depends(require_admin)):
    data = firebase_get("deposit_requests") or {}
    return sorted(data.items(), key=lambda x: x[1].get("created",""), reverse=True)

# ── Approve deposit (admin) ──────────────────────────────────────
@router.patch("/deposit-requests/{key}/approve")
def approve_deposit(key: str, token=Depends(require_admin)):
    requests_data = firebase_get("deposit_requests") or {}
    if key not in requests_data:
        raise HTTPException(404, "Request not found")
    req   = requests_data[key]
    phone = req["phone"]
    amt   = req["amount"]
    users = firebase_get("users") or {}
    if phone not in users:
        raise HTTPException(404, "User not found")
    users[phone]["balance"] = users[phone].get("balance", 0) + amt
    firebase_set("users", users)
    requests_data[key]["status"] = "approved"
    firebase_set("deposit_requests", requests_data)
    return {"message": "Approved", "balance": users[phone]["balance"]}

# ── Reject deposit (admin) ───────────────────────────────────────
@router.patch("/deposit-requests/{key}/reject")
def reject_deposit(key: str, token=Depends(require_admin)):
    requests_data = firebase_get("deposit_requests") or {}
    if key not in requests_data:
        raise HTTPException(404, "Request not found")
    requests_data[key]["status"] = "rejected"
    firebase_set("deposit_requests", requests_data)
    return {"message": "Rejected"}

# ── Change password ──────────────────────────────────────────────
@router.post("/change-password")
def change_password(req: ChangePasswordRequest, token=Depends(verify_token)):
    phone = token["sub"]
    users = firebase_get("users") or {}
    user  = users.get(phone)
    if not user or user["password"] != hash_pw(req.old_password):
        raise HTTPException(401, "ያለፈ password ስህተት ነው")
    users[phone]["password"] = hash_pw(req.new_password)
    firebase_set("users", users)
    return {"message": "Password changed"}

# ── Agent stats ──────────────────────────────────────────────────
@router.get("/agent/stats")
def agent_stats(token=Depends(verify_token)):
    if token["role"] not in ("agent", "admin"):
        raise HTTPException(403, "Agent only")
    phone  = token["sub"]
    agents = firebase_get("agents") or {}
    data   = agents.get(phone, {})
    if "ref_code" not in data:
        data["ref_code"] = generate_ref_code()
        agents[phone] = data
        firebase_set("agents", agents)
    ref_code = data["ref_code"]
    users = firebase_get("users") or {}
    referred = [u for u in users.values() if u.get("referred_by") == ref_code]
    id_count = sum(u.get("ids_generated", 0) for u in referred)
    return {
        "phone":          phone,
        "referral_code":  ref_code,
        "referral_count": len(referred),
        "id_count":       id_count,
        "earnings":       id_count * 5,
        "referral_link":  f"https://idconvertor.vercel.app/login?ref={ref_code}",
    }

# ── Deposit settings ─────────────────────────────────────────────
@router.get("/deposit-settings")
def get_deposit_settings(token=Depends(verify_token)):
    return firebase_get("deposit_settings") or {"telebirr_phone": "", "account_name": ""}

@router.put("/deposit-settings")
def save_deposit_settings(req: DepositSettingsRequest, token=Depends(require_admin)):
    firebase_set("deposit_settings", req.model_dump())
    return {"message": "Saved"}
