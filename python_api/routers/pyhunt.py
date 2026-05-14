from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db.supabase_client import get_supabase
from core.security import get_current_student
import json

router = APIRouter(prefix="/exam/pyhunt", tags=["PyHunt"])

class UnlockRequest(BaseModel):
    round_id: int
    submitted_pass_code: str

@router.post("/unlock")
async def unlock_round(req: UnlockRequest, user=Depends(get_current_student)):
    sb = get_supabase()
    
    # 1. Get strict rank (1st person gets 1, 2nd gets 2)
    res = sb.rpc("get_strict_rank", {"p_round_id": req.round_id, "p_user_id": user["id"]}).execute()
    
    # Handle postgrest response format
    rank = res.data
    if rank is None:
        raise HTTPException(status_code=500, detail="Failed to assign rank")
    
    # 2. Get clues config from global config
    cfg_res = sb.table("exam_config").select("config_json").eq("exam_title", "PYHUNT_GLOBAL_CONFIG").maybe_single().execute()
    if not cfg_res.data:
        raise HTTPException(status_code=404, detail="PyHunt configuration not found")
    
    cfg = cfg_res.data["config_json"]
    
    # Determine clues for current round (e.g. round1Clues, round2Clues...)
    clue_key = f"round{req.round_id}Clues"
    clues = cfg.get(clue_key, [])
    
    if not clues:
        # Fallback to round1Clues if specific round not found (legacy support)
        clues = cfg.get("round1Clues", [])
        
    if not clues:
        raise HTTPException(status_code=400, detail="No clues defined for this round")
    
    # 3. Determine which clue they SHOULD have
    clue_index = (rank - 1) % len(clues)
    expected_data = clues[clue_index]
    
    # 4. Validate the pass-code (case-insensitive)
    submitted = req.submitted_pass_code.strip().upper()
    expected = expected_data.get("unlockCode", "").strip().upper()
    
    if submitted != expected:
        return {
            "status": "Fail",
            "message": "Wrong Pass-Code! You must enter the code for YOUR assigned clue.",
            "rank": rank # Inform student of their rank for debugging if needed
        }
    
    return {
        "status": "Pass",
        "message": "Access Granted",
        "rank": rank,
        "clue": expected_data.get("clueText", "")
    }
