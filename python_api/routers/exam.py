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
        result = (
            db.table("questions")
            .select("id, text, options, branch, order_index, marks, exam_name, image_url")
            .order("order_index")
            .limit(200)
            .execute()
        )
        
        all_questions = result.data or []
        filtered_data = []
        student_branch_upper = branch.strip().upper()
        
        for q in all_questions:
            q_branch = (q.get("branch") or "").strip()
            q_exam = q.get("exam_name")
            
            # Handle legacy virtual folders if exam_name column is empty
            text = q.get("text", "")
            if not q_exam and text.startswith("⟦EXAM:"):
                end_idx = text.find("⟧")
                if end_idx != -1:
                    q_exam = text[6:end_idx]

            exam_match = (q_exam == title)
            if not exam_match:
                continue  # skip questions from other exams entirely

            # Branch matching: case-insensitive
            # If q_branch is empty/null → the question applies to ALL branches
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

        # Fallback: if no branch-matched questions found, return ALL questions for this exam
        # This handles cases where branch data is inconsistent
        if not filtered_data:
            print(f"[EXAM] No branch match for branch='{branch}', title='{title}'. Falling back to all questions for this exam.")
            for q in all_questions:
                q_exam = q.get("exam_name")
                text = q.get("text", "")
                if not q_exam and text.startswith("⟦EXAM:"):
                    end_idx = text.find("⟧")
                    if end_idx != -1:
                        q_exam = text[6:end_idx]
                if q_exam == title:
                    filtered_data.append(q)
                
    except Exception as e:
        print(f"[EXAM] DB Error during question fetch: {e}")
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

    # 1. Guard: already submitted? Check by student + exam_title
    exam_title_for_check = (request.answers or {}).get("__exam_title", "")
    status_rows = (
        db.table("exam_status")
        .select("status, exam_title")
        .eq("student_id", student_id)
        .execute()
    )
    all_rows = status_rows.data or []
    # Find row for this specific exam
    status_row_data = next((r for r in all_rows if r.get("exam_title") == exam_title_for_check), None)
    if status_row_data is None and len(all_rows) == 1:
        status_row_data = all_rows[0]  # fallback for old single-row schema
    if status_row_data and status_row_data.get("status") == "submitted" and status_row_data.get("exam_title") == exam_title_for_check:
        # Return existing result
        result_row = (
            db.table("exam_results")
            .select("score, total_marks, submitted_at")
            .eq("student_id", student_id)
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

    # 4. Upsert exam_results
    existing = (
        db.table("exam_results")
        .select("id")
        .eq("student_id", student_id)
        .execute()
    )
    if existing.data:
        db.table("exam_results").update(
            {"exam_title": exam_title, "answers": answers, "score": score, "total_marks": total_marks, "submitted_at": submitted_at}
        ).eq("student_id", student_id).execute()
    else:
        db.table("exam_results").insert(
            {"student_id": student_id, "exam_title": exam_title, "answers": answers, "score": score, "total_marks": total_marks, "submitted_at": submitted_at}
        ).execute()

    # 5. Mark submitted — by student + exam_title for multi-exam support
    update_q = db.table("exam_status").update(
        {"status": "submitted", "submitted_at": submitted_at}
    ).eq("student_id", student_id)
    if exam_title:
        try:
            update_q.eq("exam_title", exam_title).execute()
        except Exception:
            db.table("exam_status").update(
                {"status": "submitted", "submitted_at": submitted_at}
            ).eq("student_id", student_id).execute()
    else:
        update_q.execute()

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

    # 1. Check if already started or submitted FOR THIS SPECIFIC EXAM
    status_res = db.table("exam_status").select("status, started_at, exam_title").eq("student_id", student_id).execute()
    rows = status_res.data or []
    exam_row = next((r for r in rows if r.get("exam_title") == title), None)
    if exam_row is None and len(rows) == 1 and not rows[0].get("exam_title"):
        exam_row = rows[0]  # fallback: old single-row schema
    data = exam_row or {}

    if data.get("status") == "submitted":
        raise HTTPException(status_code=403, detail="Exam already submitted.")

    # 2. If already active for this exam, return existing start time
    if data.get("status") == "active" and data.get("started_at"):
        return StartExamResponse(started_at=data["started_at"], status="active", started=True, exam_title=title)

    # 3. Otherwise, set the start time NOW
    started_at = datetime.now(timezone.utc).isoformat()
    if exam_row and data.get("exam_title") == title:
        db.table("exam_status").update({
            "status": "active", "started_at": started_at, "last_active": started_at
        }).eq("student_id", student_id).eq("exam_title", title).execute()
    else:
        try:
            db.table("exam_status").insert({
                "student_id": student_id, "exam_title": title,
                "status": "active", "started_at": started_at, "last_active": started_at
            }).execute()
        except Exception:
            db.table("exam_status").update({
                "status": "active", "started_at": started_at, "last_active": started_at
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

