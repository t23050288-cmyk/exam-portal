from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from core.config import get_settings

settings = get_settings()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Bearer token extractor
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


from fastapi import Depends, HTTPException, status, Request

async def get_current_student(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    """FastAPI dependency — extracts and validates JWT, or allows bypass with admin secret."""
    
    # Check for Admin Secret bypass first (for preview purposes)
    admin_secret = request.headers.get("X-Admin-Secret")
    if admin_secret == settings.admin_secret:
            return {
                "student_id": "ADMIN_PREVIEW",
                "usn": "ADMIN_PREVIEW",
                "branch": "CS",
                "token": "ADMIN_SECRET_BYPASS"
            }

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization credentials missing",
        )

    token = credentials.credentials
    payload = decode_token(token)

    student_id = payload.get("sub")
    # Support both 'usn' (new) and 'roll_number' (legacy)
    usn = payload.get("usn") or payload.get("roll_number")
    name = payload.get("name", "Student")
    branch = payload.get("branch", "CS")

    if not student_id or not usn:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload: student_id or usn missing",
        )

    # ── SELF-HEAL: Resolve 'Syncing...' branch if it leaked into JWT ──
    if branch == "Syncing..." or not branch:
        try:
            db = get_supabase()
            res = db.table("students").select("branch, name").eq("id", student_id).maybe_single().execute()
            if res.data:
                if res.data.get("branch"):
                    branch = res.data["branch"]
                if res.data.get("name"):
                    name = res.data["name"]
                print(f"[SECURITY] Resolved profile for student {usn}")
        except:
            branch = "CS" # Fallback to CS if DB check fails

    return {
        "student_id": student_id,
        "usn": usn,
        "name": name,
        "branch": branch,
        "token": token
    }
