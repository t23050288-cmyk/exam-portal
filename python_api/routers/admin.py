from fastapi import APIRouter, HTTPException, status, Header, Depends, File, UploadFile, Query, Request
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Optional
from core.config import get_settings
from db.supabase_client import get_supabase
from core.security import hash_password
from models.schemas import (
    AdminQuestionsResponse, AdminQuestionOut,
    QuestionCreate, QuestionUpdate,
    StudentStatus, StudentCreate, StudentUpdate,
    ExamConfig, ExamConfigUpdate, FolderRenameRequest,
    FolderEditBranchRequest, StudentDetailedStats, StudentExamHistory
)

from datetime import datetime, timezone
import io
import xlsxwriter

router = APIRouter(prefix="/admin", tags=["admin management"])
settings = get_settings()

async def verify_admin(x_admin_secret: str = Header(...)):
    """Security dependency to check for admin secret."""
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials"
        )
    return True

# ── Questions Management ──────────────────────────────────────

@router.get("/questions", response_model=AdminQuestionsResponse)
async def get_all_questions(_: bool = Depends(verify_admin)):
    """
    Retrieve all questions with Spectral Tag parsing for virtual folders.
    """
    db = get_supabase()
    result = db.table("questions").select("*").order("order_index").execute()
    
    processed_questions = []
    for q in result.data:
        text = q.get("text", "")
        exam_name = q.get("exam_name", "Initial Assessment")
        
        if text.startswith("⟦EXAM:"):
            end_idx = text.find("⟧")
            if end_idx != -1:
                tag_content = text[6:end_idx]
                exam_name = tag_content
                text = text[end_idx + 1:].strip()
        
        q["text"] = text
        q["exam_name"] = exam_name
        processed_questions.append(q)

    return AdminQuestionsResponse(questions=processed_questions, total=len(processed_questions))

