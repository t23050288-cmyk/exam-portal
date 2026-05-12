from fastapi.responses import Response
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from datetime import datetime, timezone

from models.schemas import (
    QuestionsResponse, QuestionOut, TestCaseOut,
    SaveAnswerRequest, SaveAnswerResponse,
    SubmitExamRequest, SubmitExamResponse,
    StartExamResponse,
    BatchSaveRequest, BatchSaveResponse,
    BatchEventsRequest, BatchEventsResponse,
    CodeSubmitRequest, CodeSubmitResponse,
)
from core.security import get_current_student
from db.supabase_client import get_supabase

router = APIRouter(prefix="/exam", tags=["exam"])


def _check_exam_active(title: str):
    """Raises 423 if the exam has been deactivated by admin."""
    db = get_supabase()
    try:
        # FIX: Use 'title' column instead of 'exam_title'
        result = db.table("exam_config").select("is_active, scheduled_start").eq("exam_title", title).limit(1).execute()
        if result.data:
            row = result.data[0]
            if not row.get("is_active", True):
                raise HTTPException(
                    status_code=423,
                    detail="exam_inactive",
                )
            scheduled = row.get("scheduled_start")
            if scheduled:
                start_dt = datetime.fromisoformat(scheduled.replace("Z", "+00:00"))
                if start_dt > datetime.now(timezone.utc):
                    raise HTTPException(
                        status_code=425,
                        detail=f"exam_scheduled:{scheduled}",
                    )
    except HTTPException:
        raise
    except Exception:
        pass  # If table doesn't exist yet, default to active


def update_last_active(student_id: str):
    """Background task to update student's last active timestamp."""
    db = get_supabase()
    db.table("exam_status").update(
        {"last_active": datetime.now(timezone.utc).isoformat()}
    ).eq("student_id", student_id).execute()
@router.get("/status")
def get_exam_status(title: str = None, current: dict = Depends(get_current_student)):
    """
    Returns the current student's exam session status for a specific exam.
    """
    db = get_supabase()
    student_id = current["student_id"]
    try:
        query = db.table("exam_status").select("*").eq("student_id", student_id)
        if title:
            query = query.eq("exam_title", title)
        result = query.execute()
        return {"data": result.data or []}
    except Exception as e:
        print(f"[EXAM] Status fetch error: {e}")
        return {"data": []}


@router.get("/history")
def get_exam_history(current: dict = Depends(get_current_student)):
    """
    Returns the student's past exam results.
    """
    db = get_supabase()
    student_id = current["student_id"]
    try:
        result = db.table("exam_results").select("*").eq("student_id", student_id).order("submitted_at", desc=True).execute()
        return {"results": result.data or []}
    except Exception as e:
        print(f"[EXAM] History fetch error: {e}")
        return {"results": []}
