"""
Leaderboard Router
Returns student rankings sorted by: score DESC, time_taken ASC (dual-logic: accuracy + velocity).
"""

from fastapi import APIRouter, Depends
from datetime import datetime, timezone
from models.schemas import LeaderboardEntry, LeaderboardResponse
from db.supabase_client import get_supabase
from routers.admin import verify_admin

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


def _compute_leaderboard() -> LeaderboardResponse:
    db = get_supabase()

    # Fetch all submitted results with student info
    results = (
        db.table("exam_results")
        .select("student_id, score, total_marks, submitted_at")
        .execute()
    )

    # Fetch exam status for started_at (velocity)
    statuses = (
        db.table("exam_status")
        .select("student_id, started_at, status")
        .execute()
    )
    status_map = {s["student_id"]: s for s in (statuses.data or [])}

    # Fetch student profiles
    students = db.table("students").select("id, usn, name, branch").execute()
    student_map = {s["id"]: s for s in (students.data or [])}

    entries: list[LeaderboardEntry] = []

    for r in (results.data or []):
        sid = r["student_id"]
        student = student_map.get(sid)
        if not student:
            continue

        exam_status = status_map.get(sid, {})
        # Only include submitted students
        if exam_status.get("status") != "submitted":
            continue

        score = r.get("score") or 0
        total_marks = r.get("total_marks") or 0
        pct = round(score / total_marks * 100, 1) if total_marks else 0.0

        # Calculate velocity
        time_taken: int | None = None
        if r.get("submitted_at") and exam_status.get("started_at"):
            try:
                t_start = datetime.fromisoformat(exam_status["started_at"].replace("Z", "+00:00"))
                t_end = datetime.fromisoformat(r["submitted_at"].replace("Z", "+00:00"))
                time_taken = int((t_end - t_start).total_seconds())
            except Exception:
                pass

        entries.append(
            LeaderboardEntry(
                rank=0,  # assigned below
                student_id=sid,
                usn=student.get("usn", ""),
                name=student.get("name", ""),
                branch=student.get("branch", "CS"),
                score=score,
                total_marks=total_marks,
                percentage=pct,
                time_taken_seconds=time_taken,
                submitted_at=r.get("submitted_at"),
            )
        )

    # Sort: highest score first, then fastest time first
    entries.sort(
        key=lambda e: (-e.score, e.time_taken_seconds if e.time_taken_seconds is not None else 999999)
    )

    # Assign ranks
    for i, entry in enumerate(entries):
        entry.rank = i + 1

    return LeaderboardResponse(
        entries=entries,
        total_submitted=len(entries),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("", response_model=LeaderboardResponse)
async def get_leaderboard():
    """Public leaderboard — shows submitted students ranked by score + speed."""
    return _compute_leaderboard()


@router.get("/admin", response_model=LeaderboardResponse)
async def get_admin_leaderboard(_: bool = Depends(verify_admin)):
    """Admin-authenticated leaderboard with full details."""
    return _compute_leaderboard()
