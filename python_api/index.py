# Vercel Deployment — ExamGuard API
import os
import sys
import logging
import traceback
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ensure the python_api/ directory is on the path for imports
_api_dir = os.path.dirname(os.path.abspath(__file__))
if _api_dir not in sys.path:
    sys.path.insert(0, _api_dir)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("examguard")

# ── App (top-level so Vercel can find it) ─────────────────────
app = FastAPI(
    title="ExamGuard API",
    description="Online Exam System",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None,
)

# ── CORS ──────────────────────────────────────────────────────
_allowed_raw = os.getenv("ALLOWED_ORIGINS", "")
_origins = [o.strip() for o in _allowed_raw.split(",") if o.strip()] if _allowed_raw else []
_origins += ["http://localhost:3000", "http://localhost:3001"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins if _origins else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Health ────────────────────────────────────────────────────
@app.get("/api/health")
@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.2", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/api")
@app.get("/")
async def root():
    return {"message": "ExamGuard API Active", "version": "1.0.2"}

# ── Load routers (deferred so startup errors are visible) ─────
_init_error = None
_init_traceback = None

try:
    from db.supabase_client import get_supabase
    from core.config import get_settings
    from routers import auth, exam, violations, admin, ingest, leaderboard

    settings = get_settings()

    # Mount with /api prefix
    app.include_router(auth.router,       prefix="/api")
    app.include_router(exam.router,       prefix="/api")
    app.include_router(violations.router, prefix="/api")
    app.include_router(admin.router,      prefix="/api")
    app.include_router(ingest.router,     prefix="/api")
    app.include_router(leaderboard.router,prefix="/api")

    # ── Cron ──────────────────────────────────────────────────
    @app.get("/api/cron/evict")
    async def cron_evict():
        try:
            db = get_supabase()
            result = db.table("exam_config").select("id,is_active,scheduled_end,exam_title").eq("is_active", True).not_.is_("scheduled_end", "null").execute()
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
            return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

    logger.info("ExamGuard API initialized successfully")

except Exception as e:
    _init_error = str(e)
    _init_traceback = traceback.format_exc()
    logger.error(f"Startup error: {_init_error}\n{_init_traceback}")

    @app.get("/api/startup-error")
    async def startup_error():
        return JSONResponse(status_code=500, content={
            "status": "initialization_failed",
            "error": _init_error,
            "traceback": _init_traceback
        })

# ── Global error handler ──────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    logger.error(f"Unhandled error on {request.url}: {exc}\n{tb}")
    return JSONResponse(status_code=500, content={
        "detail": str(exc),
        "traceback": tb if not os.getenv("PROD") else "Hidden in production"
    })
