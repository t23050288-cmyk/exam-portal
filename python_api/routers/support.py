from fastapi import APIRouter, HTTPException, Depends, Header
from db.supabase_client import get_supabase
from models.schemas import SupportRequestCreate, SupportRequestOut
from datetime import datetime, timezone
from core.config import get_settings

router = APIRouter(prefix="/support", tags=["support"])
settings = get_settings()

async def verify_admin(x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True

@router.post("/request")
async def create_support_request(request: SupportRequestCreate):
    db = get_supabase()
    data = {
        "usn_or_email": request.usn_or_email,
        "description": request.description,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    try:
        result = db.table("support_requests").insert(data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to submit support request")
        return {"status": "success", "id": result.data[0]["id"]}
    except Exception as e:
        # Fallback if table doesn't exist yet — we'll inform the user to create it
        print(f"Support Request Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list", response_model=list[SupportRequestOut])
async def list_support_requests(_: bool = Depends(verify_admin)):
    db = get_supabase()
    result = db.table("support_requests").select("*").order("created_at", desc=True).execute()
    return result.data or []

@router.post("/resolve/{request_id}")
async def resolve_support_request(request_id: str, _: bool = Depends(verify_admin)):
    db = get_supabase()
    db.table("support_requests").update({"status": "resolved"}).eq("id", request_id).execute()
    return {"status": "resolved"}

@router.delete("/clear-all")
async def clear_all_requests(_: bool = Depends(verify_admin)):
    db = get_supabase()
    db.table("support_requests").delete().neq("status", "non-existent-status").execute()
    return {"status": "cleared"}
