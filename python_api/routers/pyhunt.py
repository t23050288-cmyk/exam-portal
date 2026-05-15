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
    
    # 2. Get clues config from global config — with fallback to category column
    cfg_res = sb.table("exam_config").select("config_json, category").eq("exam_title", "PYHUNT_GLOBAL_CONFIG").maybe_single().execute()
    if not cfg_res.data:
        raise HTTPException(status_code=404, detail="PyHunt configuration not found")
    
    # Try config_json first, then fallback to category (for pre-migration setups)
    cfg = cfg_res.data.get("config_json")
    if not cfg:
        cat_raw = cfg_res.data.get("category")
        if cat_raw and cat_raw not in [None, "", "PYHUNT"]:
            try:
                cfg = json.loads(cat_raw)
            except:
                cfg = None
    
    if not cfg:
        raise HTTPException(status_code=404, detail="PyHunt config is empty. Please save config from Admin tab first.")
    
    # Determine clues for current round (e.g. round1Clues, round2Clues...)
    clue_key = f"round{req.round_id}Clues"
    clues = cfg.get(clue_key, [])
    
    if not clues:
        # Fallback to round1Clues if specific round not found (legacy support)
        clues = cfg.get("round1Clues", [])
        
    if not clues:
        raise HTTPException(status_code=400, detail="No clues defined for this round")
    
    # 3. Determine which clue they SHOULD have (round-robin: rank 1→clue[0], rank 2→clue[1], etc.)
    clue_index = (rank - 1) % len(clues)
    expected_data = clues[clue_index]
    
    # 4. Validate the pass-code (case-insensitive, trimmed)
    submitted = req.submitted_pass_code.strip().upper()
    expected = str(expected_data.get("unlockCode", "")).strip().upper()
    
    is_success = submitted == expected
    
    # Detailed debug logging
    print(f"[PyHunt Unlock] round={req.round_id}, user={user['id']}, rank={rank}, "
          f"clue_index={clue_index}, total_clues={len(clues)}, "
          f"submitted='{submitted}', expected='{expected}', match={is_success}")
    
    # Log the attempt
    try:
        sb.table("pyhunt_logs").insert({
            "student_id": user["id"],
            "round_id": req.round_id,
            "submitted_code": submitted,
            "expected_code": expected,
            "is_success": is_success
        }).execute()
    except Exception as e:
        print(f"Failed to log PyHunt attempt: {e}")

    if not is_success:
        return {
            "status": "Fail",
            "message": f"Wrong code! Your clue is #{clue_index + 1}. Enter the code for YOUR assigned clue only.",
            "rank": rank,
            "clue_index": clue_index + 1  # 1-based for display
        }
    
    return {
        "status": "Pass",
        "message": "Access Granted",
        "rank": rank,
        "clue": expected_data.get("clueText", "")
    }

class CompleteRequest(BaseModel):
    round_id: int

@router.post("/complete-round")
async def complete_round(req: CompleteRequest, user=Depends(get_current_student)):
    sb = get_supabase()
    
    # 1. Assign rank atomically
    res = sb.rpc("get_strict_rank", {"p_round_id": req.round_id, "p_user_id": user["id"]}).execute()
    rank = res.data
    
    if rank is None:
        raise HTTPException(status_code=500, detail="Failed to assign rank")
        
    # 2. Update pyhunt_progress with the score/rank
    # Note: frontend will sync other details later, but rank is critical for clue
    sb.table("pyhunt_progress").upsert({
        "student_id": user["id"],
        "round1_rank": rank if req.round_id == 1 else None, # Only round 1 rank matters for clues for now
        "last_active": "now()"
    }).execute()
    
    return {"status": "Success", "rank": rank}
