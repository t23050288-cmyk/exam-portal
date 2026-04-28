# Vercel Deployment — ExamGuard API
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import logging
import asyncio
from datetime import datetime, timezone
import traceback

try:
    import os
    import sys
    # Ensure the api/ directory is on the Python path for absolute imports
    api_dir = os.path.dirname(os.path.abspath(__file__))
    if api_dir not in sys.path:
        sys.path.insert(0, api_dir)

    from db.supabase_client import get_supabase
    from core.config import get_settings
    from routers import auth, exam, violations, admin, ingest, leaderboard

    # ── Logging ───────────────────────────────────────────────────
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
    logger = logging.getLogger("examguard")

    # ── Rate Limiter ───────────────────────────────────────────────
    limiter = Limiter(key_func=get_remote_address)

    settings = get_settings()

    # ── App ───────────────────────────────────────────────────────
    # NOTE: No root_path here. On Vercel, the rewrite sends /api/* to this
    # function and the ASGI app receives the FULL path (e.g. /api/admin/students).
    # All routers use /api-prefixed routes to match.
    app = FastAPI(
        title="ExamGuard API",
        description="Online Exam System for 266 Concurrent Students",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url=None,
    )

    # ── CORS ──────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health_check():
        return {"status": "ok", "version": "1.0.0", "timestamp": datetime.now(timezone.utc).isoformat()}

    # ── Routers ───────────────────────────────────────────────────
    # On Vercel, requests to /api/* are routed to api/index.py.
    # The ASGI app receives the path relative to /api (e.g. /auth/login).
    app.include_router(auth.router)
    app.include_router(exam.router)
    app.include_router(violations.router)
    app.include_router(admin.router)
    app.include_router(ingest.router)
    app.include_router(leaderboard.router)

    # ── Cron Endpoint ──────────────────────────────────────────────
    @app.get("/cron/evict", tags=["cron"])
    async def cron_evict():
        try:
            db = get_supabase()
            result = db.table("exam_config").select("id, is_active, scheduled_end, exam_title").eq("is_active", True).not_.is_("scheduled_end", "null").execute()
            deactivated_count = 0
            for config in (result.data or []):
                end_time_str = config["scheduled_end"]
                if end_time_str.endswith("Z"):
                    end_time_str = end_time_str[:-1] + "+00:00"
                try:
                    end_time = datetime.fromisoformat(end_time_str)
                    if datetime.now(timezone.utc) >= end_time:
                        db.table("exam_config").update({"is_active": False}).eq("id", config["id"]).execute()
                        deactivated_count += 1
                except Exception: continue
            return {"status": "success", "deactivated": deactivated_count}
        except Exception as e:
            return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

    # ── Root ──────────────────────────────────────────────────────
    @app.get("/", tags=["root"])
    async def root():
        return {"message": "ExamGuard API — Online Exam System", "docs": "/api/docs"}

    # ── Global Error Handler ──────────────────────────────────────
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled error on {request.url}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)},
        )

except Exception as e:
    # Fallback app that shows the initialization error for debugging
    app = FastAPI()
    
    import traceback as tb
    _init_error = str(e)
    _init_traceback = tb.format_exc()

    @app.get("/api/health")
    @app.get("/health")
    @app.get("/api")
    @app.get("/")
    async def error_health(request: Request):
        return JSONResponse(
            status_code=500,
            content={
                "status": "initialization_failed",
                "error": _init_error,
                "traceback": _init_traceback
            }
        )
