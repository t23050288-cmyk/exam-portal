import re
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
import asyncio
from .auth import get_current_student
from core.config import get_settings

router = APIRouter(prefix="/exam/pyhunt", tags=["PyHunt Engine"])

class TestCase(BaseModel):
    input: str
    expected: str

class VerifyRequest(BaseModel):
    code: str
    test_cases: List[TestCase]

async def verify_piston(client: httpx.AsyncClient, code: str, test_cases: List[TestCase]):
    """Tier 1: Piston API (Gold Standard)"""
    results = []
    all_pass = True
    for tc in test_cases:
        payload = {
            "language": "python",
            "files": [{"content": code}],
            "stdin": tc.input,
            "run_timeout": 3000
        }
        resp = await client.post("https://emkc.org/api/v2/piston/execute", json=payload, timeout=5.0)
        
        # CRITICAL: Trigger fallback if Piston is down or unauthorized (401)
        if resp.status_code != 200:
            raise Exception(f"Piston API Error {resp.status_code}: {resp.text}")
            
        data = resp.json()
        run = data.get("run", {})
        stdout = run.get("stdout", "").strip()
        stderr = run.get("stderr", "").strip()
        
        # Logic check
        is_correct = (stdout == tc.expected.strip()) and not stderr
        if not is_correct: all_pass = False
        results.append({"pass": is_correct, "got": stderr or stdout, "expected": tc.expected})
        
    return {"ok": True, "results": results, "all_pass": all_pass, "engine": "Piston v2"}

async def verify_groq(client: httpx.AsyncClient, code: str, test_cases: List[TestCase], model: str):
    """Tier 2 & 3: Groq AI (Intelligence Fallback)"""
    settings = get_settings()
    if not settings.groq_api_key or "your_key" in settings.groq_api_key: return None
    
    prompt = "You are a strict Python Code Judge. Verify the following Python code against the provided test cases.\n"
    prompt += "Requirements:\n"
    prompt += "1. Strict Indentation & Syntax: Ensure the code has correct Python indentation and structure.\n"
    prompt += "2. Logical Correctness: Evaluate if the code logic calculates the correct answer according to the expected logic. If the core logic is correct and produces the expected output value, mark it as 'pass: true', EVEN IF the student's print statements have extra formatting or extra text.\n"
    prompt += f"\nCode:\n{code}\n\nTest Cases:\n"
    for i, tc in enumerate(test_cases):
        prompt += f"{i+1}. Input: {tc.input} | Expected Core Value: {tc.expected}\n"
    prompt += "\nReturn ONLY a JSON object with 'results' (list of {'pass': bool, 'got': string, 'expected': string}) and 'all_pass': bool."

    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a Python code judge. Output strict JSON only."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"}
    }
    
    resp = await client.post(f"{settings.groq_base_url}/chat/completions", json=payload, headers=headers, timeout=8.0)
    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    return json.loads(content)

def verify_regex_emergency(code: str, test_cases: List[TestCase]):
    """Tier 4: Local Regex (Emergency Backup)"""
    results = []
    has_print = "print" in code.lower()
    for tc in test_cases:
        results.append({
            "pass": has_print,
            "got": "Emergency Regex Check Active" if has_print else "No print statement detected",
            "expected": tc.expected
        })
    return {"ok": True, "results": results, "all_pass": has_print, "engine": "Local Regex (Emergency)"}

@router.post("/verify")
async def verify_code(request: VerifyRequest, current: dict = Depends(get_current_student)):
    """
    High-Concurrency Optimization Layer (HCOL) - Tiered Failover Path
    1. Plan A (Piston): Sandboxed execution
    2. Plan B (Groq 70B): Intelligence fallback
    3. Plan C (Groq 8B): High-speed fallback
    4. Plan D (Regex): Emergency local check
    """
    async with httpx.AsyncClient() as client:
        # Tier 1: Piston
        piston_res = None
        try:
            piston_res = await verify_piston(client, request.code, request.test_cases)
            if piston_res and piston_res.get("all_pass"):
                return piston_res
            else:
                print(f"[HCOL] Code failed strict Piston tests. Sending to Groq AI for logic evaluation...")
        except Exception as e:
            print(f"[HCOL] Piston Failed: {e}. Falling back to Groq...")

        # Tiers 2 & 3 (Groq AI)
        try:
            res = await verify_groq(client, request.code, request.test_cases, "llama-3.1-70b-versatile")
            if res: 
                if res.get("all_pass"):
                    res["engine"] = "Groq Llama 3.1 70B (AI Override)"
                    res["ok"] = True
                    return res
                elif piston_res:
                    return piston_res
        except Exception as e:
            print(f"[HCOL] Groq 70B Failed: {e}. Falling back to Groq 8B...")

        try:
            res = await verify_groq(client, request.code, request.test_cases, "llama-3.1-8b-instant")
            if res:
                if res.get("all_pass"):
                    res["engine"] = "Groq Llama 3.1 8B (AI Override)"
                    res["ok"] = True
                    return res
                elif piston_res:
                    return piston_res
        except Exception as e:
            print(f"[HCOL] Groq 8B Failed: {e}. Falling back to Emergency Regex...")
            
        if piston_res:
            return piston_res

        # Tier 4: Emergency Regex (Now returns ok: False to trigger frontend fallback)
        emergency = verify_regex_emergency(request.code, request.test_cases)
        emergency["ok"] = False
        return emergency
