from fastapi import APIRouter, HTTPException, status, Depends
from typing import Dict, Any
from datetime import datetime, timezone, timedelta

from models.schemas import LoginRequest, LoginResponse
from core.security import verify_password, hash_password, create_access_token, get_current_student
from core.config import get_settings
from core.question_cache import get_cached_config, set_cached_config
from db.supabase_client import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

# ─────────────────────────────────────────────────────────────────────────────
# In-process cache for exam_config (shared with exam.py via question_cache)
# 100 students logging in simultaneously = 1 exam_config query, not 100.
# ─────────────────────────────────────────────────────────────────────────────
import threading
_exam_config_cache: dict = {}
_exam_config_lock = threading.Lock()
_EXAM_CONFIG_TTL = 60  # seconds

def _get_active_exam_configs(db) -> list:
    """Return active exam configs. Cached for 60s to absorb login bursts."""
    import time
    cache_key = "__active_exam_configs__"
    with _exam_config_lock:
        entry = _exam_config_cache.get(cache_key)
        if entry and time.monotonic() < entry[1]:
            return entry[0]
    # Outside lock for the DB call
    result = (
        db.table("exam_config")
        .select("*")
        .eq("is_active", True)
        .order("updated_at", desc=True)
        .execute()
    )
    data = result.data or []
    with _exam_config_lock:
        import time as _t
        _exam_config_cache[cache_key] = (data, _t.monotonic() + _EXAM_CONFIG_TTL)
    return data


def _get_question_count_for_exam(db, exam_title: str, branch: str) -> int:
    """
    Return cached question count for (exam_title, branch).
    Avoids a DB hit per student per login.
    """
    import time
    cache_key = f"qcount::{exam_title.strip().lower()}::{branch.strip().upper()}"
    with _exam_config_lock:
        entry = _exam_config_cache.get(cache_key)
        if entry and time.monotonic() < entry[1]:
            return entry[0]
    try:
        q_check = (
            db.table("questions")
            .select("id", count="exact")
            .eq("exam_name", exam_title)
            .ilike("branch", f"%{branch.strip().upper()}%")
            .execute()
        )
        count = q_check.count or 0
    except Exception:
        count = 0
    with _exam_config_lock:
        import time as _t
        _exam_config_cache[cache_key] = (count, _t.monotonic() + _EXAM_CONFIG_TTL)
    return count


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Authenticate student. Hardened for 100 concurrent logins:
    - Student lookup: 1 targeted query (indexed USN)
    - exam_config: served from 60s in-process cache
    - question count: served from 60s in-process cache
    - exam_status: 1 query, combined with student fetch result
    Total DB writes per login: 1 (update students.current_token)
    Total DB reads per login: 2 (students, exam_status)
    """
    db = get_supabase()

    # ── 1. Find student by USN (single indexed query) ───────────────────────
    try:
        result = (
            db.table("students")
            .select("id, usn, email, name, branch, password_hash, is_active_session, current_token")
            .eq("usn", request.usn.strip().upper())
            .limit(1)
            .execute()
        )
    except Exception as e:
        print(f"[AUTH] DB query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    # ── 2. Auto-register if new student ─────────────────────────────────────
    if not result.data:
        if not request.name or not request.name.strip():
            raise HTTPException(status_code=400, detail="Full Name is required for registration.")
        if not request.email or not request.email.strip():
            raise HTTPException(status_code=400, detail="Email Address is required for registration.")
        try:
            insert_res = db.table("students").insert({
                "usn": request.usn.strip().upper(),
                "name": request.name.strip(),
                "email": request.email.strip(),
                "branch": request.branch or "CS",
                "password_hash": hash_password(request.password)
            }).execute()
            if not insert_res.data:
                raise HTTPException(status_code=500, detail="Failed to register student")
            student = insert_res.data[0]
            # Create exam_status row in background (non-blocking via fire-and-forget)
            try:
                db.table("exam_status").insert({"student_id": student["id"], "status": "not_started"}).execute()
            except Exception:
                pass  # Non-fatal
        except HTTPException:
            raise
        except Exception as e:
            print(f"[AUTH] Auto-registration failed: {e}")
            raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
        exam_status_data = None
    else:
        student = result.data[0]

        # ── 3. Password check (CPU-only, no DB) ─────────────────────────────
        if not verify_password(request.password, student["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid USN or password",
            )

        # ── 4. Fetch exam_status (single query, light) ───────────────────────
        try:
            es_res = (
                db.table("exam_status")
                .select("status, started_at, submitted_at")
                .eq("student_id", student["id"])
                .limit(1)
                .execute()
            )
            exam_status_data = es_res.data[0] if es_res.data else None
        except Exception:
            exam_status_data = None

    # ── 5. Mint JWT (CPU-only) ───────────────────────────────────────────────
    current_branch = request.branch or student.get("branch", "CS")
    current_name = request.name or student.get("name", "Student")
    token = create_access_token(data={
        "sub": student["id"],
        "usn": student.get("usn", ""),
        "name": current_name,
        "branch": current_branch,
    })

    # ── 6. Update token (1 write, async-safe) ────────────────────────────────
    try:
        db.table("students").update({
            "is_active_session": True,
            "current_token": token,
            "last_login": datetime.now(timezone.utc).isoformat()
        }).eq("id", student["id"]).execute()
    except Exception as e:
        print(f"[AUTH] Optional token update failed (non-fatal): {e}")

    # ── 7. Ensure exam_status row exists (only if missing) ───────────────────
    started_at = None
    if exam_status_data:
        if exam_status_data.get("status") == "active":
            started_at = exam_status_data.get("started_at")
    elif result.data:
        # Existing student with no exam_status row — create it
        try:
            db.table("exam_status").insert(
                {"student_id": student["id"], "status": "not_started"}
            ).execute()
        except Exception:
            pass  # May already exist due to race condition — that's fine

    # ── 8. Resolve exam (cached, no per-student DB query) ────────────────────
    active_configs = _get_active_exam_configs(db)

    current_exam_title = "Initial Assessment"
    current_duration = 20
    current_total_questions = 0
    selected_config = None

    if active_configs:
        # Find the first exam that has questions for this branch (cached count)
        for cfg in active_configs:
            title = cfg.get("exam_title", "")
            count = _get_question_count_for_exam(db, title, current_branch)
            if count > 0:
                selected_config = cfg
                current_exam_title = title
                current_duration = cfg.get("duration_minutes") or 20
                current_total_questions = count
                break

        # Fallback: use most recently updated active exam
        if not selected_config:
            selected_config = active_configs[0]
            current_exam_title = selected_config.get("exam_title", current_exam_title)
            current_duration = selected_config.get("duration_minutes") or 20
            current_total_questions = selected_config.get("total_questions") or 30

    return LoginResponse(
        access_token=token,
        student_id=student["id"],
        student_name=current_name,
        email=request.email or student.get("email"),
        branch=current_branch,
        usn=student.get("usn"),
        exam_start_time=started_at,
        exam_duration_minutes=current_duration,
        exam_title=current_exam_title,
        total_questions=current_total_questions,
    )


@router.post("/logout")
async def logout(current: dict = Depends(get_current_student)):
    """Clear session flag so student can log in from another device if needed."""
    db = get_supabase()
    try:
        db.table("students").update(
            {"is_active_session": False, "current_token": None}
        ).eq("id", current["student_id"]).execute()
    except Exception:
        pass
    return {"logged_out": True}