@router.post("/questions")
async def create_question(request: QuestionCreate, _: bool = Depends(verify_admin)):
    try:
        db = get_supabase()
        data = request.model_dump()
        # Strip empty-string URL fields to avoid DB errors if column doesn't exist
        for url_field in ("audio_url", "image_url"):
            if url_field in data and not data[url_field]:
                del data[url_field]
        
        try:
            result = db.table("questions").insert(data).execute()
        except Exception as col_err:
            if "audio_url" in str(col_err):
                data.pop("audio_url", None)
                result = db.table("questions").insert(data).execute()
            else:
                raise

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to insert question - no data returned")

        return result.data[0]
    except Exception as e:
        print(f"CRITICAL create_question: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.patch("/questions/{question_id}")
async def update_question(question_id: str, request: QuestionUpdate, _: bool = Depends(verify_admin)):
    try:
        db = get_supabase()
        update_data = {k: v for k, v in request.model_dump().items() if v is not None}
        # Strip empty-string values for optional URL fields to avoid DB errors
        for url_field in ("audio_url", "image_url"):
            if url_field in update_data and update_data[url_field] == "":
                del update_data[url_field]
        
        try:
            result = db.table("questions").update(update_data).eq("id", question_id).execute()
        except Exception as col_err:
            if "audio_url" in str(col_err):
                # Column doesn't exist in DB — remove it and retry
                update_data.pop("audio_url", None)
                result = db.table("questions").update(update_data).eq("id", question_id).execute()
            else:
                raise

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update question - no data returned")

        return result.data[0]
    except Exception as e:
        print(f"CRITICAL update_question: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/questions/{question_id}")
async def delete_question(question_id: str, _: bool = Depends(verify_admin)):
    db = get_supabase()
    db.table("questions").delete().eq("id", question_id).execute()
    return {"deleted": True}

@router.post("/questions/upload")
async def upload_question_image(
    file: UploadFile = File(...),
    _: bool = Depends(verify_admin)
):
    """
    Upload a question image/audio/video to Cloudinary and return the public URL.
    Cloudinary bypasses Vercel 4.5MB payload limit via direct server-to-CDN upload.
    """
    import uuid, httpx, os
    from core.config import get_settings as _cs
    settings = _cs()

    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
    api_key = os.environ.get("CLOUDINARY_API_KEY", "")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET", "")

    if not cloud_name or not api_key or not api_secret:
        raise HTTPException(status_code=500, detail="Cloudinary credentials not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET env vars.")

    contents = await file.read()
    file_ext = (file.filename.split(".")[-1] if file.filename and "." in file.filename else "jpg").lower()
    
    # Determine resource type
    audio_exts = {"mp3", "wav", "ogg", "m4a", "aac", "flac", "webm"}
    video_exts = {"mp4", "mov", "avi", "mkv", "webm"}
    if file_ext in audio_exts:
        resource_type = "video"  # Cloudinary uses "video" for audio too
    elif file_ext in video_exts:
        resource_type = "video"
    else:
        resource_type = "image"

    upload_url = f"https://api.cloudinary.com/v1_1/{cloud_name}/{resource_type}/upload"

    import hashlib, time
    timestamp = str(int(time.time()))
    params_to_sign = f"folder=examguard&timestamp={timestamp}"
    signature = hashlib.sha1(f"{params_to_sign}{api_secret}".encode()).hexdigest()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                upload_url,
                data={
                    "api_key": api_key,
                    "timestamp": timestamp,
                    "signature": signature,
                    "folder": "examguard",
                },
                files={"file": (file.filename or f"upload.{file_ext}", contents, file.content_type or "application/octet-stream")},
            )
        result = resp.json()
        if "secure_url" not in result:
            raise HTTPException(status_code=500, detail=f"Cloudinary error: {result.get('error', {}).get('message', str(result))}")
        url = result["secure_url"]
        return {"url": url, "image_url": url, "resource_type": resource_type}
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Upload timed out — file may be too large")
    except Exception as e:
        print(f"CRITICAL upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── Admin Sign Upload (browser-direct-to-CDN) ─────────────────

@router.post("/sign-upload")
async def admin_sign_upload(_: bool = Depends(verify_admin)):
    """
    Return Cloudinary signature for direct browser-to-CDN upload.
    File never touches our server — bypasses Vercel 4.5MB limit.
    """
    import hashlib, time, os

    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
    api_key = os.environ.get("CLOUDINARY_API_KEY", "")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET", "")

    if not cloud_name or not api_key or not api_secret:
        raise HTTPException(status_code=500, detail="Cloudinary credentials not configured")

    timestamp = int(time.time())
    folder = "examguard"

    # Cloudinary signature: SHA1 of sorted params + api_secret
    params_to_sign = f"folder={folder}&timestamp={timestamp}"
    signature = hashlib.sha1(f"{params_to_sign}{api_secret}".encode()).hexdigest()

    return {
        "cloud_name": cloud_name,
        "api_key": api_key,
        "timestamp": timestamp,
        "signature": signature,
        "folder": folder,
        "upload_url": f"https://api.cloudinary.com/v1_1/{cloud_name}/auto/upload",
    }


# ── Students Management ───────────────────────────────────────

@router.get("/students", response_model=list[StudentStatus])
async def get_all_students(_: bool = Depends(verify_admin)):
    try:
        db = get_supabase()
        # Query students table and join exam_status (left join via select)
        result = db.table("students").select("id, usn, email, name, branch, exam_status(status, warnings, last_active, submitted_at, started_at)").execute()

        rows = []
        if result.data:
            for r in result.data:
                # result.data[0]['exam_status'] is a list in Supabase JS/Python client when using select with foreign key
                status_list = r.get("exam_status")
                
                # If there are multiple exam statuses (unlikely in current schema but possible), 
                # we pick the first one or default.
                status_data = status_list[0] if isinstance(status_list, list) and len(status_list) > 0 else (status_list or {})

                rows.append(StudentStatus(
                    student_id=r["id"],
                    usn=r.get("usn", "UNKNOWN"),
                    name=r.get("name", "UNKNOWN"),
                    email=r.get("email"),
                    branch=r.get("branch", "CS"),
                    status=status_data.get("status", "not_started"),
                    warnings=status_data.get("warnings", 0),
                    last_active=status_data.get("last_active"),
                    submitted_at=status_data.get("submitted_at"),
                    started_at=status_data.get("started_at")
                ))
        return rows
    except Exception as e:
        print(f"CRITICAL get_all_students: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.post("/students")

async def create_student(request: StudentCreate, _: bool = Depends(verify_admin)):
    db = get_supabase()
    existing = db.table("students").select("id").eq("usn", request.usn.upper()).execute()

    if existing.data:
        raise HTTPException(status_code=400, detail="USN already exists")

    student_data = {
        "usn": request.usn.upper(),
        "name": request.name,
        "email": request.email,
        "branch": request.branch,
        "password_hash": hash_password(request.password)
    }

    try:
        s_result = db.table("students").insert(student_data).execute()
    except Exception as e:
        print(f"CRITICAL create_student: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if not s_result.data:
        raise HTTPException(status_code=500, detail="Failed to insert student - no data returned")

    student = s_result.data[0]
    db.table("exam_status").insert({"student_id": student["id"]}).execute()
    return student

@router.patch("/students/{student_id}")
async def update_student(student_id: str, request: StudentUpdate, _: bool = Depends(verify_admin)):
    db = get_supabase()

    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.email is not None:
        update_data["email"] = request.email
    if request.branch is not None:
        update_data["branch"] = request.branch
    if request.password is not None:
        update_data["password_hash"] = hash_password(request.password)
    if request.is_active_session is not None:
        update_data["is_active_session"] = request.is_active_session
        if not request.is_active_session:
            update_data["current_token"] = None

    if update_data:
        db.table("students").update(update_data).eq("id", student_id).execute()

    return {"updated": True}

@router.delete("/students/{student_id}")
async def delete_student(student_id: str, _: bool = Depends(verify_admin)):
    db = get_supabase()
    db.table("students").delete().eq("id", student_id).execute()
    return {"deleted": True}

@router.post("/students/{student_id}/reset")
async def reset_student_exam(student_id: str, _: bool = Depends(verify_admin)):
    """Reset a student's exam so they can retake it."""
    db = get_supabase()

    db.table("students").update({
        "is_active_session": False,
        "current_token": None
    }).eq("id", student_id).execute()

    db.table("exam_status").update({
        "status": "not_started",
        "warnings": 0,
        "started_at": None,
        "submitted_at": None,
        "last_active": None
    }).eq("student_id", student_id).execute()

    # db.table("exam_results").delete().eq("student_id", student_id).execute() # REMOVED: Keep history
    return {"reset": True}


@router.post("/students/cleanup-stale")
async def cleanup_stale_sessions(_: bool = Depends(verify_admin)):
    """Reset ALL active student sessions back to not_started (full cleanup)."""
    db = get_supabase()
    
    # Get ALL currently active sessions (no time filter — reset everyone)
    stale_res = db.table("exam_status").select("student_id").eq("status", "active").execute()
    stale_ids = [r["student_id"] for r in (stale_res.data or [])]
    
    if not stale_ids:
        return {"count": 0, "message": "No active sessions to clean up"}

    db.table("exam_status").update({
        "status": "not_started",
        "started_at": None,
        "last_active": None,
        "warnings": 0,
        "submitted_at": None
    }).in_("student_id", stale_ids).execute()

    # db.table("exam_results").delete().in_("student_id", stale_ids).execute() # REMOVED: Keep history

    db.table("students").update({
        "is_active_session": False,
        "current_token": None
    }).in_("id", stale_ids).execute()

    return {"count": len(stale_ids), "message": f"Reset {len(stale_ids)} active sessions"}

@router.post("/students/{student_id}/force-submit")
async def force_submit_student(student_id: str, _: bool = Depends(verify_admin)):
    """Admin tool to force submission of a student session using current saved answers."""
    db = get_supabase()
    
    student_res = db.table("students").select("branch").eq("id", student_id).single().execute()
    if not student_res.data:
        raise HTTPException(status_code=404, detail="Student not found")
    branch = student_res.data["branch"]

    results_res = db.table("exam_results").select("answers").eq("student_id", student_id).single().execute()
    answers = results_res.data.get("answers") or {} if results_res.data else {}
    
    qs_res = db.table("questions").select("id, correct_answer, marks").eq("branch", branch).execute()
    correct_map = {q["id"]: (q["correct_answer"], q["marks"]) for q in (qs_res.data or [])}

    score = 0
    total_marks = sum(m for _, m in correct_map.values())
    for q_id, selected in answers.items():
        if q_id in correct_map:
            correct_ans, marks = correct_map[q_id]
            if selected == correct_ans:
                score += marks

    submitted_at = datetime.now(timezone.utc).isoformat()
    
    if results_res.data:
        db.table("exam_results").update({
            "score": score,
            "total_marks": total_marks,
            "submitted_at": submitted_at
        }).eq("student_id", student_id).execute()
    else:
        db.table("exam_results").insert({
            "student_id": student_id,
            "answers": answers,
            "score": score,
            "total_marks": total_marks,
            "submitted_at": submitted_at
        }).execute()

    db.table("exam_status").update({
        "status": "submitted",
        "submitted_at": submitted_at
    }).eq("student_id", student_id).execute()

    db.table("students").update({
        "is_active_session": False,
        "current_token": None
    }).eq("id", student_id).execute()

    return {"status": "success", "score": score}


# ── Student Detailed Stats (Analytics) ────────────────────────

@router.get("/student-detailed-stats", response_model=list[StudentDetailedStats])
async def get_student_detailed_stats(
    branch: Optional[str] = Query("all"),
    category: Optional[str] = Query("all"),
    _: bool = Depends(verify_admin)
):
    """Aggregate detailed performance metrics for all students with history."""
    db = get_supabase()
    
    # 1. Fetch students
    query = db.table("students").select("id, usn, name, email, branch")
    if branch and branch != "all":
        query = query.eq("branch", branch)
    
    students_res = query.execute()
    students_data = students_res.data or []
    
    if not students_data:
        return []
    
    student_ids = [s["id"] for s in students_data]
    
    # 2. Fetch all results for these students
    results_query = db.table("exam_results").select("*").in_("student_id", student_ids)
    if category and category != "all":
        results_query = results_query.eq("category", category)
    
    results_res = results_query.execute()
    results_data = results_res.data or []
    
    # 3. Aggregate
    stats_map = {}
    for s in students_data:
        stats_map[s["id"]] = {
            "student_id": s["id"],
            "usn": s["usn"],
            "name": s["name"],
            "email": s["email"],
            "branch": s["branch"],
            "exams_completed": 0,
            "total_percentage": 0.0,
            "last_exam_at": None,
            "history": []
        }
    
    for r in results_data:
        sid = r["student_id"]
        if sid not in stats_map:
            continue
            
        score = r.get("score", 0)
        total = r.get("total_marks", 0)
        pct = (score / total * 100) if total > 0 else 0
        
        history_item = StudentExamHistory(
            exam_title=r.get("exam_title", "Unknown Exam"),
            score=score,
            total_marks=total,
            percentage=round(pct, 1),
            submitted_at=r.get("submitted_at", ""),
            category=r.get("category", "Others")
        )
        
        stats_map[sid]["history"].append(history_item)
        stats_map[sid]["exams_completed"] += 1
        stats_map[sid]["total_percentage"] += pct
        
        submitted_at = r.get("submitted_at")
        if submitted_at:
            if not stats_map[sid]["last_exam_at"] or submitted_at > stats_map[sid]["last_exam_at"]:
                stats_map[sid]["last_exam_at"] = submitted_at
                
    # 4. Finalize
    final_stats = []
    for sid, data in stats_map.items():
        if data["exams_completed"] > 0:
            data["average_percentage"] = round(data["total_percentage"] / data["exams_completed"], 1)
        else:
            data["average_percentage"] = 0.0
            
        # Sort history by date descending
        data["history"].sort(key=lambda x: x.submitted_at, reverse=True)
        
        # Remove helper field
        helper_pct = data.pop("total_percentage")
        
        final_stats.append(StudentDetailedStats(**data))
        
    return final_stats


# ── Exam Config (Orbital Control) ─────────────────────────────

@router.get("/exam/config", response_model=ExamConfig)
async def get_exam_config(title: Optional[str] = None, _: bool = Depends(verify_admin)):
    """Get exam activation state and schedule. If title is provided, fetch specific config."""
    db = get_supabase()
    try:
        query = db.table("exam_config").select("*").neq("exam_title", "PYHUNT_GLOBAL_CONFIG")
        if title:
            result = query.eq("exam_title", title).execute()
        else:
            result = query.limit(1).execute()

        if result.data:
            row = result.data[0]
            return ExamConfig(
                is_active=row.get("is_active", True),
                scheduled_start=row.get("scheduled_start"),
                scheduled_end=row.get("scheduled_end"),
                duration_minutes=row.get("duration_minutes", 60),
                exam_title=row.get("exam_title", "ExamGuard Assessment"),
                marks_per_question=row.get("marks_per_question", 4),
                negative_marks=float(row.get("negative_marks") if row.get("negative_marks") is not None else -1.0),
                shuffle_questions=row.get("shuffle_questions", False),
                shuffle_options=row.get("shuffle_options", False),
                max_attempts=row.get("max_attempts", 1),
                show_answers_after=row.get("show_answers_after", True),
                total_questions=row.get("total_questions", 30),
                total_marks=row.get("total_marks", 120),
                exam_description=row.get("exam_description"),
            )
    except Exception as e:
        print(f"Error fetching config: {e}")
    
    return ExamConfig(exam_title=title) if title else ExamConfig()


@router.post("/exam/config", response_model=ExamConfig)
async def update_exam_config(request: ExamConfigUpdate, _: bool = Depends(verify_admin)):
    """Update exam activation state, schedule, duration by title (upsert)."""
    db = get_supabase()

    if not request.exam_title:
        raise HTTPException(status_code=400, detail="exam_title is required for configuration")

    # ── Build update payload — only include columns that exist in the DB ──────
    # Core columns always present
    update_data: dict = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "exam_title": request.exam_title,
    }
    if request.is_active is not None:
        update_data["is_active"] = request.is_active
    if request.scheduled_start is not None:
        update_data["scheduled_start"] = request.scheduled_start
    if request.duration_minutes is not None:
        update_data["duration_minutes"] = request.duration_minutes
    if request.category is not None:
        update_data["category"] = request.category

    # Extended columns — only add if they exist in the actual DB schema
    # We discover this by doing a test SELECT; if columns missing, skip gracefully
    try:
        _schema_check = db.table("exam_config").select("scheduled_end").limit(1).execute()
        if request.scheduled_end is not None:
            update_data["scheduled_end"] = request.scheduled_end
    except Exception:
        pass  # column doesn't exist yet

    for col, val in [
        ("marks_per_question", request.marks_per_question),
        ("negative_marks", request.negative_marks),
        ("shuffle_questions", request.shuffle_questions),
        ("shuffle_options", request.shuffle_options),
        ("max_attempts", request.max_attempts),
        ("show_answers_after", request.show_answers_after),
        ("total_questions", request.total_questions),
        ("total_marks", request.total_marks),
        ("exam_description", request.exam_description),
    ]:
        if val is not None:
            update_data[col] = val

    try:
        # Multiple exams can be active simultaneously (different branches)
        # Safe insert-or-update: check if a row with this exam_title already exists
        existing = db.table("exam_config").select("exam_title").eq("exam_title", request.exam_title).limit(1).execute()
        if existing.data:
            # Row exists — UPDATE it
            result = db.table("exam_config").update(update_data).eq("exam_title", request.exam_title).execute()
        else:
            # No row yet — INSERT it
            result = db.table("exam_config").insert(update_data).execute()
        
        if result.data:
            row = result.data[0]
            return ExamConfig(
                is_active=row.get("is_active", True),
                scheduled_start=row.get("scheduled_start"),
                scheduled_end=row.get("scheduled_end"),
                duration_minutes=row.get("duration_minutes", 60),
                exam_title=row.get("exam_title"),
                marks_per_question=row.get("marks_per_question", 4),
                negative_marks=float(row.get("negative_marks") if row.get("negative_marks") is not None else -1.0),
                shuffle_questions=row.get("shuffle_questions", False),
                shuffle_options=row.get("shuffle_options", False),
                max_attempts=row.get("max_attempts", 1),
                show_answers_after=row.get("show_answers_after", True),
                total_questions=row.get("total_questions", 30),
                total_marks=row.get("total_marks", 120),
                exam_description=row.get("exam_description"),
            )
    except Exception as e:
        err_str = str(e)
        if "PGRST205" in err_str or "Could not find the table" in err_str:
            raise HTTPException(
                status_code=400,
                detail="Database Table Missing: Please run the SQL script in 'supabase/exam_config.sql' in your Supabase SQL Editor to initialize the multi-quiz system."
            )
        print(f"CRITICAL update_exam_config: {e}")
        raise HTTPException(status_code=500, detail=err_str)

    return ExamConfig(**{k: v for k, v in update_data.items() if k in ExamConfig.model_fields})


@router.get("/exam/config/public")
async def get_exam_config_public():
    """Public exam config endpoint (no auth) — returns all configurations."""
    db = get_supabase()
    try:
        result = db.table("exam_config").select("is_active, scheduled_start, duration_minutes, exam_title").neq("exam_title", "PYHUNT_GLOBAL_CONFIG").execute()
        return result.data or []
    except Exception:
        return []

# ── PyHunt Config Endpoints ─────────────────────────────────────

@router.get("/pyhunt/config")
async def get_pyhunt_config_public():
    """Student public endpoint — returns live PyHunt config via service role (bypasses RLS)."""
    db = get_supabase()
    try:
        result = db.table("exam_config").select("category, updated_at").eq("exam_title", "PYHUNT_GLOBAL_CONFIG").limit(1).execute()
        if result.data and result.data[0].get("category"):
            import json as _json
            cfg = _json.loads(result.data[0]["category"])
            return {"ok": True, "config": cfg, "updated_at": result.data[0].get("updated_at")}
        return {"ok": False, "config": None}
    except Exception as e:
        print(f"get_pyhunt_config error: {e}")
        return {"ok": False, "config": None}


@router.post("/pyhunt/config/save")
async def save_pyhunt_config(request: Request, _: bool = Depends(verify_admin)):
    """Admin saves PyHunt config — uses service role key, bypasses RLS entirely."""
    db = get_supabase()
    try:
        body = await request.json()
        config_str = body.get("config")
        if not config_str:
            raise HTTPException(status_code=400, detail="Missing 'config' field")
        import json as _json
        _json.loads(config_str)  # Validate it parses cleanly
        existing = db.table("exam_config").select("id").eq("exam_title", "PYHUNT_GLOBAL_CONFIG").limit(1).execute()
        if existing.data:
            db.table("exam_config").update({"category": config_str, "is_active": True, "duration_minutes": 0}).eq("exam_title", "PYHUNT_GLOBAL_CONFIG").execute()
        else:
            db.table("exam_config").insert({"exam_title": "PYHUNT_GLOBAL_CONFIG", "category": config_str, "is_active": True, "duration_minutes": 0}).execute()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        print(f"save_pyhunt_config error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pyhunt/progress/reset")
async def reset_pyhunt_progress(student_id: str, _: bool = Depends(verify_admin)):
    """Reset a student's PyHunt progress to Round 1."""
    db = get_supabase()
    try:
        db.table("pyhunt_progress").update({
            "current_round": "Round 1",
            "status": "active",
            "warnings": 0,
            "last_violation": None,
            "turtle_image": None
        }).eq("student_id", student_id).execute()
        return {"ok": True}
    except Exception as e:
        print(f"reset_pyhunt_progress error: {e}")
        raise HTTPException(500, str(e))

@router.delete("/pyhunt/progress/{student_id}")
async def delete_pyhunt_progress(student_id: str, _: bool = Depends(verify_admin)):
    """Remove a student from the PyHunt progress table."""
    db = get_supabase()
    try:
        db.table("pyhunt_progress").delete().eq("student_id", student_id).execute()
        return {"ok": True}
    except Exception as e:
        print(f"delete_pyhunt_progress error: {e}")
        raise HTTPException(500, str(e))


# ── Orbital Node Management (Folder CRUD) ─────────────────────

@router.delete("/folders/{folder_name}")
async def delete_folder(folder_name: str, _: bool = Depends(verify_admin)):
    """Delete an entire Isolation Node (Folder) and all its questions."""
    db = get_supabase()
    probe = db.table("questions").select("*").limit(1).execute()
    has_exam_column = False
    if probe.data and len(probe.data) > 0:
        has_exam_column = "exam_name" in probe.data[0].keys()

    if has_exam_column:
        db.table("questions").delete().eq("exam_name", folder_name).execute()
    else:
        tag_prefix = f"⟦EXAM:{folder_name}⟧"
        db.table("questions").delete().like("text", f"{tag_prefix}%").execute()

    return {"status": "success", "deleted_folder": folder_name}


@router.patch("/folders/{folder_name}")
async def rename_folder(folder_name: str, request: FolderRenameRequest, _: bool = Depends(verify_admin)):
    """Rename an entire Isolation Node (Folder)."""
    db = get_supabase()
    new_name = request.new_name.strip()
    probe = db.table("questions").select("*").limit(1).execute()
    has_exam_column = False
    if probe.data and len(probe.data) > 0:
        has_exam_column = "exam_name" in probe.data[0].keys()

    if has_exam_column:
        db.table("questions").update({"exam_name": new_name}).eq("exam_name", folder_name).execute()
    else:
        tag_old = f"⟦EXAM:{folder_name}⟧"
        tag_new = f"⟦EXAM:{new_name}⟧"
        res = db.table("questions").select("id, text").like("text", f"{tag_old}%").execute()
        for q in res.data:
            updated_text = q["text"].replace(tag_old, tag_new, 1)
            db.table("questions").update({"text": updated_text}).eq("id", q["id"]).execute()

    return {"status": "success", "old_name": folder_name, "new_name": new_name}


@router.patch("/folders/{folder_name}/branch")
async def edit_folder_branch(folder_name: str, request: FolderEditBranchRequest, _: bool = Depends(verify_admin)):
    """Update the branch for an entire Isolation Node (Folder)."""
    db = get_supabase()
    new_branch = request.new_branch.strip()
    probe = db.table("questions").select("*").limit(1).execute()
    has_exam_column = False
    if probe.data and len(probe.data) > 0:
        has_exam_column = "exam_name" in probe.data[0].keys()

    if has_exam_column:
        db.table("questions").update({"branch": new_branch}).eq("exam_name", folder_name).execute()
    else:
        tag_prefix = f"⟦EXAM:{folder_name}⟧"
        res = db.table("questions").select("id").like("text", f"{tag_prefix}%").execute()
        for q in res.data:
            db.table("questions").update({"branch": new_branch}).eq("id", q["id"]).execute()

    return {"status": "success", "folder": folder_name, "new_branch": new_branch}


# ── Crystalline Data Export ───────────────────────────────────

@router.get("/export")
async def export_results(
    quiz_name: Optional[str] = Query(None),
    _: bool = Depends(verify_admin)
):
    """Export all exam results as a structured Excel file."""
    try:
        import xlsxwriter
    except ImportError:
        raise HTTPException(status_code=500, detail="xlsxwriter not installed")

    db = get_supabase()
    student_ids = None
    if quiz_name:
        qs = db.table("questions").select("id").eq("exam_name", quiz_name).execute()
        q_ids = [str(q["id"]) for q in (qs.data or [])]
        all_res = db.table("exam_results").select("student_id, answers").execute()
        targeted_student_ids = []
        for r in (all_res.data or []):
            ans_keys = r.get("answers", {}).keys()
            if any(str(qid) in ans_keys for qid in q_ids):
                targeted_student_ids.append(r["student_id"])
        student_ids = set(targeted_student_ids)

    results_query = db.table("exam_results").select("student_id, score, total_marks, submitted_at")
    if student_ids is not None:
        if not student_ids:
            return JSONResponse(status_code=200, content={"detail": f"No results found for quiz: {quiz_name}"})
        results_query = results_query.in_("student_id", list(student_ids))
    
    results = results_query.execute()
    statuses = db.table("exam_status").select("student_id, started_at, status, warnings").execute()
    students = db.table("students").select("id, usn, name, branch, email").execute()

    status_map = {s["student_id"]: s for s in (statuses.data or [])}
    student_map = {s["id"]: s for s in (students.data or [])}

    rows = []
    for r in (results.data or []):
        sid = r["student_id"]
        student = student_map.get(sid, {})
        exam_st = status_map.get(sid, {})
        score = r.get("score") or 0
        total = r.get("total_marks") or 0
        pct = round(score / total * 100, 1) if total else 0.0
        time_taken = ""
        if r.get("submitted_at") and exam_st.get("started_at"):
            try:
                t0 = datetime.fromisoformat(exam_st["started_at"].replace("Z", "+00:00"))
                t1 = datetime.fromisoformat(r["submitted_at"].replace("Z", "+00:00"))
                secs = int((t1 - t0).total_seconds())
                time_taken = f"{secs // 60}m {secs % 60}s"
            except Exception:
                pass

        rows.append({
            "USN": student.get("usn", ""),
            "Name": student.get("name", ""),
            "Branch": student.get("branch", ""),
            "Email": student.get("email", ""),
            "Status": exam_st.get("status", ""),
            "Score": score,
            "Total Marks": total,
            "Percentage (%)": pct,
            "Time Taken": time_taken,
            "Warnings": exam_st.get("warnings", 0),
            "Submitted At": r.get("submitted_at", ""),
        })

    if rows:
        rows.sort(key=lambda x: -x["Percentage (%)"])
    
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})
    worksheet = workbook.add_worksheet("Results")

    header_fmt = workbook.add_format({
        "bold": True, "bg_color": "#1a1a2e", "font_color": "#e0aaff",
        "border": 1, "align": "center", "valign": "vcenter", "font_size": 11,
    })
    cell_fmt = workbook.add_format({"border": 1, "valign": "vcenter", "font_size": 10})
    pct_fmt = workbook.add_format({"border": 1, "valign": "vcenter", "num_format": '0.0"%"', "font_size": 10})
    top_fmt = workbook.add_format({
        "border": 1, "valign": "vcenter", "font_size": 10,
        "bg_color": "#f0fff4", "bold": True,
    })

    headers = list(rows[0].keys()) if rows else [
        "USN", "Name", "Branch", "Email", "Status", "Score",
        "Total Marks", "Percentage (%)", "Time Taken", "Warnings", "Submitted At"
    ]

    worksheet.set_row(0, 22)
    for col, h in enumerate(headers):
        worksheet.write(0, col, h, header_fmt)
        worksheet.set_column(col, col, max(len(h) + 4, 14))

    for row_idx, row in enumerate(rows, start=1):
        fmt = top_fmt if row_idx <= 3 else cell_fmt
        for col_idx, key in enumerate(headers):
            val = row.get(key, "")
            if key == "Percentage (%)":
                worksheet.write_number(row_idx, col_idx, val, pct_fmt)
            else:
                worksheet.write(row_idx, col_idx, val, fmt)

    workbook.close()
    output.seek(0)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = quiz_name.replace(" ", "_").lower() if quiz_name else "all"
    filename = f"examguard_results_{safe_name}_{timestamp}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.delete("/leaderboard/all")