@router.get("/questions", response_model=QuestionsResponse)
def get_questions(
    title: str,
    background_tasks: BackgroundTasks,
    response: Response,
    current: dict = Depends(get_current_student)
):
    """
    Return all questions for a specific exam title and branch.
    """
    _check_exam_active(title)
    # Questions are immutable during an exam session — cache privately in browser
    # for 30 minutes. On refresh, student gets instant load from their own browser.
    response.headers["Cache-Control"] = "private, max-age=1800, stale-while-revalidate=600"
    db = get_supabase()

    # Update last_active in background
    background_tasks.add_task(update_last_active, current["student_id"])

    try:
        branch = current.get("branch", "CS")
        # ── Branch-Only Matching (Python-side filtering) ──
        # To avoid Supabase PostgREST URL encoding crashes with `%`, we fetch 
        # questions and filter them securely in Python.
        # Try with audio_url first; if column doesn't exist, retry without it
        try:
            result = (
                db.table("questions")
                .select("id, text, options, branch, order_index, marks, exam_name, image_url, audio_url, question_type, category")
                .order("order_index")
                .limit(500)
                .execute()
            )
        except Exception as col_err:
            if "audio_url" in str(col_err):
                print(f"[EXAM] audio_url column missing, retrying without it: {col_err}")
                result = (
                    db.table("questions")
                    .select("id, text, options, branch, order_index, marks, exam_name, image_url, question_type, category")
                    .order("order_index")
                    .limit(500)
                    .execute()
                )
            else:
                raise
        
        all_questions = result.data or []
        print(f"[EXAM] DB fetched {len(all_questions)} questions from table.")
        
        filtered_data = []
        student_branch_upper = branch.strip().upper()
        
        for q in all_questions:
            q_branch = (q.get("branch") or "").strip()
            q_exam = q.get("exam_name") or ""
            
            # ALWAYS parse spectral tag from text — it is the authoritative source
            text = q.get("text", "")
            if text.startswith("⟦EXAM:"):
                end_idx = text.find("⟧")
                if end_idx != -1:
                    q_exam = text[6:end_idx].strip()

            # Normalize for comparison
            title_norm = title.strip().lower()
            q_exam_norm = q_exam.strip().lower()
            
            # Very loose matching: exactly equal, no spaces equal, or substring
            exam_match = (
                q_exam_norm == title_norm
                or q_exam_norm.replace(" ", "") == title_norm.replace(" ", "")
                or title_norm in q_exam_norm
                or q_exam_norm in title_norm
            )
            if not exam_match:
                continue

            # Branch matching
            if not q_branch:
                filtered_data.append(q)
                continue

            q_branch_upper = q_branch.upper()
            branch_match = (
                student_branch_upper == q_branch_upper
                or student_branch_upper in q_branch_upper
                or q_branch_upper in student_branch_upper
            )
            if branch_match:
                filtered_data.append(q)

        # Fallback: ignore branch if nothing matched
        if not filtered_data:
            print(f"[EXAM] Fallback: No branch match for '{branch}'. Retrying with just title='{title}'.")
            for q in all_questions:
                q_exam = q.get("exam_name") or ""
                text = q.get("text", "")
                if text.startswith("⟦EXAM:"):
                    end_idx = text.find("⟧")
                    if end_idx != -1:
                        q_exam = text[6:end_idx].strip()
                
                qe = q_exam.strip().lower()
                tn = title.strip().lower()
                if qe == tn or qe.replace(" ", "") == tn.replace(" ", "") or tn in qe or qe in tn:
                    filtered_data.append(q)
        
        print(f"[EXAM] Final filtered count for '{title}' (branch: {branch}): {len(filtered_data)}")
                
    except Exception as e:
        print(f"[EXAM] CRITICAL DB Error: {e}")
        import traceback
        traceback.print_exc()
        return QuestionsResponse(questions=[], total=0)

    # Fetch code_questions data for code-type questions
    code_q_ids = [q["id"] for q in filtered_data if q.get("question_type") == "code"]
    code_q_map = {}
    if code_q_ids:
        try:
            cq_result = db.table("code_questions").select("*").in_("question_id", code_q_ids).execute()
            for cq in (cq_result.data or []):
                code_q_map[cq["question_id"]] = cq
        except Exception as e:
            print(f"[EXAM] code_questions fetch error: {e}")

    questions = []
    for q in filtered_data:
        qtype = q.get("question_type", "mcq")
        cq = code_q_map.get(q["id"]) if qtype == "code" else None
        test_cases = None
        starter_code = None
        if cq:
            starter_code = cq.get("starter_code", "")
            raw_tests = cq.get("test_cases") or []
            test_cases = [TestCaseOut(**t) for t in raw_tests]
        questions.append(QuestionOut(
            id=q["id"],
            text=q["text"].replace(f"⟦EXAM:{title}⟧", "").strip(),
            options=q["options"] if qtype == "mcq" else [],
            branch=q.get("branch", branch),
            order_index=q["order_index"],
            marks=q["marks"],
            image_url=q.get("image_url"),
            audio_url=q.get("audio_url"),
            question_type=qtype,
            starter_code=starter_code,
            test_cases=test_cases,
        ))

    return QuestionsResponse(questions=questions, total=len(questions))

