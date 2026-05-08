"""
NVIDIA NIM AI proxy — used by PyHunt to validate code with AI
Route: POST /api/ai/check-code
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, httpx

router = APIRouter()

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
MODEL = "deepseek-ai/deepseek-r1-0528"

class CodeCheckRequest(BaseModel):
    problem_title: str
    problem_description: str
    code: str
    test_cases: list[dict]  # [{input, expected}]
    round_num: int

class HintRequest(BaseModel):
    problem_title: str
    code: str
    error: str | None = None

@router.post("/ai/check-code")
async def check_code(req: CodeCheckRequest):
    """Use NVIDIA NIM to validate student code logic and give smart feedback."""
    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA_API_KEY not configured")

    tc_text = "\n".join([f"  Input: {tc['input']} → Expected: {tc['expected']}" for tc in req.test_cases])
    prompt = f"""You are a Python code grader for a student competition called PyHunt.

Problem: {req.problem_title}
Description: {req.problem_description}

Test Cases:
{tc_text}

Student Code:
```python
{req.code}
```

Analyze the code and respond in this EXACT JSON format (no markdown, no explanation outside JSON):
{{
  "correct": true/false,
  "all_tests_pass": true/false,
  "feedback": "One encouraging sentence. If wrong, hint at what to fix without giving the answer.",
  "hint": "A gentle nudge toward the solution (only if incorrect)"
}}"""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{NVIDIA_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {NVIDIA_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 300,
                }
            )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()
        # Parse JSON from content
        import json, re
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = {"correct": False, "all_tests_pass": False, "feedback": content, "hint": ""}
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/hint")
async def get_hint(req: HintRequest):
    """Get a gentle hint for stuck students."""
    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA_API_KEY not configured")

    prompt = f"""You are a helpful Python mentor in a treasure hunt game.

Problem: {req.problem_title}

Student's code:
```python
{req.code}
```

Error (if any): {req.error or "No error, but logic might be wrong"}

Give ONE short, encouraging hint (max 2 sentences) that nudges them toward the solution without giving it away. No code snippets."""

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{NVIDIA_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {NVIDIA_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 150,
                }
            )
        resp.raise_for_status()
        data = resp.json()
        hint = data["choices"][0]["message"]["content"].strip()
        return {"hint": hint}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