async def delete_all_leaderboard(_: bool = Depends(verify_admin)):
    """Delete all exam results (leaderboard data). Student records are preserved."""
    db = get_supabase()
    # Delete all exam_results (this clears leaderboard)
    db.table("exam_results").delete().neq("student_id", "00000000-0000-0000-0000-000000000000").execute()
    # Also reset exam_status to not_started for all students
    db.table("exam_status").update({
        "status": "not_started",
        "started_at": None,
        "submitted_at": None,
        "last_active": None,
        "warnings": 0
    }).neq("student_id", "00000000-0000-0000-0000-000000000000").execute()
    db.table("students").update({
        "is_active_session": False,
        "current_token": None
    }).neq("id", "00000000-0000-0000-0000-000000000000").execute()
    return {"success": True, "message": "All leaderboard data cleared"}



# ── Code Questions Management ─────────────────────────────────

from models.schemas import CodeQuestionCreate

@router.get("/code-questions/{question_id}")
async def get_code_question(question_id: str, _: bool = Depends(verify_admin)):
    """Get code question metadata (test cases, starter code) for a question."""
    db = get_supabase()
    result = db.table("code_questions").select("*").eq("question_id", question_id).limit(1).execute()
    if not result.data:
        return {}
    return result.data[0]


@router.post("/code-questions")
async def upsert_code_question(request: CodeQuestionCreate, _: bool = Depends(verify_admin)):
    """Create or update code question metadata (test cases, starter code)."""
    db = get_supabase()
    payload = {
        "question_id": request.question_id,
        "starter_code": request.starter_code,
        "language": request.language,
        "test_cases": [tc.model_dump() for tc in request.test_cases],
        "time_limit_ms": request.time_limit_ms,
    }
    existing = db.table("code_questions").select("id").eq("question_id", request.question_id).execute()
    if existing.data:
        db.table("code_questions").update(payload).eq("question_id", request.question_id).execute()
    else:
        db.table("code_questions").insert(payload).execute()
    return {"saved": True}


