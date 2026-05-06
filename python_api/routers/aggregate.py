"""
/api/admin/aggregate   — aggregated dashboard metrics (cached 5s)
/api/admin/throttle    — toggle load-shedding mode
/api/admin/student_log — drill-down: single student events
"""
import time
from functools import lru_cache
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from db.supabase_client import get_supabase
from core.security import get_current_student

router = APIRouter(prefix="/api/admin", tags=["admin"])

def _require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

# Simple TTL cache for aggregate query (5 seconds)
_agg_cache: dict = {}
_AGG_TTL = 5  # seconds

def _get_aggregate(exam_id: str) -> dict:
    now = time.monotonic()
    cached = _agg_cache.get(exam_id)
    if cached and (now - cached["ts"]) < _AGG_TTL:
        return cached["data"]

    sb = get_supabase()

    # Active sessions
    sess_resp = (
        sb.table("exam_sessions")
        .select("status, id")
        .eq("exam_id", exam_id)
        .execute()
    )
    sessions = sess_resp.data or []
    active_count    = sum(1 for s in sessions if s["status"] == "running")
    submitted_count = sum(1 for s in sessions if s["status"] == "submitted")
    flagged_count   = sum(1 for s in sessions if s["status"] == "flagged")

    # Violations aggregated
    session_ids = [s["id"] for s in sessions]
    viol_resp = {"data": []}
    if session_ids:
        viol_resp = (
            sb.table("violations")
            .select("severity, violation_type, count")
            .in_("session_id", session_ids)
            .execute()
        )
    violations = viol_resp.data or []
    by_severity = {"low": 0, "medium": 0, "high": 0}
    for v in violations:
        by_severity[v.get("severity", "low")] = by_severity.get(v.get("severity", "low"), 0) + (v.get("count") or 1)

    # Throttle mode
    throttle_resp = sb.table("admin_settings").select("value").eq("key", "throttle_mode").maybe_single().execute()
    throttle_mode = "normal"
    if throttle_resp.data:
        val = throttle_resp.data.get("value")
        throttle_mode = val.strip('"') if isinstance(val, str) else val

    data = {
        "exam_id":          exam_id,
        "active_sessions":  active_count,
        "submitted_count":  submitted_count,
        "flagged_count":    flagged_count,
        "violations_by_severity": by_severity,
        "throttle_mode":    throttle_mode,
        "last_updated":     datetime.now(timezone.utc).isoformat(),
    }
    _agg_cache[exam_id] = {"ts": now, "data": data}
    return data


@router.get("/aggregate")
async def get_aggregate(exam_id: str = Query(...), user=Depends(get_current_student)):
    _require_admin(user)
    return _get_aggregate(exam_id)


# ── Throttle control ──────────────────────────────────────────────────────────

class ThrottleRequest(BaseModel):
    mode: str   # 'normal' | 'safe' | 'emergency'

@router.post("/throttle")
async def set_throttle(req: ThrottleRequest, user=Depends(get_current_student)):
    _require_admin(user)
    if req.mode not in ("normal", "safe", "emergency"):
        raise HTTPException(status_code=400, detail="mode must be 'normal', 'safe', or 'emergency'")

    sb = get_supabase()
    sb.table("admin_settings").upsert({
        "key":        "throttle_mode",
        "value":      f'"{req.mode}"',
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="key").execute()

    # Bust cache
    _agg_cache.clear()

    return {"status": "ok", "throttle_mode": req.mode}


# ── Throttle status header (polled by clients every 60s) ─────────────────────

@router.get("/throttle_status")
async def throttle_status():
    """Public endpoint — no auth needed. Returns current throttle mode."""
    sb = get_supabase()
    resp = sb.table("admin_settings").select("value").eq("key", "throttle_mode").maybe_single().execute()
    mode = "normal"
    if resp.data:
        val = resp.data.get("value")
        mode = val.strip('"') if isinstance(val, str) else val

    interval_ms = {
        "normal":    30_000,
        "safe":      60_000,
        "emergency": 120_000,
    }.get(mode, 30_000)

    return {
        "throttle_mode":          mode,
        "autosave_interval_ms":   interval_ms,
        "telemetry_interval_ms":  interval_ms,
    }


# ── Student drill-down ────────────────────────────────────────────────────────

@router.get("/student_log")
async def student_log(
    session_id: str = Query(...),
    limit:      int = Query(100, le=500),
    user=Depends(get_current_student)
):
    _require_admin(user)
    sb = get_supabase()

    events = (
        sb.table("events_log")
        .select("event_id, event_type, payload, created_at")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    violations = (
        sb.table("violations")
        .select("*")
        .eq("session_id", session_id)
        .execute()
    )
    session = (
        sb.table("exam_sessions")
        .select("*")
        .eq("id", session_id)
        .maybe_single()
        .execute()
    )

    return {
        "session":    session.data,
        "events":     events.data or [],
        "violations": violations.data or [],
    }