@router.get("/test-branch")
def test_branch(branch: str):
    db = get_supabase()
    try:
        result = (
            db.table("questions")
            .select("id, text, options, branch, order_index, marks, exam_name, image_url")
            .ilike("branch", f"%{branch}%")
            .order("order_index")
            .limit(100)
            .execute()
        )
        return {"success": True, "data": result.data}
    except Exception as e:
        return {"success": False, "error": str(e), "type": str(type(e))}


@router.post("/save-answer", response_model=SaveAnswerResponse)
def save_answer(
    request: SaveAnswerRequest,
    background_tasks: BackgroundTasks,
    current: dict = Depends(get_current_student),
):
    """
    Upsert a single answer for (student_id, question_id).
    Also updates last_active in background. Used by auto-save every 15s.
    """
    db = get_supabase()
    student_id = current["student_id"]

    # Guard: reject if already submitted
    status_row = (
        db.table("exam_status")
        .select("status")
        .eq("student_id", student_id)
        .single()
        .execute()
    )
    if status_row.data and status_row.data["status"] == "submitted":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Exam already submitted. Cannot save answers.",
        )

    # Fetch existing answers
    existing = (
        db.table("exam_results")
        .select("answers")
        .eq("student_id", student_id)
        .execute()
    )

    if existing.data:
        answers = existing.data[0].get("answers") or {}
        answers[request.question_id] = request.selected_option
        db.table("exam_results").update({"answers": answers}).eq(
            "student_id", student_id
        ).execute()
    else:
        db.table("exam_results").insert(
            {
                "student_id": student_id,
                "answers": {request.question_id: request.selected_option},
                "score": 0,
            }
        ).execute()

    # Update last_active in background
    background_tasks.add_task(update_last_active, student_id)

    return SaveAnswerResponse(saved=True, question_id=request.question_id)


