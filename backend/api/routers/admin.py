from fastapi import APIRouter, HTTPException, status, Header, Depends, File, UploadFile, Query
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
        # Default exam name from DB or model default
        exam_name = q.get("exam_name", "Initial Assessment")
        
        # ── Spectral Tag Parser ──
        # Pattern: ⟦EXAM:My Name⟧
        if text.startswith("⟦EXAM:"):
            end_idx = text.find("⟧")
            if end_idx != -1:
                # Extract the tag
                tag_content = text[6:end_idx]
                # Override exam_name for the response
                exam_name = tag_content
                # Strip the tag from the text
                text = text[end_idx + 1:].strip()
        
        # Build the final object
        q["text"] = text
        q["exam_name"] = exam_name
        processed_questions.append(q)

    return AdminQuestionsResponse(questions=processed_questions, total=len(processed_questions))

@router.post("/questions")
async def create_question(request: QuestionCreate, _: bool = Depends(verify_admin)):
    try:
        db = get_supabase()
        data = request.model_dump()
        result = db.table("questions").insert(data).execute()

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
        result = db.table("questions").update(update_data).eq("id", question_id).execute()

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
    Upload a question image to Supabase Storage and return the public URL.
    """
    import uuid
    db = get_supabase()
    
    # 1. Bucket initialization (Safe-check)
    bucket_name = "question-images"
    try:
        buckets = db.storage.list_buckets()
        if not any(b.name == bucket_name for b in buckets):
            db.storage.create_bucket(bucket_name, options={"public": True})
    except Exception as e:
        print(f"Bucket init alert: {e}")

    # 2. File preparation
    file_ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    unique_name = f"{uuid.uuid4()}.{file_ext}"
    contents = await file.read()

    # 3. Upload to Supabase Storage
    try:
        # Use storage.from_(...).upload pattern
        res = db.storage.from_(bucket_name).upload(
            path=unique_name,
            file=contents,
            file_options={"content-type": file.content_type or "image/jpeg"}
        )
        
        # 4. Generate Public URL
        # Format: {BASE_URL}/storage/v1/object/public/{bucket}/{path}
        public_url = db.storage.from_(bucket_name).get_public_url(unique_name)
        
        return {"image_url": public_url}
    except Exception as e:
        print(f"CRITICAL image_upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── Students Management ───────────────────────────────────────

@router.get("/students", response_model=list[StudentStatus])
async def get_all_students(_: bool = Depends(verify_admin)):
    db = get_supabase()
    result = db.table("exam_status").select("*, students(usn, email, name, branch)").execute()

    rows = []
    for r in result.data:
        student_info = r.get("students")
        if not student_info:
            continue

        rows.append(StudentStatus(
            student_id=r["student_id"],
            usn=student_info.get("usn", "UNKNOWN"),
            name=student_info.get("name", "UNKNOWN"),
            email=student_info.get("email"),
            branch=student_info.get("branch", "CS"),
            status=r["status"],
            warnings=r["warnings"],
            last_active=r["last_active"],
            submitted_at=r["submitted_at"],
            started_at=r.get("started_at")
        ))
    return rows

@router.post("/students")
async def create_student(request: StudentCreate, _: bool = Depends(verify_admin)):
    db = get_supabase()
    existing = db.table("students").select("id").eq("usn", request.usn.upper()).execute()

    if existing.data:
        raise HTTPException(status_code=400, detail="USN already exists")

    student_data = {
        "usn": request.usn.upper(),
        "roll_number": request.usn.upper(),
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

    db.table("exam_results").delete().eq("student_id", student_id).execute()

    return {"reset": True}

@router.post("/students/cleanup-stale")
async def cleanup_stale_sessions(_: bool = Depends(verify_admin)):
    """Bulk move sessions idle for > 4h to 'submitted' (force-submit) or reset them."""
    # For now, we'll reset them to prevent infinite 'Active' state
    from datetime import timedelta
    db = get_supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
    
    # 1. Find stale IDs
    stale_res = db.table("exam_status").select("student_id").eq("status", "active").lt("last_active", cutoff).execute()
    stale_ids = [r["student_id"] for r in (stale_res.data or [])]
    
    if not stale_ids:
        return {"count": 0}

    # 2. Reset status
    db.table("exam_status").update({
        "status": "not_started",
        "started_at": None,
        "last_active": None,
        "warnings": 0
    }).in_("student_id", stale_ids).execute()

    # 3. Clear results to keep it clean
    db.table("exam_results").delete().in_("student_id", stale_ids).execute()

    # 4. Clear active sessions
    db.table("students").update({
        "is_active_session": False,
        "current_token": None
    }).in_("id", stale_ids).execute()

    return {"count": len(stale_ids)}

@router.post("/students/{student_id}/force-submit")
async def force_submit_student(student_id: str, _: bool = Depends(verify_admin)):
    """Admin tool to force submission of a student session using current saved answers."""
    db = get_supabase()
    
    # 1. Fetch student for context (branch)
    student_res = db.table("students").select("branch").eq("id", student_id).single().execute()
    if not student_res.data:
        raise HTTPException(status_code=404, detail="Student not found")
    branch = student_res.data["branch"]

    # 2. Get saved answers
    results_res = db.table("exam_results").select("answers").eq("student_id", student_id).single().execute()
    answers = results_res.data.get("answers") or {} if results_res.data else {}
    
    # 3. Calculate Score
    # Fetch questions for this branch
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
    
    # 4. Finalize session
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

# ── Exam Config (Orbital Control) ─────────────────────────────

@router.get("/exam/config", response_model=ExamConfig)
async def get_exam_config(title: Optional[str] = None, _: bool = Depends(verify_admin)):
    """Get exam activation state and schedule. If title is provided, fetch specific config."""
    db = get_supabase()
    try:
        query = db.table("exam_config").select("*")
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

    update_data: dict = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "exam_title": request.exam_title
    }
    if request.is_active is not None:
        update_data["is_active"] = request.is_active
    if request.scheduled_start is not None:
        update_data["scheduled_start"] = request.scheduled_start
    if request.scheduled_end is not None:
        update_data["scheduled_end"] = request.scheduled_end
    if request.duration_minutes is not None:
        update_data["duration_minutes"] = request.duration_minutes
    if request.marks_per_question is not None:
        update_data["marks_per_question"] = request.marks_per_question
    if request.negative_marks is not None:
        update_data["negative_marks"] = request.negative_marks
    if request.shuffle_questions is not None:
        update_data["shuffle_questions"] = request.shuffle_questions
    if request.shuffle_options is not None:
        update_data["shuffle_options"] = request.shuffle_options
    if request.max_attempts is not None:
        update_data["max_attempts"] = request.max_attempts
    if request.show_answers_after is not None:
        update_data["show_answers_after"] = request.show_answers_after
    if request.total_questions is not None:
        update_data["total_questions"] = request.total_questions
    if request.total_marks is not None:
        update_data["total_marks"] = request.total_marks
    if request.exam_description is not None:
        update_data["exam_description"] = request.exam_description

    try:
        # Use upsert based on UNIQUE exam_title
        result = db.table("exam_config").upsert(update_data, on_conflict="exam_title").execute()
        
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
        result = db.table("exam_config").select("is_active, scheduled_start, scheduled_end, duration_minutes, exam_title").execute()
        return result.data or []
    except Exception:
        return []


# ── Orbital Node Management (Folder CRUD) ─────────────────────

@router.delete("/folders/{folder_name}")
async def delete_folder(folder_name: str, _: bool = Depends(verify_admin)):
    """
    Delete an entire Isolation Node (Folder) and all its questions.
    """
    db = get_supabase()
    
    # Discovery
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
    """
    Rename an entire Isolation Node (Folder).
    Updates column or Spectral Tag.
    """
    db = get_supabase()
    new_name = request.new_name.strip()
    
    # Discovery
    probe = db.table("questions").select("*").limit(1).execute()
    has_exam_column = False
    if probe.data and len(probe.data) > 0:
        has_exam_column = "exam_name" in probe.data[0].keys()

    if has_exam_column:
        db.table("questions").update({"exam_name": new_name}).eq("exam_name", folder_name).execute()
    else:
        # Spectral Tag Rename: Fetch and batch update
        tag_old = f"⟦EXAM:{folder_name}⟧"
        tag_new = f"⟦EXAM:{new_name}⟧"
        
        # Get all relevant questions
        res = db.table("questions").select("id, text").like("text", f"{tag_old}%").execute()
        
        for q in res.data:
            updated_text = q["text"].replace(tag_old, tag_new, 1)
            db.table("questions").update({"text": updated_text}).eq("id", q["id"]).execute()

    return {"status": "success", "old_name": folder_name, "new_name": new_name}


# ── Crystalline Data Export ───────────────────────────────────

@router.get("/export")
async def export_results(
    quiz_name: Optional[str] = Query(None),
    _: bool = Depends(verify_admin)
):
    """
    Export all exam results as a structured Excel file.
    Includes: student info, score, percentage, time taken, submitted_at.
    """
    try:
        import xlsxwriter  # type: ignore
    except ImportError:
        raise HTTPException(status_code=500, detail="xlsxwriter not installed")

    db = get_supabase()
    
    # ── Filtering Logic ──
    student_ids = None
    if quiz_name:
        # 1. Find all question IDs for this quiz
        qs = db.table("questions").select("id").eq("exam_name", quiz_name).execute()
        q_ids = [str(q["id"]) for q in (qs.data or [])]
        
        # 2. Find result records that have at least one answer for these questions
        # This is a bit tricky with Supabase's JSON filtering, so we'll fetch all and filter in memory
        # to ensure accuracy across all result formats.
        all_res = db.table("exam_results").select("student_id, answers").execute()
        targeted_student_ids = []
        for r in (all_res.data or []):
            ans_keys = r.get("answers", {}).keys()
            if any(str(qid) in ans_keys for qid in q_ids):
                targeted_student_ids.append(r["student_id"])
        
        student_ids = set(targeted_student_ids)

    # Gather data
    results_query = db.table("exam_results").select("student_id, score, total_marks, submitted_at")
    if student_ids is not None:
        if not student_ids: # No one took this quiz
            return JSONResponse(status_code=200, content={"detail": f"No results found for quiz: {quiz_name}"})
        results_query = results_query.in_("student_id", list(student_ids))
    
    results = results_query.execute()
    statuses = db.table("exam_status").select("student_id, started_at, status, warnings").execute()
    students = db.table("students").select("id, usn, name, branch, email").execute()

    status_map = {s["student_id"]: s for s in (statuses.data or [])}
    student_map = {s["id"]: s for s in (students.data or [])}

    # Build rows
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

    # Sort by percentage descending
    rows.sort(key=lambda x: -x["Percentage (%)"])

    # Build Excel in memory
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})
    worksheet = workbook.add_worksheet("Results")

    # Formats
    header_fmt = workbook.add_format({
        "bold": True, "bg_color": "#1a1a2e", "font_color": "#e0aaff",
        "border": 1, "align": "center", "valign": "vcenter", "font_size": 11,
    })
    cell_fmt = workbook.add_format({"border": 1, "valign": "vcenter", "font_size": 10})
    pct_fmt = workbook.add_format({"border": 1, "valign": "vcenter", "num_format": "0.0\"%\"", "font_size": 10})
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
