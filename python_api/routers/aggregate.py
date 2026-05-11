"""
/api/admin/aggregate   — aggregated dashboard metrics (cached 5s)
/api/admin/throttle    — toggle load-shedding mode
/api/admin/student_log — drill-down: single student events
"""
import time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from db.supabase_client import get_supabase
from routers.admin import verify_admin

router = APIRouter(prefix="/admin", tags=["admin"])

# Simple TTL cache for aggregate query (5 seconds)
_agg_cache: dict = {}
_AGG_TTL = 5  # seconds

def _get_aggregate(exam_id: str) -> dict:
    now = time.monotonic()
    cached = _agg_cache.get(exam_id)
    if cached and (now - cached["ts"]) < _AGG_TTL:
        return cached["data"]

    sb = get_supabase()

    active_count    = 0
    submitted_count = 0
    flagged_count   = 0
    sessions        = []
    legacy_mode     = False

    # 1. Try modern exam_sessions
    try:
        sess_resp = (
            sb.table("exam_sessions")
            .select("status, id")
            .eq("exam_config_id", exam_id)
            .execute()
        )
        sessions = sess_resp.data or []
        active_count    = sum(1 for s in sessions if s["status"] == "running")
        submitted_count = sum(1 for s in sessions if s["status"] == "submitted")
        flagged_count   = sum(1 for s in sessions if s["status"] == "flagged")
    except Exception:
        # 2. Fallback to legacy exam_status
        legacy_mode = True
        try:
            # We don't have exam_id in exam_status usually, so we filter by active exams? 
            # Or just assume we want the global status for now if exam_id is a title
            # In legacy, student status is what we have.
            # We'll try to find students where status is 'active' or 'submitted'
            status_resp = sb.table("exam_status").select("status").execute()
            data = status_resp.data or []
            active_count    = sum(1 for s in data if s["status"] == "active")
            submitted_count = sum(1 for s in data if s["status"] == "submitted")
            # Flagged in legacy might be based on warnings > threshold
            # But let's keep it simple for now.
        except Exception:
            pass

    # 3. Violations aggregated
    by_severity = {"low": 0, "medium": 0, "high": 0}
    if not legacy_mode and sessions:
        session_ids = [s["id"] for s in sessions]
        try:
            viol_resp = (
                sb.table("violations")
                .select("severity, violation_type, count")
                .in_("session_id", session_ids)
                .execute()
            )
            for v in (viol_resp.data or []):
                sev = v.get("severity", "low")
                by_severity[sev] = by_severity.get(sev, 0) + (v.get("count") or 1)
        except Exception:
            pass
    else:
        # Legacy violations aggregation (if table exists and uses student_id)
        try:
            v_resp = sb.table("violations").select("type").execute()
            # In legacy, we just count them as medium? Or map them
            for v in (v_resp.data or []):
                by_severity["medium"] += 1
        except Exception:
            pass

    # Throttle mode
    throttle_mode = "normal"
    try:
        throttle_resp = sb.table("admin_settings").select("value").eq("key", "throttle_mode").maybe_single().execute()
        if throttle_resp.data:
            val = throttle_resp.data.get("value")
            throttle_mode = val.strip('"') if isinstance(val, str) else val
    except Exception:
        pass

    data = {
        "exam_id":          exam_id,
        "active_sessions":  active_count,
        "submitted_count":  submitted_count,
        "flagged_count":    flagged_count,
        "violations_by_severity": by_severity,
        "throttle_mode":    throttle_mode,
        "last_updated":     datetime.now(timezone.utc).isoformat(),
        "schema_version":   "legacy" if legacy_mode else "modern"
    }
    _agg_cache[exam_id] = {"ts": now, "data": data}
    return data


@router.get("/aggregate")
async def get_aggregate(exam_id: str = Query(...), _: bool = Depends(verify_admin)):
    return _get_aggregate(exam_id)


# ── Throttle control ──────────────────────────────────────────

class ThrottleRequest(BaseModel):
    mode: str   # 'normal' | 'safe' | 'emergency'

@router.post("/throttle")
async def set_throttle(req: ThrottleRequest, _: bool = Depends(verify_admin)):
    if req.mode not in ("normal", "safe", "emergency"):
        raise HTTPException(status_code=400, detail="mode must be 'normal', 'safe', or 'emergency'")

    sb = get_supabase()
    try:
        sb.table("admin_settings").upsert({
            "key":        "throttle_mode",
            "value":      f'"{req.mode}"',
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="key").execute()
    except Exception:
        pass

    _agg_cache.clear()
    return {"status": "ok", "throttle_mode": req.mode}


@router.get("/throttle_status")
async def throttle_status():
    """Public endpoint — no auth needed."""
    sb = get_supabase()
    mode = "normal"
    try:
        resp = sb.table("admin_settings").select("value").eq("key", "throttle_mode").maybe_single().execute()
        if resp.data:
            val = resp.data.get("value")
            mode = val.strip('"') if isinstance(val, str) else val
    except Exception:
        pass

    interval_ms = {"normal": 30_000, "safe": 60_000, "emergency": 120_000}.get(mode, 30_000)
    return {
        "throttle_mode":         mode,
        "autosave_interval_ms":  interval_ms,
        "telemetry_interval_ms": interval_ms,
    }


@router.get("/student_log")
async def student_log(
    session_id: str = Query(...),
    limit: int = Query(100, le=500),
    _: bool = Depends(verify_admin)
):
    sb = get_supabase()
    try:
        events = sb.table("events_log").select("event_id, event_type, payload, created_at").eq("session_id", session_id).order("created_at", desc=True).limit(limit).execute()
    except Exception:
        events = type('obj', (object,), {'data': []})()
    try:
        violations = sb.table("violations").select("*").eq("session_id", session_id).execute()
    except Exception:
        violations = type('obj', (object,), {'data': []})()
    try:
        session = sb.table("exam_sessions").select("*").eq("id", session_id).maybe_single().execute()
    except Exception:
        session = type('obj', (object,), {'data': None})()

    return {
        "session":    session.data,
        "events":     events.data or [],
        "violations": violations.data or [],
    }
