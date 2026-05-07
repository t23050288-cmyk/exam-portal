"""
/api/start_exam  — create or resume an exam session
/api/final_submit — mark session ended, freeze responses
/api/export_session — admin-only session snapshot download

FIXED: Uses exam_config table (not 'exams'). Uses student id (TEXT) not UUID.
"""
import uuid
import hashlib
import random
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from db.supabase_client import get_supabase
from core.security import get_current_student

router = APIRouter(tags=["sessions"])


def _require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


# ── /api/start_exam ──────────────────────────────────────────────────────────

class StartExamRequest(BaseModel):
    exam_name: str          # matches exam_config.exam_title / questions.exam_name
    client_ts: Optional[int] = None

@router.post("/api/start_exam")
async def start_exam(req: StartExamRequest, user=Depends(get_current_student)):
    sb = get_supabase()

    # Look up exam_config by exam_title (case-insensitive)
    cfg_resp = (
        sb.table("exam_config")
        .select("*")
        .ilike("exam_title", req.exam_name)
        .limit(1)
        .execute()
    )
    if not cfg_resp.data:
        raise HTTPException(status_code=404, detail="Exam not found")

    exam = cfg_resp.data[0]
    if not exam.get("is_active"):
        raise HTTPException(status_code=403, detail="Exam is not active")

    user_id   = user.get("id") or user.get("usn") or user.get("student_id", "")
    now       = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=exam.get("duration_minutes", 20))

    # Check for existing session
    existing = (
        sb.table("exam_sessions")
        .select("*")
        .eq("exam_config_id", exam["id"])
        .eq("user_id", str(user_id))
        .maybe_single()
        .execute()
    )

    if existing.data and existing.data.get("status") == "submitted":
        raise HTTPException(status_code=409, detail="Exam already submitted")

    if existing.data:
        session_id = existing.data["id"]
        sb.table("exam_sessions").update({
            "last_activity_at": now.isoformat()
        }).eq("id", session_id).execute()
    else:
        ins = sb.table("exam_sessions").insert({
            "exam_config_id":  exam["id"],
            "exam_name":       exam.get("exam_title", req.exam_name),
            "user_id":         str(user_id),
            "branch":          user.get("branch", ""),
            "status":          "running",
            "client_ts_start": req.client_ts,
        }).execute()
        session_id = ins.data[0]["id"]

    # Fetch minimal question list for this exam
    q_resp = (
        sb.table("questions")
        .select("id, text, marks, question_type, audio_url, image_url")
        .ilike("exam_name", req.exam_name)
        .order("order_index")
        .execute()
    )
    questions = q_resp.data or []

    # Reproducible shuffle — use seeded RNG (seed from session_id+user_id)
    question_order = None
    if existing.data and existing.data.get("question_order"):
        # Resume: restore saved order
        saved_order = existing.data["question_order"]
        q_map = {q["id"]: q for q in questions}
        questions = [q_map[qid] for qid in saved_order if qid in q_map]
        question_order = saved_order
    elif exam.get("shuffle_questions"):
        seed = int(hashlib.md5((str(session_id)+str(user_id)).encode()).hexdigest(), 16) % (2**31)
        rng  = random.Random(seed)
        rng.shuffle(questions)
        question_order = [q["id"] for q in questions]
        try:
            sb.table("exam_sessions").update({"question_order": question_order}).eq("id", session_id).execute()
        except Exception:
            pass

    return {
        "session_id":  session_id,
        "expires_at":  expires_at.isoformat(),
        "exam_config": {
            "title":                    exam.get("exam_title"),
            "duration_minutes":         exam.get("duration_minutes", 20),
            "shuffle_questions":        exam.get("shuffle_questions", False),
            "enable_face_proctoring":   exam.get("enable_face_proctoring", False),
        },
        "question_order":        question_order,
        "question_list_minimal": questions,
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
    user_id = user.get("id") or user.get("usn") or user.get("student_id", "")

    session = (
        sb.table("exam_sessions")
        .select("*")
        .eq("id", req.session_id)
        .eq("user_id", str(user_id))
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
                "user_id":     str(user_id),
                "answer_json": r.answer_json,
                "updated_at":  r.updated_at or now.isoformat(),
                "is_final":    True,
            }
            for r in req.final_responses
        ]
        sb.table("responses").upsert(rows, on_conflict="session_id,question_id").execute()

    # Mark session ended
    sb.table("exam_sessions").update({
        "status":           "submitted",
        "ended_at":         now.isoformat(),
        "last_activity_at": now.isoformat(),
    }).eq("id", req.session_id).execute()

    # Enqueue async grading job — return immediately
    grading_id = None
    try:
        gq = sb.table("grading_queue").insert({
            "session_id": req.session_id,
            "user_id":    str(user_id),
            "status":     "pending",
            "payload":    {"response_count": len(req.final_responses),
                           "submitted_at":   now.isoformat()},
        }).execute()
        if gq.data:
            grading_id = gq.data[0].get("id")
    except Exception as eq_err:
        print(f"[WARN] grading_queue insert failed: {eq_err}")

    return {"status": "accepted", "message": "Submitted. Grading in progress.", "grading_id": grading_id}


# ── /api/export_session ──────────────────────────────────────────────────────

@router.get("/api/export_session")
async def export_session(session_id: str, user=Depends(get_current_student)):
    _require_admin(user)
    sb = get_supabase()

    session = (
        sb.table("exam_sessions")
        .select("*")
        .eq("id", session_id)
        .maybe_single()
        .execute()
    )
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    responses  = sb.table("responses").select("*").eq("session_id", session_id).execute()
    events     = sb.table("events_log").select("event_id,event_type,payload,created_at").eq("session_id", session_id).order("created_at").execute()

    snapshot = {
        "session":    session.data,
        "responses":  responses.data or [],
        "events":     events.data or [],
        "exported_at": now.isoformat() if (now := datetime.now(timezone.utc)) else "",
    }
    return JSONResponse(
        content=snapshot,
        headers={"Content-Disposition": f'attachment; filename="session_{session_id[:8]}.json"'},
    )
