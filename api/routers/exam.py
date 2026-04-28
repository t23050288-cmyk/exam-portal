from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from datetime import datetime, timezone

from models.schemas import (
    QuestionsResponse, QuestionOut,
    SaveAnswerRequest, SaveAnswerResponse,
    SubmitExamRequest, SubmitExamResponse,
    StartExamResponse
)
from core.security import get_current_student
from db.supabase_client import get_supabase

router = APIRouter(prefix="/exam", tags=["exam"])


def _check_exam_active(title: str):
    """Raises 423 if the exam has been deactivated by admin."""
    db = get_supabase()
    try:
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
    current: dict = Depends(get_current_student)
):
    """
    Return all questions for a specific exam title and branch.
    """
    _check_exam_active(title)
    db = get_supabase()

    # Update last_active in background
    background_tasks.add_task(update_last_active, current["student_id"])

    # Fetch questions filtered by title AND branch
    result = (
        db.table("questions")
        .select("id, text, options, branch, order_index, marks, exam_name")
        .eq("branch", current.get("branch", "CS"))
        .eq("exam_name", title)
        .order("order_index")
        .limit(100)
        .execute()
    )

    questions = [
        QuestionOut(
            id=q["id"],
            text=q["text"],
            options=q["options"],
            branch=q.get("branch", "CS"),
            order_index=q["order_index"],
            marks=q["marks"],
        )
        for q in (result.data or [])
    ]

    return QuestionsResponse(questions=questions, total=len(questions))


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

    # 1. Guard: already submitted?
    status_row = (
        db.table("exam_status")
        .select("status")
        .eq("student_id", student_id)
        .single()
        .execute()
    )
    if status_row.data and status_row.data["status"] == "submitted":
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

    # 2. Load correct answers for this specific exam
    answers = request.answers
    exam_title = answers.pop("__exam_title", "ExamGuard Assessment")

    try:
        questions_result = (
            db.table("questions")
            .select("id, correct_answer, marks")
            .eq("branch", current.get("branch", "CS"))
            .eq("exam_name", exam_title)
            .execute()
        )
    except Exception:
        questions_result = (
            db.table("questions").select("id, correct_answer, marks").execute()
        )
    
    correct_map = {
        q["id"]: (q["correct_answer"], q["marks"])
        for q in (questions_result.data or [])
    }

    score = 0
    correct_count = 0
    wrong_count = 0
    total_marks = sum(m for _, m in correct_map.values())

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
            {"answers": answers, "score": score, "total_marks": total_marks, "submitted_at": submitted_at}
        ).eq("student_id", student_id).execute()
    else:
        db.table("exam_results").insert(
            {"student_id": student_id, "answers": answers, "score": score, "total_marks": total_marks, "submitted_at": submitted_at}
        ).execute()

    # 5. Mark submitted
    db.table("exam_status").update(
        {"status": "submitted", "submitted_at": submitted_at}
    ).eq("student_id", student_id).execute()

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

    # 1. Check if already started or submitted
    status_res = db.table("exam_status").select("status, started_at").eq("student_id", student_id).single().execute()
    data = status_res.data or {}
    
    if data.get("status") == "submitted":
        raise HTTPException(status_code=403, detail="Exam already submitted.")

    # 2. If already active, just return the existing start time
    if data.get("status") == "active" and data.get("started_at"):
        return StartExamResponse(started_at=data["started_at"], status="active")

    # 3. Otherwise, set the start time NOW
    started_at = datetime.now(timezone.utc).isoformat()
    db.table("exam_status").update({
        "status": "active",
        "started_at": started_at,
        "last_active": started_at
    }).eq("student_id", student_id).execute()

    return StartExamResponse(started_at=started_at, status="active")
