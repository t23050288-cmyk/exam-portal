from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
from .auth import get_current_student

router = APIRouter(prefix="/exam/pyhunt", tags=["PyHunt Engine"])

class TestCase(BaseModel):
    input: str
    expected: str

class VerifyRequest(BaseModel):
    code: str
    test_cases: List[TestCase]

@router.post("/verify")
async def verify_code(request: VerifyRequest, current: dict = Depends(get_current_student)):
    """
    Professional Grade Execution Engine (Plan A: Piston API)
    Executes student code in a sandbox and verifies against hidden test cases.
    """
    results = []
    all_pass = True
    
    async with httpx.AsyncClient() as client:
        for tc in request.test_cases:
            # Prepare Piston Payload
            payload = {
                "language": "python",
                "version": "3.10.0",
                "files": [{"content": request.code}],
                "stdin": tc.input,
                "compile_timeout": 10000,
                "run_timeout": 3000,
                "memory_limit": -1
            }
            
            try:
                # Call Piston API (Public instance)
                resp = await client.post("https://emkc.org/api/v2/piston/execute", json=payload, timeout=10.0)
                data = resp.json()
                
                run = data.get("run", {})
                stdout = run.get("stdout", "").strip()
                stderr = run.get("stderr", "").strip()
                signal = run.get("signal") # e.g. SIGKILL for timeout
                
                # Verification Logic
                expected_clean = tc.expected.strip()
                
                is_correct = (stdout == expected_clean) and not stderr
                
                if signal:
                    got = f"Execution Terminated ({signal})"
                    is_correct = False
                elif stderr:
                    got = f"Runtime Error:\n{stderr}"
                    is_correct = False
                else:
                    got = stdout
                
                if not is_correct:
                    all_pass = False
                
                results.append({
                    "pass": is_correct,
                    "got": got,
                    "expected": expected_clean
                })
                
            except Exception as e:
                all_pass = False
                results.append({
                    "pass": False,
                    "got": f"Engine Error: {str(e)}",
                    "expected": tc.expected
                })
                
    return {
        "ok": True, 
        "results": results, 
        "all_pass": all_pass,
        "engine": "Piston v2"
    }
