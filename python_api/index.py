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
    return {"status": "ok", "version": "1.0.5", "timestamp": datetime.now(timezone.utc).isoformat()}

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
    from routers import auth, exam, violations, admin, ingest, leaderboard, sessions, sync, uploads, aggregate, admin_auth, grading, support, pyhunt_engine, pyhunt
    # nvidia_ai removed — AI now handled by Next.js Edge (Groq)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
    logger = logging.getLogger("examguard")

    settings = get_settings()

    # Single mount with /api prefix for consistency
    # Define routers list
    routers_list = [auth, exam, violations, admin, ingest, leaderboard, sessions, sync, uploads, aggregate, admin_auth, grading, support, pyhunt_engine, pyhunt]

    # Mount routers with /api prefix only
    # Vercel routes /api/* → this lambda, so root-mounting is redundant and wastes memory
    for r in routers_list:
        app.include_router(r.router, prefix="/api")



    @app.post("/api/admin/run-migrations")
    async def run_migrations(request: Request):
        """Run pending DB migrations. Admin-only."""
        from core.config import get_settings as _gs
        secret = request.headers.get("x-admin-secret", "")
        cfg = _gs()
        admin_secret = getattr(cfg, "admin_secret", None) or os.environ.get("NEXT_PUBLIC_ADMIN_SECRET", "rudranshsarvam")
        if secret.strip() != admin_secret.strip():
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
        
        results = []
        try:
            from db.supabase_client import execute_sql
            migrations = [
                ("v7_is_banned", "ALTER TABLE students ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE"),
                ("v7_exams_completed", "ALTER TABLE students ADD COLUMN IF NOT EXISTS exams_completed INTEGER DEFAULT 0"),
            ]
            for name, sql in migrations:
                try:
                    execute_sql(sql)
                    results.append({"migration": name, "status": "ok"})
                except Exception as e:
                    results.append({"migration": name, "status": "error", "detail": str(e)})
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": str(e), "results": results})
        
        return {"status": "done", "results": results}

    # Cron
    @app.get("/api/cron/evict")
    async def cron_evict():
        try:
            db = get_supabase()
            # Fetch only active exams that HAVE a schedule
            result = db.table("exam_config").select("id,is_active,scheduled_end,exam_title").eq("is_active", True).not_.is_("scheduled_end", "null").execute()
            
            deactivated_count = 0
            if result.data:
                ids_to_deactivate = []
                now = datetime.now(timezone.utc)
                
                for cfg in result.data:
                    end_str = cfg.get("scheduled_end")
                    if not end_str:
                        continue
                    
                    try:
                        # Parse and handle 'Z' suffix
                        end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                        if now >= end_dt:
                            ids_to_deactivate.append(cfg["id"])
                            print(f"[CRON] Evicting expired exam: {cfg.get('exam_title')} (ID: {cfg['id']})")
                    except Exception as e:
                        print(f"[CRON] Error parsing schedule for {cfg.get('exam_title')}: {e}")

                if ids_to_deactivate:
                    db.table("exam_config").update({"is_active": False}).in_("id", ids_to_deactivate).execute()
                    deactivated_count = len(ids_to_deactivate)
                    print(f"[CRON] Successfully deactivated {deactivated_count} exams.")
            
            return {"status": "ok", "deactivated": deactivated_count}
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

