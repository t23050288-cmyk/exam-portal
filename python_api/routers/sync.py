"""
/api/autosave        — bulk upsert responses
/api/events_batch    — bulk insert telemetry events (deduped by event_id)
/api/events_beacon   — same as events_batch but accepts raw body (sendBeacon)
/api/sync            — reconnect batch: drain client IDB queue after offline
"""
import time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Any
from db.supabase_client import get_supabase
from core.security import get_current_student
import json

router = APIRouter(tags=["sync"])

MAX_BATCH_RESPONSES = 200
MAX_BATCH_EVENTS    = 200
MAX_PAYLOAD_BYTES   = 256 * 1024  # 256 KB hard limit

# Simple in-memory rate limiter: (session_id -> last_autosave_ts)
# Rejects if same session POSTs autosave more than once per 2s
_autosave_timestamps: dict = {}

def _check_rate(session_id: str, min_interval_s: float = 2.0):
    now = time.monotonic()
    last = _autosave_timestamps.get(session_id, 0)
    if now - last < min_interval_s:
        raise HTTPException(status_code=429, detail="Autosave rate limit — slow down")
    _autosave_timestamps[session_id] = now
    # Evict old entries (keep memory bounded)
    if len(_autosave_timestamps) > 5000:
        oldest_key = min(_autosave_timestamps, key=_autosave_timestamps.get)
        del _autosave_timestamps[oldest_key]

# ── /api/autosave ─────────────────────────────────────────────────────────────

class ResponseItem(BaseModel):
    question_id: str
    answer_json: Any
    updated_at:  Optional[str] = None
    is_final:    Optional[bool] = False

class AutosaveRequest(BaseModel):
    session_id: str
    responses:  List[ResponseItem] = Field(default_factory=list)
    client_ts:  Optional[int] = None

    @validator("responses")
    def limit_responses(cls, v):
        if len(v) > MAX_BATCH_RESPONSES:
            raise ValueError(f"Too many responses (max {MAX_BATCH_RESPONSES})")
        return v

@router.post("/api/autosave")
async def autosave(req: AutosaveRequest, user=Depends(get_current_student)):
    _check_rate(req.session_id, min_interval_s=2.0)

    sb = get_supabase()

    # Verify session belongs to user
    sess = (
        sb.table("exam_sessions")
        .select("id, status")
        .eq("id", req.session_id)
        .eq("user_id", user["id"])
        .maybe_single()
        .execute()
    )
    if not sess.data:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.data.get("status") == "submitted":
        return {"status": "ok", "upsert_count": 0, "note": "already_submitted"}

    if not req.responses:
        return {"status": "ok", "upsert_count": 0}

    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "session_id":  req.session_id,
            "question_id": r.question_id,
            "user_id":     user["id"],
            "answer_json": r.answer_json if isinstance(r.answer_json, dict) else {"value": r.answer_json},
            "updated_at":  r.updated_at or now,
            "is_final":    r.is_final or False,
        }
        for r in req.responses
    ]

    sb.table("responses").upsert(rows, on_conflict="session_id,question_id").execute()

    # Update last_activity
    sb.table("exam_sessions").update({"last_activity_at": now}).eq("id", req.session_id).execute()

    return {"status": "ok", "upsert_count": len(rows)}


# ── /api/events_batch ─────────────────────────────────────────────────────────

class EventItem(BaseModel):
    event_id:    str    # client-generated UUID
    type:        str    # event type name
    payload_json: Optional[Any] = None
    ts:          Optional[int] = None   # epoch ms

class EventsBatchRequest(BaseModel):
    session_id: str
    events:     List[EventItem] = Field(default_factory=list)

    @validator("events")
    def limit_events(cls, v):
        if len(v) > MAX_BATCH_EVENTS:
            raise ValueError(f"Too many events (max {MAX_BATCH_EVENTS})")
        return v