@router.delete("/code-questions/{question_id}")
async def delete_code_question(question_id: str, _: bool = Depends(verify_admin)):
    """Delete code question metadata."""
    db = get_supabase()
    db.table("code_questions").delete().eq("question_id", question_id).execute()
    return {"deleted": True}


# ── Exam Config Aliases (frontend uses /exam-config, backend has /exam/config) ─

@router.get("/exam-config")
async def get_exam_config_alias(title: Optional[str] = None, _: bool = Depends(verify_admin)):
    """Alias for /exam/config — frontend compatibility."""
    return await get_exam_config(title=title, _=_)

@router.post("/exam-config")
async def update_exam_config_alias(request: ExamConfigUpdate, _: bool = Depends(verify_admin)):
    """Alias for POST /exam/config — frontend compatibility."""
    return await update_exam_config(request=request, _=_)

@router.get("/exam-config/{exam_id}")
async def get_exam_config_by_id_alias(exam_id: str, _: bool = Depends(verify_admin)):
    """Get exam config by id or title."""
    db = get_supabase()
    try:
        result = db.table("exam_config").select("*").eq("id", exam_id).limit(1).execute()
        if result.data:
            row = result.data[0]
            return ExamConfig(
                id=row.get("id"),
                is_active=row.get("is_active", True),
                scheduled_start=row.get("scheduled_start"),
                scheduled_end=row.get("scheduled_end"),
                duration_minutes=row.get("duration_minutes", 60),
                exam_title=row.get("exam_title", "ExamGuard Assessment"),
                marks_per_question=row.get("marks_per_question", 4),
                negative_marks=float(row.get("negative_marks") if row.get("negative_marks") is not None else -1.0),
                shuffle_questions=row.get("shuffle_questions", False),
                shuffle_options=row.get("shuffle_options", False),
                max_attempts=row.get("max_attempts", 1),
                show_answers_after=row.get("show_answers_after", True),
                total_questions=row.get("total_questions", 30),
                total_marks=row.get("total_marks", 120),
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=404, detail="Exam config not found")

