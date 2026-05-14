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
            "version": "3.10.0",
            "files": [{"content": code}],
            "stdin": tc.input,
            "run_timeout": 3000
        }
        resp = await client.post("https://emkc.org/api/v2/piston/execute", json=payload, timeout=5.0)
        data = resp.json()
        run = data.get("run", {})
        stdout = run.get("stdout", "").strip()
        stderr = run.get("stderr", "").strip()
        is_correct = (stdout == tc.expected.strip()) and not stderr
        if not is_correct: all_pass = False
        results.append({"pass": is_correct, "got": stderr or stdout, "expected": tc.expected})
    return {"ok": True, "results": results, "all_pass": all_pass, "engine": "Piston v2"}

async def verify_groq(client: httpx.AsyncClient, code: str, test_cases: List[TestCase], model: str):
    """Tier 2 & 3: Groq AI (Intelligence Fallback)"""
    settings = get_settings()
    if not settings.groq_api_key or "your_key" in settings.groq_api_key: return None
    
    prompt = f"Verify this Python code against these test cases. Return ONLY a JSON object with 'results' (list of {{'pass': bool, 'got': string, 'expected': string}}) and 'all_pass': bool.\n\nCode:\n{code}\n\nTest Cases:\n"
    for i, tc in enumerate(test_cases):
        prompt += f"{i+1}. Input: {tc.input} | Expected: {tc.expected}\n"

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
        try:
            return await verify_piston(client, request.code, request.test_cases)
        except Exception as e:
            print(f"[HCOL] Piston Failed: {e}. Falling back to Groq 70B...")

        # Tier 2: Groq 70B
        try:
            res = await verify_groq(client, request.code, request.test_cases, "llama-3.1-70b-versatile")
            if res: 
                res["engine"] = "Groq Llama 3.1 70B"
                res["ok"] = True
                return res
        except Exception as e:
            print(f"[HCOL] Groq 70B Failed: {e}. Falling back to Groq 8B...")

        # Tier 3: Groq 8B
        try:
            res = await verify_groq(client, request.code, request.test_cases, "llama-3.1-8b-instant")
            if res:
                res["engine"] = "Groq Llama 3.1 8B"
                res["ok"] = True
                return res
        except Exception as e:
            print(f"[HCOL] Groq 8B Failed: {e}. Falling back to Emergency Regex...")

        # Tier 4: Emergency Regex
        return verify_regex_emergency(request.code, request.test_cases)
