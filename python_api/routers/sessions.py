"""
/api/start_exam  — create or resume an exam session
/api/final_submit — mark session ended, freeze responses
/api/export_session — admin-only session snapshot download
"""
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from db.supabase_client import get_supabase
from core.security import get_current_student

router = APIRouter(tags=["sessions"])

# ── helpers ──────────────────────────────────────────────────────────────────

def _require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

# ── /api/start_exam ──────────────────────────────────────────────────────────

class StartExamRequest(BaseModel):
    exam_id: str
    client_ts: Optional[int] = None

@router.post("/api/start_exam")
async def start_exam(req: StartExamRequest, user=Depends(get_current_student)):
    sb = get_supabase()

    # Verify exam exists and is active
    exam_resp = sb.table("exams").select("*").eq("id", req.exam_id).single().execute()
    if not exam_resp.data:
        raise HTTPException(status_code=404, detail="Exam not found")
    exam = exam_resp.data
    if not exam.get("is_active"):
        raise HTTPException(status_code=403, detail="Exam is not active")

    # Branch check
    user_branch = user.get("branch", "")
    exam_branch = exam.get("branch", "")
    if exam_branch and exam_branch.strip() != user_branch.strip():
        raise HTTPException(status_code=403, detail="Exam not available for your branch")

    # Upsert session (one per exam+user)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=exam.get("duration_minutes", 60))

    existing = (
        sb.table("exam_sessions")
        .select("*")
        .eq("exam_id", req.exam_id)
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )

    if existing.data and existing.data.get("status") == "submitted":
        raise HTTPException(status_code=409, detail="Exam already submitted")

    if existing.data:
        session_id = existing.data["id"]
        sb.table("exam_sessions").update({"last_activity_at": now.isoformat()}).eq("id", session_id).execute()
    else:
        ins = sb.table("exam_sessions").insert({
            "exam_id":         req.exam_id,
            "user_id":         user["id"],
            "branch":          user_branch,
            "status":          "running",
            "client_ts_start": req.client_ts,
        }).execute()
        session_id = ins.data[0]["id"]

    # Fetch minimal question list (id + type only — no answers)
    q_resp = (
        sb.table("questions")
        .select("id, question_type, question_text, marks")
        .eq("exam_id", req.exam_id)
        .order("id")
        .execute()
    )

    return {
        "session_id":   session_id,
        "expires_at":   expires_at.isoformat(),
        "exam_config":  {
            "title":            exam["title"],
            "duration_minutes": exam.get("duration_minutes", 60),
            "total_marks":      exam.get("total_marks"),
        },
        "question_list_minimal": q_resp.data or [],
    }


# ── /api/final_submit ────────────────────────────────────────────────────────

class FinalResponse(BaseModel):
    question_id: str
    answer_json: dict
    updated_at:  Optional[str] = None

class FinalSubmitRequest(BaseModel):
    session_id:      str
    final_responses: List[FinalResponse] = Field(default_factory=list)
    client_ts:       Optional[int] = None

@router.post("/api/final_submit")
async def final_submit(req: FinalSubmitRequest, user=Depends(get_current_student)):
    sb = get_supabase()

    session = (
        sb.table("exam_sessions")
        .select("*")
        .eq("id", req.session_id)
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.data.get("status") == "submitted":
        return {"status": "ok", "message": "Already submitted", "score_estimate": None}

    now = datetime.now(timezone.utc)

    # Upsert final responses
    if req.final_responses:
        rows = [
            {
                "session_id":  req.session_id,
                "question_id": r.question_id,
                "user_id":     user["id"],
                "answer_json": r.answer_json,
                "updated_at":  r.updated_at or now.isoformat(),
                "is_final":    True,
            }
            for r in req.final_responses
        ]
        sb.table("responses").upsert(rows, on_conflict="session_id,question_id").execute()

    # Mark session ended
    sb.table("exam_sessions").update({
        "status":   "submitted",
        "ended_at": now.isoformat(),
        "last_activity_at": now.isoformat(),
    }).eq("id", req.session_id).execute()

    return {"status": "ok", "score_estimate": None}


# ── /api/export_session ──────────────────────────────────────────────────────

@router.get("/api/export_session")
async def export_session(session_id: str, user=Depends(get_current_student)):
    _require_admin(user)
    sb = get_supabase()

    session = sb.table("exam_sessions").select("*").eq("id", session_id).maybe_single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    responses = sb.table("responses").select("*").eq("session_id", session_id).execute()
    events    = sb.table("events_log").select("event_id,event_type,payload,created_at").eq("session_id", session_id).order("created_at").execute()
    violations = sb.table("violations").select("*").eq("session_id", session_id).execute()

    snapshot = {
        "session":    session.data,
        "responses":  responses.data or [],
        "events":     events.data or [],
        "violations": violations.data or [],
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }
    return JSONResponse(content=snapshot, headers={
        "Content-Disposition": f'attachment; filename="session_{session_id[:8]}.json"'
    })