@router.patch("/exam-config/{exam_id}")
async def patch_exam_config_alias(exam_id: str, request: ExamConfigUpdate, _: bool = Depends(verify_admin)):
    """PATCH exam config by id."""
    db = get_supabase()
    update_data = {k: v for k, v in request.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        result = db.table("exam_config").update(update_data).eq("id", exam_id).execute()
        if result.data:
            row = result.data[0]
            return ExamConfig(
                id=row.get("id"),
                is_active=row.get("is_active", True),
                exam_title=row.get("exam_title", ""),
                duration_minutes=row.get("duration_minutes", 60),
                scheduled_start=row.get("scheduled_start"),
                scheduled_end=row.get("scheduled_end"),
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=404, detail="Exam config not found")


# ── Bulk Student CSV Upload ───────────────────────────────────────────────────

import csv
import io as _io
from passlib.context import CryptContext as _CryptCtx

_pwd = _CryptCtx(schemes=["bcrypt"], deprecated="auto")

@router.post("/students/bulk")
async def bulk_upload_students(file: UploadFile = File(...), _=Depends(verify_admin)):
    """
    Upload CSV: usn,name,email,branch,password (password optional — defaults to USN).
    Returns {created, skipped, errors}.
    """
    if not (file.filename or "").endswith(".csv"):
        raise HTTPException(400, "Only CSV files accepted")
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(_io.StringIO(raw))
    db = get_supabase()
    created = skipped = 0
    errors: list = []
    rows: list = []
    for i, row in enumerate(reader, start=2):
        usn    = (row.get("usn") or row.get("USN") or "").strip().upper()
        name   = (row.get("name") or row.get("Name") or "").strip()
        email  = (row.get("email") or row.get("Email") or "").strip() or None
        branch = (row.get("branch") or row.get("Branch") or "CS").strip().upper()
        pw     = (row.get("password") or row.get("Password") or "").strip() or usn
        if not usn or not name:
            errors.append({"line": i, "error": "usn and name required"})
            continue
        rows.append({"usn": usn, "name": name, "email": email,
                     "branch": branch, "password_hash": _pwd.hash(pw)})

    for chunk in [rows[i:i+50] for i in range(0, len(rows), 50)]:
        try:
            res = db.table("students").upsert(chunk, on_conflict="usn").execute()
            created += len(res.data or [])
        except Exception as e:
            for r in chunk:
                try:
                    ex = db.table("students").select("usn").eq("usn", r["usn"]).maybe_single().execute()
                    if ex.data:
                        skipped += 1
                    else:
                        db.table("students").insert(r).execute()
                        created += 1
                except Exception as ie:
                    errors.append({"usn": r.get("usn"), "error": str(ie)})

    return {"created": created, "skipped": skipped, "errors": errors,
            "total_rows": len(rows), "csv_template": "/api/admin/students/csv_template"}


@router.get("/students/csv_template")
async def csv_template(_=Depends(verify_admin)):
    """Download blank CSV template for bulk upload."""
    tpl = "usn,name,email,branch,password\n1RV21CS001,John Doe,john@college.edu,CS,\n1RV21IS002,Jane Smith,jane@college.edu,IS,\n"
    return StreamingResponse(
        io.StringIO(tpl),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=students_template.csv"},
    )
