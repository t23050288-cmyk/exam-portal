"""
/api/admin/grading_queue         — GET  list jobs
/api/admin/process_grading       — POST process N pending jobs
/api/admin/grading/{id}/retry    — POST reset failed → pending
/api/admin/grading/{id}/manual   — POST manually set score
"""
import os, asyncio, httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from db.supabase_client import get_supabase
from routers.admin import verify_admin

router     = APIRouter(prefix="/admin", tags=["grading"])
JUDGE0_URL = os.getenv("JUDGE0_API_URL", "")
JUDGE0_KEY = os.getenv("JUDGE0_API_KEY", "")
BATCH_SIZE = int(os.getenv("GRADING_BATCH_SIZE", "5"))

LANG_IDS = {"python": 71, "python3": 71, "javascript": 63, "js": 63,
            "c": 50, "cpp": 54, "java": 62}


async def _judge0_run(code: str, lang: str, test_cases: list) -> list:
    if not JUDGE0_URL or not JUDGE0_KEY:
        return [{"status": "pending_manual"} for _ in test_cases]
    lid = LANG_IDS.get(lang.lower(), 71)
    results = []
    async with httpx.AsyncClient(timeout=30) as client:
        headers = {"X-Auth-Token": JUDGE0_KEY, "Content-Type": "application/json"}
        for tc in test_cases:
            try:
                r = await client.post(f"{JUDGE0_URL}/submissions?wait=true",
                    json={"source_code": code, "language_id": lid,
                          "stdin": tc.get("input",""), "expected_output": tc.get("expected_output","")},
                    headers=headers)
                data = r.json()
                token = data.get("token","")
                for _ in range(8):
                    await asyncio.sleep(1.5)
                    poll = (await client.get(f"{JUDGE0_URL}/submissions/{token}", headers=headers)).json()
                    if poll.get("status",{}).get("id",0) > 2:
                        passed = poll["status"]["id"] == 3
                        results.append({"status":"passed" if passed else "failed",
                                        "actual": poll.get("stdout","").strip(),
                                        "judge0": poll["status"].get("description")})
                        break
                else:
                    results.append({"status":"timeout"})
            except Exception as e:
                results.append({"status":"error","detail":str(e)})
    return results


def _grade_mcq(session_id: str, db) -> dict:
    sess = db.table("exam_sessions").select("exam_config_id").eq("id", session_id).maybe_single().execute()
    if not sess.data:
        return {"error": "session not found"}
    cfg_id = sess.data.get("exam_config_id")

    resp   = db.table("responses").select("question_id,answer,selected_option,answer_json").eq("session_id", session_id).execute()
    if not resp.data:
        return {"score": 0, "total_marks": 0, "answers_graded": 0}

    qids   = [r["question_id"] for r in resp.data]
    qs     = db.table("questions").select("id,correct_answer,marks,negative_marks").in_("id", qids).execute()
    q_map  = {q["id"]: q for q in (qs.data or [])}

    config = {}
    if cfg_id:
        cr = db.table("exam_config").select("marks_per_question,negative_marks,negative_marking").eq("id", cfg_id).maybe_single().execute()
        config = cr.data or {}

    score = total = 0.0
    for r in resp.data:
        q = q_map.get(r["question_id"])
        if not q:
            continue
        q_marks = q.get("marks") or config.get("marks_per_question", 1)
        neg     = q.get("negative_marks") or 0
        if neg == 0 and config.get("negative_marking"):
            neg = abs(config.get("negative_marks", 0))
        total += q_marks
        ans = (r.get("answer") or r.get("selected_option") or
               (r.get("answer_json") or {}).get("selected") or "").strip()
        correct = (q.get("correct_answer") or "").strip()
        if ans == correct:
            score += q_marks
        elif ans:
            score -= neg

    return {"score": score, "total_marks": total, "answers_graded": len(resp.data)}


async def _process_job(job: dict, db) -> str:
    try:
        res = _grade_mcq(job["session_id"], db)
        if "error" in res:
            return "failed"
        db.table("exam_results").upsert({
            "session_id": job["session_id"],
            "student_id": str(job["user_id"]),
            "score":       res["score"],
            "total_marks": res["total_marks"],
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="session_id").execute()
        return "done"
    except Exception as e:
        print(f"[GRADING] job {job['id']} error: {e}")
        return "failed"


@router.post("/process_grading")
async def process_grading(batch: int = Query(BATCH_SIZE, ge=1, le=20), _=Depends(verify_admin)):
    db   = get_supabase()
    jobs = db.table("grading_queue").select("*").eq("status","pending").order("created_at").limit(batch).execute().data or []
    if not jobs:
        return {"processed": 0, "message": "No pending jobs"}
    results = []
    for job in jobs:
        db.table("grading_queue").update({"status":"processing","attempts":(job.get("attempts",0)+1)}).eq("id",job["id"]).execute()
        status = await _process_job(job, db)
        db.table("grading_queue").update({"status":status,"graded_at":datetime.now(timezone.utc).isoformat(),
            "last_error": None if status=="done" else "grading failed"}).eq("id",job["id"]).execute()
        results.append({"id":job["id"],"session_id":job["session_id"],"status":status})
    return {"processed": len(jobs), "jobs": results}


@router.get("/grading_queue")
async def get_queue(status: Optional[str]=None, limit: int=Query(50,le=200), _=Depends(verify_admin)):
    db = get_supabase()
    q  = db.table("grading_queue").select("*").order("created_at",desc=True).limit(limit)
    if status: q = q.eq("status", status)
    data = q.execute().data or []
    counts = {}
    for j in data:
        counts[j["status"]] = counts.get(j["status"],0) + 1
    return {"items": data, "total": len(data), "counts": counts}


class ManualGrade(BaseModel):
    score: float
    total_marks: float
    notes: Optional[str] = None

@router.post("/grading/{job_id}/manual")
async def manual_grade(job_id: str, req: ManualGrade, _=Depends(verify_admin)):
    db  = get_supabase()
    job = db.table("grading_queue").select("*").eq("id",job_id).maybe_single().execute().data
    if not job: raise HTTPException(404, "Job not found")
    db.table("exam_results").upsert({"session_id":job["session_id"],"student_id":str(job["user_id"]),
        "score":req.score,"total_marks":req.total_marks,"submitted_at":datetime.now(timezone.utc).isoformat()},
        on_conflict="session_id").execute()
    db.table("grading_queue").update({"status":"done","graded_at":datetime.now(timezone.utc).isoformat(),
        "last_error":f"Manual: {req.notes or ''}"}).eq("id",job_id).execute()
    return {"status": "ok"}

@router.post("/grading/{job_id}/retry")
async def retry(job_id: str, _=Depends(verify_admin)):
    get_supabase().table("grading_queue").update({"status":"pending","last_error":None}).eq("id",job_id).execute()
    return {"status": "ok"}
