from fastapi import APIRouter, HTTPException, status, Depends
from typing import Dict, Any
from datetime import datetime, timezone, timedelta

from models.schemas import LoginRequest, LoginResponse
from core.security import verify_password, hash_password, create_access_token, get_current_student
from core.config import get_settings
from db.supabase_client import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Authenticate student with USN + password.
    Enforces single-session: rejects login if another device is already active.
    Returns JWT + exam timing info.
    """
    db = get_supabase()

    # 1. Find student by USN
    try:
        result = (
            db.table("students")
            .select("id, usn, email, name, branch, password_hash, is_active_session, current_token")
            .eq("usn", request.usn.strip().upper())
            .limit(1)
            .execute()
        )
    except Exception as e:
        print(f"[AUTH] Database query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    if not result.data or len(result.data) == 0:
        # ── AUTO-REGISTRATION LOGIC ──
        # Since student not found, create them. Make sure Name and Email are provided!
        if not request.name or not request.name.strip():
            raise HTTPException(status_code=400, detail="Full Name is required for registration.")
        if not request.email or not request.email.strip():
            raise HTTPException(status_code=400, detail="Email Address is required for registration.")

        try:
            # Create the student record
            new_student_data = {
                "usn": request.usn.strip().upper(),
                "name": request.name.strip(),
                "email": request.email.strip(),
                "branch": request.branch or "CS",
                "password_hash": hash_password(request.password)
            }
            insert_res = db.table("students").insert(new_student_data).execute()
            if not insert_res.data:
                raise HTTPException(status_code=500, detail="Failed to register student")
            
            student = insert_res.data[0]
            # Initialize exam_status for the new student
            db.table("exam_status").insert({"student_id": student["id"]}).execute()
            
        except Exception as e:
            print(f"[AUTH] Auto-registration failed: {e}")
            raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
    else:
        student = result.data[0]

    # 2. Verify password
    if not verify_password(request.password, student["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid USN or password",
        )

    # 3. Check for duplicate active session
    is_active = student.get("is_active_session", False)
    current_tok = student.get("current_token")
    if is_active and current_tok:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already logged in from another device. Please log out there first.",
        )

    # 4. Check if exam already submitted
    try:
        exam_status_res = (
            db.table("exam_status")
            .select("status, started_at, submitted_at")
            .eq("student_id", student["id"])
            .limit(1)
            .execute()
        )
        exam_status_data = exam_status_res.data[0] if exam_status_res.data and len(exam_status_res.data) > 0 else None
    except Exception as e:
        exam_status_data = None

    if exam_status_data and exam_status_data.get("status") == "submitted":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You have already submitted this exam.",
        )

    # 5. Create JWT token
    student_id_val = student.get("usn", "")
    current_branch = request.branch or student.get("branch", "CS")
    current_name = request.name or student.get("name", "Student")
    token = create_access_token(
        data={
            "sub": student["id"], 
            "usn": student_id_val, 
            "name": current_name,
            "branch": current_branch
        }
    )

    # 6. Mark session active + record token
    try:
        update_student_data: Dict[str, Any] = {"is_active_session": True, "current_token": token}
        if request.name: update_student_data["name"] = request.name
        if request.email: update_student_data["email"] = request.email
        if request.branch: update_student_data["branch"] = request.branch

        db.table("students").update(update_student_data).eq("id", student["id"]).execute()
    except Exception as e:
        print(f"[AUTH] Optional student update failed: {e}")

    # 7. Ensure exam_status row exists
    started_at = None
    if exam_status_data:
        if exam_status_data.get("status") == "active":
            started_at = exam_status_data.get("started_at")
    else:
        db.table("exam_status").insert(
            {"student_id": student["id"], "status": "not_started"}
        ).execute()

    # 8. Fetch the LATEST active exam config
    exam_conf = (
        db.table("exam_config")
        .select("title, duration_minutes, total_questions")
        .eq("is_active", True)
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    
    current_exam_title = "Initial Assessment"
    current_duration = 20
    current_total_questions = 30
    
    if exam_conf.data:
        current_exam_title = exam_conf.data[0].get("title", current_exam_title)
        current_duration = exam_conf.data[0].get("duration_minutes") or 20
        current_total_questions = exam_conf.data[0].get("total_questions", current_total_questions)

    # Calculate how many questions actually exist
    try:
        q_count = db.table("questions").select("id", count="exact").eq("branch", current_branch).eq("exam_name", current_exam_title).execute()
        if not q_count.count:
            q_count = db.table("questions").select("id", count="exact").eq("branch", current_branch).ilike("exam_name", f"%{current_exam_title}%").execute()
        if not q_count.count:
            q_count = db.table("questions").select("id", count="exact").eq("branch", current_branch).execute()
            
        if q_count.count and q_count.count > 0:
            current_total_questions = q_count.count
    except Exception as e:
        print(f"[AUTH] Error counting questions: {e}")

    return LoginResponse(
        access_token=token,
        student_id=student["id"],
        student_name=request.name or student.get("name"),
        email=request.email or student.get("email"),
        branch=current_branch,
        exam_start_time=started_at,
        exam_duration_minutes=current_duration,
        exam_title=current_exam_title,
        total_questions=current_total_questions,
    )


@router.post("/logout")
async def logout(current: dict = Depends(get_current_student)) :
    """Clear session flag so student can log in from another device if needed."""
    db = get_supabase()
    db.table("students").update(
        {"is_active_session": False, "current_token": None}
    ).eq("id", current["student_id"]).execute()
    return {"logged_out": True}
