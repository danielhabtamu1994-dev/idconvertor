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
    phone:    str
    password: str
    referral_code: Optional[str] = None   # agent referral code

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

class DepositSettingsRequest(BaseModel):
    telebirr_phone:  str
    account_name:    str

# ── Helpers ─────────────────────────────────────────────────────
def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()

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

def require_admin_or_agent(token=Depends(verify_token)):
    if token.get("role") not in ("admin", "agent"):
        raise HTTPException(403, "Not allowed")
    return token

# ── Signup (self-register) ───────────────────────────────────────
@router.post("/signup")
def signup(req: SignupRequest):
    phone = norm_phone(req.phone)
    if not re.match(r'^0[97]\d{8}$', phone):
        raise HTTPException(400, "ትክክለኛ ስልክ ቁጥር ያስገቡ (09xxxxxxxx ወይም 07xxxxxxxx)")
    users = firebase_get("users") or {}
    if phone in users:
        raise HTTPException(400, "ይህ ስልክ ቁጥር አስቀድሞ ተመዝግቧል")

    users[phone] = {
        "password": hash_pw(req.password),
        "role":     "user",
        "active":   True,
        "balance":  0,
        "created":  datetime.utcnow().isoformat(),
        "referred_by": req.referral_code or "",
    }
    firebase_set("users", users)

    # ── Increment agent referral count ──────────────────────────
    if req.referral_code:
        agents = firebase_get("agents") or {}
        if req.referral_code in agents:
            agents[req.referral_code]["count"] = agents[req.referral_code].get("count", 0) + 1
            firebase_set("agents", agents)

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

# ── Admin: create user/agent ─────────────────────────────────────
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

    # if agent — create referral entry
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
        {"phone": p, "role": d["role"], "active": d.get("active",True),
         "balance": d.get("balance",0), "created": d.get("created","")}
        for p,d in users.items()
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

# ── Update balance ───────────────────────────────────────────────
@router.patch("/users/{phone}/balance")
def update_balance(phone: str, req: BalanceRequest, token=Depends(require_admin)):
    users = firebase_get("users") or {}
    if phone not in users:
        raise HTTPException(404, "User not found")
    users[phone]["balance"] = req.balance
    firebase_set("users", users)
    return {"balance": req.balance}

# ── Me ───────────────────────────────────────────────────────────
@router.get("/me")
def me(token=Depends(verify_token)):
    users = firebase_get("users") or {}
    user  = users.get(token["sub"], {})
    return {
        "phone":   token["sub"],
        "role":    token["role"],
        "balance": user.get("balance", 0),
    }

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

# ── Agent referral stats ─────────────────────────────────────────
@router.get("/agent/stats")
def agent_stats(token=Depends(verify_token)):
    if token["role"] not in ("agent", "admin"):
        raise HTTPException(403, "Agent only")
    phone  = token["sub"]
    agents = firebase_get("agents") or {}
    data   = agents.get(phone, {"count": 0})
    return {
        "phone":          phone,
        "referral_code":  phone,
        "referral_count": data.get("count", 0),
        "referral_link":  f"https://idconvertor.com/signup?ref={phone}",
    }

# ── Deposit settings (admin) ─────────────────────────────────────
@router.get("/deposit-settings")
def get_deposit_settings(token=Depends(verify_token)):
    d = firebase_get("deposit_settings") or {"telebirr_phone": "", "account_name": ""}
    return d

@router.put("/deposit-settings")
def save_deposit_settings(req: DepositSettingsRequest, token=Depends(require_admin)):
    firebase_set("deposit_settings", req.model_dump())
    return {"message": "Saved"}
