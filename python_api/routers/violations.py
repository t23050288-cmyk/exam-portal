from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone

from models.schemas import ReportViolationRequest, ReportViolationResponse, PyHuntProgressUpdate
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
    "Tab Switch / Minimized",
    "Window Focus Lost",
    "Exited Fullscreen",
    "Exited Fullscreen (Escape/Button)",
    "DevTools Detected",
    "terminal_violation",
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

    # Validate type (allow Prohibited Shortcut: prefix)
    is_valid = request.type in VALID_VIOLATION_TYPES or request.type.startswith("Prohibited Shortcut")
    if not is_valid:
        print(f"[VIOLATION] Rejected unknown type: {request.type}")
        # Log it anyway but don't crash
        # raise HTTPException(...)

    try:
        # Check not already submitted
        exam_status = (
            db.table("exam_status")
            .select("status, warnings")
            .eq("student_id", student_id)
            .limit(1)
            .execute()
        )

        if exam_status.data and exam_status.data[0]["status"] == "submitted":
            return ReportViolationResponse(
                warning_count=exam_status.data[0].get("warnings", 0),
                auto_submitted=False,
                message="Exam already submitted.",
            )

        current_warnings = (exam_status.data[0] if exam_status.data else {}).get("warnings", 0)
        
        # If in PyHunt and exam_status is missing, try fetching from pyhunt_progress
        if not exam_status.data and (request.metadata or {}).get("pyhunt") == True:
            try:
                ph = db.table("pyhunt_progress").select("warnings").eq("student_id", student_id).maybe_single().execute()
                if ph.data:
                    current_warnings = ph.data.get("warnings", 0)
            except Exception:
                pass

        # Trust the frontend warning count if it's higher (prevents race conditions/sync lag)
        fe_warnings = (request.metadata or {}).get("warning_count")
        if fe_warnings is not None and isinstance(fe_warnings, int) and fe_warnings > current_warnings:
             new_warnings = fe_warnings
        else:
             new_warnings = current_warnings + 1

        # 1. Log to legacy violations (student_id based)
        try:
            db.table("violations").insert({
                "student_id": student_id,
                "type": request.type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "metadata": request.metadata or {},
            }).execute()
        except Exception as e:
            print(f"[VIOLATION] Legacy log failed (maybe using modern schema?): {e}")

        # 2. Try to log to modern violations (session_id based) if available
        # Priority: request.sessionId -> request.metadata["session_id"]
        session_id = request.sessionId or (request.metadata or {}).get("session_id")
        if session_id:
            try:
                db.table("violations").insert({
                    "session_id": session_id,
                    "violation_type": request.type,
                    "severity": "medium",
                    "details": f"Auto-reported: {request.type}",
                    "count": 1
                }).execute()
            except Exception:
                pass

        # 3. Increment warnings in exam_status (Legacy)
        try:
            db.table("exam_status").update({
                "warnings": new_warnings,
                "last_active": datetime.now(timezone.utc).isoformat(),
                "last_violation_at": datetime.now(timezone.utc).isoformat()
            }).eq("student_id", student_id).execute()
        except Exception:
            pass
            
        # 4. Try modern session update if session_id is known
        if session_id:
            try:
                db.table("exam_sessions").update({
                    "status": "flagged" if new_warnings >= 3 else "running",
                    "last_activity_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", session_id).execute()
            except Exception:
                pass

        # 5. SYNC TO PYHUNT if metadata has pyhunt=true
        if (request.metadata or {}).get("pyhunt") == True:
            try:
                status = "active"
                if request.type == "terminal_violation" or new_warnings >= 3:
                    status = "TERMINATED"
                    
                db.table("pyhunt_progress").upsert({
                    "student_id": student_id,
                    "warnings": min(new_warnings, 3),
                    "status": status,
                    "last_violation": request.type,
                    "last_active": datetime.now(timezone.utc).isoformat()
                }, on_conflict="student_id").execute()
                
                if status == "TERMINATED":
                    db.table("exam_status").upsert({
                        "student_id": student_id,
                        "exam_title": request.metadata.get("exam_title", "Unknown"),
                        "status": "TERMINATED",
                        "warnings": new_warnings,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }, on_conflict="student_id,exam_title").execute()

                    # 3. Insert into exam_results so it shows in History tab
                    try:
                        db.table("exam_results").upsert({
                            "student_id": student_id,
                            "exam_title": request.metadata.get("exam_title", "Unknown"),
                            "score": 0,
                            "total_marks": 0,
                            "submitted_at": datetime.now(timezone.utc).isoformat(),
                            "status": "TERMINATED", # If schema allows
                        }, on_conflict="student_id,exam_title").execute()
                    except Exception as e:
                        print(f"[VIOLATION] Failed to insert termination result: {e}")
            except Exception as e:
                print(f"[VIOLATION] PyHunt sync failed: {e}")
    except Exception as e:
        print(f"[VIOLATION] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

@router.post("/pyhunt/sync-progress")
async def sync_pyhunt_progress(
    request: PyHuntProgressUpdate,
    current: dict = Depends(get_current_student),
):
    """
    Securely sync student's PyHunt progress to the database.
    Bypasses RLS by using service role via backend.
    """
    db = get_supabase()
    student_id = current["student_id"]
    
    status = "active"
    if request.finished:
        status = "TERMINATED" if request.terminated else "finished"
        
        # If terminated, force warnings to 3 and record in history
        if request.terminated:
            try:
                # Insert record into exam_results for History tab visibility
                db.table("exam_results").upsert({
                    "student_id": student_id,
                    "exam_title": "PyHunt",
                    "score": request.current_round or 0,
                    "total_marks": 5,
                    "submitted_at": datetime.now(timezone.utc).isoformat(),
                }, on_conflict="student_id,exam_title").execute()
            except Exception as e:
                print(f"[PYHUNT] History sync failed: {e}")
    
    try:
        data = {
            "student_id": student_id,
            "current_round": request.current_round,
            "status": status,
            "last_active": datetime.now(timezone.utc).isoformat(),
        }
        if request.turtle_image:
            data["turtle_image"] = request.turtle_image
        if request.warning_count is not None:
            data["warnings"] = min(request.warning_count, 3)
        if request.last_violation:
            data["last_violation"] = request.last_violation
            
        print(f"[PyHuntSync] Syncing progress for student {student_id}: Round {request.current_round}, status {status}")
        db.table("pyhunt_progress").upsert(data, on_conflict="student_id").execute()
        return {"ok": True}
    except Exception as e:
        print(f"[PyHuntSync] CRITICAL ERROR for {student_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
