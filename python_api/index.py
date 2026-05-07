# Vercel Deployment — ExamGuard API
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime, timezone
import logging
import traceback
import os
import sys

# Top-level app definition (required by @vercel/python)
app = FastAPI(
    title="ExamGuard API",
    description="Online Exam System",
    version="1.0.5",
    docs_url="/api/docs",
    redoc_url=None,
)

# CORS — fully open
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health always works
@app.get("/api/health")
@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.4", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/api")
@app.get("/")
async def root():
    return {"message": "ExamGuard API Active", "version": "1.0.4"}

# Load routers
_init_error = None
_init_traceback = None

try:
    api_dir = os.path.dirname(os.path.abspath(__file__))
    if api_dir not in sys.path:
        sys.path.insert(0, api_dir)

    from db.supabase_client import get_supabase
    from core.config import get_settings
    from routers import auth, exam, violations, admin, ingest, leaderboard, sessions, sync, uploads, aggregate, admin_auth, grading

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
    logger = logging.getLogger("examguard")

    settings = get_settings()

    # Single mount with /api prefix
    app.include_router(auth.router,        prefix="/api")
    app.include_router(exam.router,        prefix="/api")
    app.include_router(violations.router,  prefix="/api")
    app.include_router(admin.router,       prefix="/api")
    app.include_router(ingest.router,      prefix="/api")
    app.include_router(leaderboard.router, prefix="/api")
    app.include_router(sessions.router)          # /api/start_exam, /api/final_submit, /api/export_session
    app.include_router(sync.router)              # /api/autosave, /api/events_batch, /api/events_beacon, /api/sync
    app.include_router(uploads.router)           # /api/sign_upload
    app.include_router(aggregate.router)
    app.include_router(admin_auth.router)
    app.include_router(grading.router)         # /api/admin/aggregate, /api/admin/throttle

    # Cron
    @app.get("/api/cron/evict")
    async def cron_evict():
        try:
            db = get_supabase()
            result = db.table("exam_config").select("id,is_active,scheduled_end").eq("is_active", True).not_.is_("scheduled_end", "null").execute()
            deactivated = 0
            for cfg in (result.data or []):
                end_str = cfg["scheduled_end"].replace("Z", "+00:00")
                try:
                    if datetime.now(timezone.utc) >= datetime.fromisoformat(end_str):
                        db.table("exam_config").update({"is_active": False}).eq("id", cfg["id"]).execute()
                        deactivated += 1
                except Exception:
                    continue
            return {"status": "success", "deactivated": deactivated}
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": str(e)})

    logger.info("ExamGuard API v1.0.4 initialized OK")

except Exception as e:
    _init_error = str(e)
    _init_traceback = traceback.format_exc()

# Error endpoint — always registered
@app.get("/api/error")
async def startup_error():
    if _init_error:
        return JSONResponse(status_code=500, content={
            "status": "initialization_failed",
            "error": _init_error,
            "traceback": _init_traceback
        })
    return {"status": "ok", "message": "No initialization errors"}

# Global error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": traceback.format_exc()},
    )