@router.post("/api/events_batch")
async def events_batch(req: EventsBatchRequest, user=Depends(get_current_student)):
    if not req.events:
        return {"status": "ok", "inserted": 0}

    sb = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    rows = []
    violation_types = {"tab_switch", "window_blur", "copy", "paste", "right_click",
                       "devtools_open", "fullscreen_exit", "face_not_detected", "multiple_faces"}

    for e in req.events:
        ts_dt = datetime.fromtimestamp(e.ts / 1000, tz=timezone.utc).isoformat() if e.ts else now_iso
        rows.append({
            "event_id":   e.event_id,
            "session_id": req.session_id,
            "user_id":    user["id"],
            "event_type": e.type,
            "payload":    e.payload_json if isinstance(e.payload_json, dict) else {"value": e.payload_json},
            "created_at": ts_dt,
        })

        # Auto-increment violations for relevant event types
        if e.type in violation_types:
            severity = "high" if e.type in {"devtools_open", "multiple_faces"} else "medium" if e.type == "tab_switch" else "low"
            sb.table("violations").upsert({
                "session_id":     req.session_id,
                "user_id":        user["id"],
                "violation_type": e.type,
                "severity":       severity,
                "last_seen_at":   ts_dt,
            }, on_conflict="session_id,violation_type").execute()

    # Bulk insert with dedup (ON CONFLICT DO NOTHING via ignoreDuplicates)
    sb.table("events_log").upsert(rows, on_conflict="event_id", ignore_duplicates=True).execute()

    return {"status": "ok", "inserted": len(rows)}


# ── /api/events_beacon ────────────────────────────────────────────────────────
# Called by navigator.sendBeacon — raw body, no auth header possible from beacon
# We do soft-auth: extract user from JWT if present, else store anonymously

@router.post("/api/events_beacon")
async def events_beacon(request: Request):
    body = await request.body()
    if len(body) > MAX_PAYLOAD_BYTES:
        return {"status": "ignored", "reason": "payload_too_large"}
    try:
        data = json.loads(body)
        session_id = data.get("session_id", "unknown")
        events = data.get("events", [])
        if not events or not session_id:
            return {"status": "ok"}

        sb = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()
        rows = [
            {
                "event_id":   e.get("event_id", str(__import__('uuid').uuid4())),
                "session_id": session_id,
                "event_type": e.get("type", "beacon"),
                "payload":    e.get("payload_json") or {},
                "created_at": now_iso,
            }
            for e in events[:50]   # hard cap
        ]
        sb.table("events_log").upsert(rows, on_conflict="event_id", ignore_duplicates=True).execute()
        return {"status": "ok"}
    except Exception:
        return {"status": "ok"}   # beacon must always get 200


# ── /api/sync ─────────────────────────────────────────────────────────────────
# Called on reconnect to drain IDB queue

class SyncRequest(BaseModel):
    session_id: str
    responses:  List[ResponseItem] = Field(default_factory=list)
    events:     List[EventItem]    = Field(default_factory=list)

@router.post("/api/sync")
async def sync(req: SyncRequest, user=Depends(get_current_student)):
    sb = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    upserted = 0
    if req.responses:
        rows = [
            {
                "session_id":  req.session_id,
                "question_id": r.question_id,
                "user_id":     user["id"],
                "answer_json": r.answer_json if isinstance(r.answer_json, dict) else {"value": r.answer_json},
                "updated_at":  r.updated_at or now_iso,
                "is_final":    r.is_final or False,
            }
            for r in req.responses[:MAX_BATCH_RESPONSES]
        ]
        sb.table("responses").upsert(rows, on_conflict="session_id,question_id").execute()
        upserted = len(rows)

    inserted = 0
    if req.events:
        rows = [
            {
                "event_id":   e.event_id,
                "session_id": req.session_id,
                "user_id":    user["id"],
                "event_type": e.type,
                "payload":    e.payload_json if isinstance(e.payload_json, dict) else {},
                "created_at": now_iso,
            }
            for e in req.events[:MAX_BATCH_EVENTS]
        ]
        sb.table("events_log").upsert(rows, on_conflict="event_id", ignore_duplicates=True).execute()
        inserted = len(rows)

    return {"status": "ok", "upserted_responses": upserted, "inserted_events": inserted}
