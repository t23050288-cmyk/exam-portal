# Vercel Deployment — ExamGuard API
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from datetime import datetime, timezone
import traceback

try:
    import os
    import sys

    api_dir = os.path.dirname(os.path.abspath(__file__))
    if api_dir not in sys.path:
        sys.path.insert(0, api_dir)

    from db.supabase_client import get_supabase
    from core.config import get_settings
    from routers import auth, exam, violations, admin, ingest, leaderboard

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
    logger = logging.getLogger("examguard")

    settings = get_settings()

    app = FastAPI(
        title="ExamGuard API",
        description="Online Exam System",
        version="1.0.3",
        docs_url="/api/docs",
        redoc_url=None,
    )

    # ── CORS — fully open ────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Health (no prefix needed) ────────────────────────────────
    @app.get("/api/health")
    @app.get("/health")
    async def health_check():
        return {"status": "ok", "version": "1.0.3", "timestamp": datetime.now(timezone.utc).isoformat()}

    @app.get("/api")
    @app.get("/")
    async def root():
        return {"message": "ExamGuard API Active", "version": "1.0.3"}

    # ── Routers — SINGLE mount with /api prefix ──────────────────
    # vercel.json: /api/(.*) → python_api/index.py
    # FastAPI receives the full path: /api/admin/login etc.
    app.include_router(auth.router,        prefix="/api")
    app.include_router(exam.router,        prefix="/api")
    app.include_router(violations.router,  prefix="/api")
    app.include_router(admin.router,       prefix="/api")
    app.include_router(ingest.router,      prefix="/api")
    app.include_router(leaderboard.router, prefix="/api")

    # ── Cron ─────────────────────────────────────────────────────
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

    # ── Global Error Handler ──────────────────────────────────────
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        tb = traceback.format_exc()
        logger.error(f"Unhandled error: {exc}\n{tb}")
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc), "traceback": tb},
        )

    logger.info("ExamGuard API v1.0.3 initialized OK")

except Exception as e:
    import traceback as tb_mod
    _init_error = str(e)
    _init_traceback = tb_mod.format_exc()

    app = FastAPI()

    @app.get("/api/health")
    @app.get("/health")
    @app.get("/api/error")
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
