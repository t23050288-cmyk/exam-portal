from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from datetime import datetime, timezone

from models.schemas import (
    QuestionsResponse, QuestionOut,
    SaveAnswerRequest, SaveAnswerResponse,
    SubmitExamRequest, SubmitExamResponse,
)
from core.security import get_current_student
from db.supabase_client import get_supabase

router = APIRouter(prefix="/exam", tags=["exam"])


def _check_exam_active():
    """Raises 423 if the exam has been deactivated by admin."""
    db = get_supabase()
    try:
        result = db.table("exam_config").select("is_active, scheduled_start").limit(1).execute()
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
    background_tasks: BackgroundTasks,
    current: dict = Depends(get_current_student)
):
    """
    Return all exam questions for authenticated student.
    Does NOT include correct_answer field.
    Updates last_active timestamp in background.
    Blocks with 423 if exam is deactivated.
    """
    _check_exam_active()
    db = get_supabase()

    # Update last_active in background
    background_tasks.add_task(update_last_active, current["student_id"])

    # Fetch questions (no correct_answer exposed)
    result = (
        db.table("questions")
        .select("id, text, options, branch, order_index, marks")
        .eq("branch", current.get("branch", "CS"))
        .order("order_index")
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
            percentage=round(score / total * 100, 1) if total else 0,
            submitted_at=r.get("submitted_at", datetime.now(timezone.utc).isoformat()),
        )

    # 2. Load correct answers
    try:
        questions_result = (
            db.table("questions").select("id, correct_answer, marks").eq("branch", current.get("branch", "CS")).execute()
        )
    except Exception as e:
        if any(x in str(e) for x in ["does not exist", "42703", "PGRST204", "schema cache"]):
            questions_result = (
                db.table("questions").select("id, correct_answer, marks").execute()
            )
        else:
            raise e
    correct_map = {
        q["id"]: (q["correct_answer"], q["marks"])
        for q in (questions_result.data or [])
    }

    # 3. Calculate score
    answers = request.answers
    score = 0
    total_marks = sum(m for _, m in correct_map.values())

    for q_id, selected in answers.items():
        if q_id in correct_map:
            correct_ans, marks = correct_map[q_id]
            if selected == correct_ans:
                score += marks

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
        percentage=round(score / total_marks * 100, 1) if total_marks else 0,
        submitted_at=submitted_at,
    )