@router.post("/submit-exam", response_model=SubmitExamResponse)
def submit_exam(
    request: SubmitExamRequest,
    current: dict = Depends(get_current_student),
):
    """
    Finalize the exam:
    1. Reject if already submitted (idempotent safety)
    2. Calculate score against correct answers
    3. Save final answers + score
    4. Mark status as submitted
    5. Clear active session
    """
    db = get_supabase()
    student_id = current["student_id"]

    # 1. Guard: already submitted this SPECIFIC exam?
    exam_title_for_check = (request.answers or {}).get("__exam_title", "")
    status_rows = (
        db.table("exam_results")
        .select("id")
        .eq("student_id", student_id)
        .eq("exam_title", exam_title_for_check)
        .limit(1)
        .execute()
    )
    if status_rows.data:
        # Return existing result from exam_results instead of global exam_status
        result_row = (
            db.table("exam_results")
            .select("score, total_marks, submitted_at, correct_count, wrong_count")
            .eq("student_id", student_id)
            .eq("exam_title", exam_title_for_check)
            .single()
            .execute()
        )
        r = result_row.data or {}
        total = r.get("total_marks", 0)
        score = r.get("score", 0)
        return SubmitExamResponse(
            submitted=True,
            score=score,
            total_marks=total,
            correct_count=r.get("correct_count", 0),  # These would need to be in DB too if we want persistence
            wrong_count=r.get("wrong_count", 0),
            percentage=round(score / total * 100, 1) if total else 0,
            submitted_at=r.get("submitted_at", datetime.now(timezone.utc).isoformat()),
        )

    # 2. Load correct answers ONLY for the question IDs the student was served
    answers = request.answers
    exam_title = answers.pop("__exam_title", "Initial Assessment")

    # Get the exact question IDs submitted by the student (excluding meta keys)
    submitted_ids = [k for k in answers.keys() if not k.startswith("__")]

    # Fetch only those specific questions from DB
    questions_result = (
        db.table("questions")
        .select("id, correct_answer, marks")
        .in_("id", submitted_ids)
        .execute()
    )

    correct_map = {
        q["id"]: (q["correct_answer"], q["marks"])
        for q in (questions_result.data or [])
    }

    score = 0
    correct_count = 0
    wrong_count = 0
    # total_marks = marks for the questions the student actually received
    total_marks = sum(marks for _, marks in correct_map.values())

    for q_id, selected in answers.items():
        if q_id in correct_map:
            correct_ans, marks = correct_map[q_id]
            if selected == correct_ans:
                score += marks
                correct_count += 1
            else:
                wrong_count += 1

    submitted_at = datetime.now(timezone.utc).isoformat()

    # 4. Upsert exam_results — use student_id + exam_title as composite key
    # so multiple exams per student are stored as separate rows
    existing = (
        db.table("exam_results")
        .select("id")
        .eq("student_id", student_id)
        .eq("exam_title", exam_title)
        .execute()
    )
    if existing.data:
        db.table("exam_results").update(
            {"answers": answers, "score": score, "total_marks": total_marks, "submitted_at": submitted_at}
        ).eq("student_id", student_id).eq("exam_title", exam_title).execute()
    else:
        db.table("exam_results").insert(
            {"student_id": student_id, "exam_title": exam_title, "answers": answers, "score": score, "total_marks": total_marks, "submitted_at": submitted_at}
        ).execute()

    # 5. Clean up active session for THIS exam
    # Instead of global "submitted", we clear the record or mark it finished for this title
    db.table("exam_status").delete().eq("student_id", student_id).eq("exam_title", exam_title).execute()
    
    # Update global student active status
    db.table("students").update({"is_active_session": False}).eq("id", student_id).execute()

    # 6. Clear active session
    db.table("students").update(
        {"is_active_session": False, "current_token": None}
    ).eq("id", student_id).execute()

    return SubmitExamResponse(
        submitted=True,
        score=score,
        total_marks=total_marks,
        correct_count=correct_count,
        wrong_count=wrong_count,
        percentage=round(score / total_marks * 100, 1) if total_marks else 0,
        submitted_at=submitted_at,
    )


@router.post("/start-exam", response_model=StartExamResponse)
async def start_exam(
    title: str,
    current: dict = Depends(get_current_student)
):
    """
    Officially starts the exam timer for the student.
    Sets status to 'active' and records 'started_at'.
    Returns the start time so the frontend can sync.
    """
    _check_exam_active(title)
    db = get_supabase()
    student_id = current["student_id"]

    # 1. Check if already started or submitted (single-row schema — no exam_title column)
    status_res = db.table("exam_status").select("status, started_at").eq("student_id", student_id).limit(1).execute()
    data = status_res.data[0] if status_res.data else {}

    if data.get("status") == "submitted":
        raise HTTPException(status_code=403, detail="Exam already submitted.")

    # 2. If already active, return existing start time
    if data.get("status") == "active" and data.get("started_at"):
        return StartExamResponse(started_at=data["started_at"], status="active", started=True, exam_title=title)

    # 3. Otherwise, set the start time NOW and RESET warnings to 0
    started_at = datetime.now(timezone.utc).isoformat()
    if data:
        # Row exists — update it and reset warnings
        db.table("exam_status").update({
            "status": "active", 
            "started_at": started_at, 
            "last_active": started_at,
            "warnings": 0  # Reset for new session
        }).eq("student_id", student_id).execute()
    else:
        # No row yet — insert one
        try:
            db.table("exam_status").insert({
                "student_id": student_id,
                "status": "active", 
                "started_at": started_at, 
                "last_active": started_at,
                "warnings": 0
            }).execute()
        except Exception:
            db.table("exam_status").update({
                "status": "active", 
                "started_at": started_at, 
                "last_active": started_at,
                "warnings": 0
            }).eq("student_id", student_id).execute()

    return StartExamResponse(started_at=started_at, status="active")


# ── NEW: Batch Save Answers ───────────────────────────────────


