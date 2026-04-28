from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone

from models.schemas import ReportViolationRequest, ReportViolationResponse
from core.security import get_current_student
from db.supabase_client import get_supabase

router = APIRouter(prefix="/exam", tags=["violations"])

VALID_VIOLATION_TYPES = {
    "tab_switch",
    "window_blur",
    "fullscreen_exit",
    "right_click",
    "copy_attempt",
    "paste_attempt",
    "keyboard_shortcut",
    "auto_submitted",
    "no_face_detected",
    "face_not_front",
    "multiple_faces",
}
AUTO_SUBMIT_THRESHOLD = 3


@router.post("/report-violation", response_model=ReportViolationResponse)
async def report_violation(
    request: ReportViolationRequest,
    current: dict = Depends(get_current_student),
):
    """
    Log a cheating violation event.
    Increments warning count.
    At threshold (3), triggers auto-submit signal.
    """
    db = get_supabase()
    student_id = current["student_id"]

    # Validate type
    if request.type not in VALID_VIOLATION_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown violation type: {request.type}",
        )

    # Check not already submitted
    exam_status = (
        db.table("exam_status")
        .select("status, warnings")
        .eq("student_id", student_id)
        .single()
        .execute()
    )

    if exam_status.data and exam_status.data["status"] == "submitted":
        return ReportViolationResponse(
            warning_count=exam_status.data.get("warnings", 0),
            auto_submitted=False,
            message="Exam already submitted.",
        )

    current_warnings = (exam_status.data or {}).get("warnings", 0)
    new_warnings = current_warnings + 1

    # Log violation event
    db.table("violations").insert(
        {
            "student_id": student_id,
            "type": request.type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": request.metadata or {},
        }
    ).execute()

    # Increment warnings in exam_status
    db.table("exam_status").update(
        {
            "warnings": new_warnings,
            "last_active": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("student_id", student_id).execute()

    # Auto-submit trigger
    auto_submitted = False
    if new_warnings >= AUTO_SUBMIT_THRESHOLD:
        auto_submitted = True
        message = "⚠️ 3rd violation detected. Your exam has been auto-submitted."
    elif new_warnings == 2:
        message = (
            "🚨 Final warning! One more violation and your exam will be auto-submitted."
        )
    else:
        message = "⚠️ Warning 1: Please return to the exam and stay focused."

    return ReportViolationResponse(
        warning_count=new_warnings,
        auto_submitted=auto_submitted,
        message=message,
    )
