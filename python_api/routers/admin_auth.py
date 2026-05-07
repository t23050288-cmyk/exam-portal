"""
/api/admin/auth/login   — POST {email, password} → admin JWT
/api/admin/auth/logout  — POST → no-op (stateless)
/api/admin/auth/create_admin — bootstrap new admin (requires x-bootstrap-secret)
"""
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from jose import jwt
from db.supabase_client import get_supabase

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET    = os.getenv("JWT_SECRET", "super-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_H  = int(os.getenv("ADMIN_JWT_EXPIRE_HOURS", "12"))
ADMIN_SECRET  = os.getenv("ADMIN_SECRET", "rudranshsarvam")

class LoginRequest(BaseModel):
    email: str
    password: str

def make_admin_token(email: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_H)
    return jwt.encode({"sub": email, "role": role, "is_admin": True, "exp": exp}, JWT_SECRET, algorithm=JWT_ALGORITHM)

@router.post("/login")
async def admin_login(req: LoginRequest):
    db = get_supabase()
    try:
        row = db.table("admin_users").select("*").eq("email", req.email.lower().strip()).maybe_single().execute()
    except Exception as e:
        raise HTTPException(503, f"admin_users table missing — run migration 001. ({e})")
    if not row.data or not pwd_ctx.verify(req.password, row.data["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    u = row.data
    return {"access_token": make_admin_token(u["email"], u["role"]), "token_type": "bearer",
            "role": u["role"], "email": u["email"], "expires_in": JWT_EXPIRE_H * 3600}

@router.post("/logout")
async def admin_logout():
    return {"status": "ok"}  # client drops token

@router.post("/create_admin")
async def create_admin(req: LoginRequest, bootstrap_secret: str = ""):
    if bootstrap_secret != ADMIN_SECRET:
        raise HTTPException(403, "Bootstrap secret required (pass as query param bootstrap_secret=...)")
    db = get_supabase()
    hashed = pwd_ctx.hash(req.password)
    try:
        db.table("admin_users").insert({"email": req.email.lower().strip(), "password_hash": hashed, "role": "admin"}).execute()
        return {"status": "created", "email": req.email}
    except Exception as e:
        raise HTTPException(400, str(e))