@router.post("/batch-save", response_model=BatchSaveResponse)
def batch_save_answers(
    request: BatchSaveRequest,
    background_tasks: BackgroundTasks,
    current: dict = Depends(get_current_student),
):
    """
    Batch upsert multiple answers in a single DB write.
    Replaces the per-answer save endpoint — one request per 30s instead of N.
    """
    db = get_supabase()
    student_id = current["student_id"]

    if not request.answers:
        return BatchSaveResponse(saved=True, count=0)

    # Guard: reject if already submitted
    status_row = db.table("exam_status").select("status").eq("student_id", student_id).single().execute()
    if status_row.data and status_row.data["status"] == "submitted":
        return BatchSaveResponse(saved=False, count=0)

    # Fetch existing answers and merge
    existing = db.table("exam_results").select("answers").eq("student_id", student_id).execute()
    if existing.data:
        merged = existing.data[0].get("answers") or {}
        merged.update(request.answers)
        db.table("exam_results").update({"answers": merged}).eq("student_id", student_id).execute()
    else:
        db.table("exam_results").insert({
            "student_id": student_id,
            "answers": request.answers,
            "score": 0,
        }).execute()

    background_tasks.add_task(update_last_active, student_id)
    return BatchSaveResponse(saved=True, count=len(request.answers))


# ── NEW: Batch Telemetry Events ───────────────────────────────

@router.post("/batch-events", response_model=BatchEventsResponse)
def batch_events(
    request: BatchEventsRequest,
    current: dict = Depends(get_current_student),
):
    """
    Accept a batch of telemetry events from the client queue.
    Inserts all events as a single row (append-only log).
    """
    db = get_supabase()
    student_id = current["student_id"]

    if not request.events:
        return BatchEventsResponse(received=0)

    events_data = [e.model_dump() for e in request.events]
    try:
        db.table("telemetry_batches").insert({
            "student_id": student_id,
            "events": events_data,
        }).execute()
    except Exception as e:
        print(f"[TELEMETRY] Batch insert error: {e}")

    return BatchEventsResponse(received=len(request.events))


# ── NEW: Submit Code Answer (Pyodide result) ──────────────────

@router.post("/submit-code", response_model=CodeSubmitResponse)
def submit_code(
    request: CodeSubmitRequest,
    background_tasks: BackgroundTasks,
    current: dict = Depends(get_current_student),
):
    """
    Upsert Pyodide code execution result for a question.
    Stores the student's code + test results in code_submissions table.
    """
    db = get_supabase()
    student_id = current["student_id"]

    # Guard: reject if already submitted AND is_final
    if request.is_final:
        status_row = db.table("exam_status").select("status").eq("student_id", student_id).single().execute()
        if status_row.data and status_row.data["status"] == "submitted":
            return CodeSubmitResponse(
                saved=False,
                question_id=request.question_id,
                passed_count=request.passed_count,
                total_count=request.total_count,
            )

    results_data = [r.model_dump() for r in request.test_results]

    try:
        # Try upsert (unique on student_id + question_id)
        existing = (
            db.table("code_submissions")
            .select("id")
            .eq("student_id", student_id)
            .eq("question_id", request.question_id)
            .execute()
        )
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        payload = {
            "student_id": student_id,
            "question_id": request.question_id,
            "code": request.code,
            "language": "python",
            "test_results": results_data,
            "passed_count": request.passed_count,
            "total_count": request.total_count,
            "is_final": request.is_final,
            "submitted_at": now,
        }
        if existing.data:
            db.table("code_submissions").update(payload).eq("student_id", student_id).eq("question_id", request.question_id).execute()
        else:
            db.table("code_submissions").insert(payload).execute()
    except Exception as e:
        print(f"[CODE] Submit error: {e}")

    background_tasks.add_task(update_last_active, student_id)

    return CodeSubmitResponse(
        saved=True,
        question_id=request.question_id,
        passed_count=request.passed_count,
        total_count=request.total_count,
    )



