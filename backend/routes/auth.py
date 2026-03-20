from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from datetime import datetime, timedelta
import jwt
import hashlib
import os
from firebase import firebase_get, firebase_set, firebase_push

router = APIRouter()
security = HTTPBearer()

SECRET_KEY = os.getenv("JWT_SECRET", "fayda-secret-key-change-in-production")
ALGORITHM  = "HS256"
TOKEN_EXP  = 24  # hours

# ── Models ──────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "user"   # "admin" or "user"

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

# ── Helpers ─────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def create_token(username: str, role: str) -> str:
    payload = {
        "sub":  username,
        "role": role,
        "exp":  datetime.utcnow() + timedelta(hours=TOKEN_EXP),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_admin(token: dict = Depends(verify_token)):
    if token.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return token

# ── Routes ──────────────────────────────────────────────────────
@router.post("/login")
def login(req: LoginRequest):
    users = firebase_get("users") or {}
    user  = users.get(req.username)
    if not user or user["password"] != hash_password(req.password):
        raise HTTPException(status_code=401, detail="Wrong username or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_token(req.username, user["role"])
    return {"token": token, "role": user["role"], "username": req.username}

@router.post("/register")
def register(req: RegisterRequest, token: dict = Depends(require_admin)):
    users = firebase_get("users") or {}
    if req.username in users:
        raise HTTPException(status_code=400, detail="Username already exists")
    users[req.username] = {
        "password": hash_password(req.password),
        "role":     req.role,
        "active":   True,
        "created":  datetime.utcnow().isoformat(),
    }
    firebase_set("users", users)
    return {"message": "User created", "username": req.username}

@router.get("/users")
def list_users(token: dict = Depends(require_admin)):
    users = firebase_get("users") or {}
    return [
        {"username": u, "role": d["role"], "active": d.get("active", True), "created": d.get("created","")}
        for u, d in users.items()
    ]

@router.delete("/users/{username}")
def delete_user(username: str, token: dict = Depends(require_admin)):
    users = firebase_get("users") or {}
    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")
    if username == token["sub"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    del users[username]
    firebase_set("users", users)
    return {"message": "User deleted"}

@router.patch("/users/{username}/toggle")
def toggle_user(username: str, token: dict = Depends(require_admin)):
    users = firebase_get("users") or {}
    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")
    users[username]["active"] = not users[username].get("active", True)
    firebase_set("users", users)
    return {"active": users[username]["active"]}

@router.post("/change-password")
def change_password(req: ChangePasswordRequest, token: dict = Depends(verify_token)):
    username = token["sub"]
    users    = firebase_get("users") or {}
    user     = users.get(username)
    if not user or user["password"] != hash_password(req.old_password):
        raise HTTPException(status_code=401, detail="Wrong old password")
    users[username]["password"] = hash_password(req.new_password)
    firebase_set("users", users)
    return {"message": "Password changed"}

@router.get("/me")
def me(token: dict = Depends(verify_token)):
    return {"username": token["sub"], "role": token["role"]}
