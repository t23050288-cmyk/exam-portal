"""
NVIDIA NIM AI proxy — PyHunt code validator
Routes: POST /api/ai/check-code
        POST /api/ai/hint
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, httpx, json, re, logging

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger("examguard.nvidia_ai")

NVIDIA_API_KEY  = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
MODEL           = "deepseek-ai/deepseek-v4-flash"   # confirmed available on NIM

SYSTEM_PROMPT = """You are the 'ExamPortal Intelligence', a high-performance AI proctor and study assistant for the ExamPortal project.

Your Mission:
- Provide strictly helpful, concise, and academic guidance.
- Act as a supportive proctor or study guide.
- Programmable Restriction: NEVER leak direct answers if the user is in an active exam session. Instead, provide hints, concepts, or logic-based explanations to guide them.
- Use your deep reasoning capabilities to ensure technical accuracy in programming (Python) and aptitude.

Response Style:
- Professional, encouraging, and highly structured.
- Use bullet points or numbered lists for clarity.
- When explaining code, focus on the "why" and "how" rather than just the "what"."""

class ProctorRequest(BaseModel):
    messages: list[dict]
    stream: bool = False

class CodeCheckRequest(BaseModel):
    problem_title: str
    problem_description: str
    code: str
    test_cases: list[dict]   # [{input, expected}]
    round_num: int

class HintRequest(BaseModel):
    problem_title: str
    code: str
    error: str | None = None

@router.post("/ai/check-code")
async def check_code(req: CodeCheckRequest):
    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA_API_KEY not configured")

    tc_text = "\n".join(
        f"  Input: {tc.get('input','')} → Expected: {tc.get('expected','')}"
        for tc in req.test_cases
    )
    prompt = f"""You are a Python code grader for a student competition called PyHunt.

Problem: {req.problem_title}
Description: {req.problem_description}

Test Cases:
{tc_text}

Student Code:
```python
{req.code}
```

Respond ONLY with this JSON (no markdown, no extra text):
{{"correct": true, "feedback": "One short encouraging sentence. If wrong, hint at what to fix — no answer."}}"""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{NVIDIA_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 200,
                }
            )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        # Strip <think>...</think> from DeepSeek R1 style
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            return json.loads(match.group())
        return {"correct": False, "feedback": content[:200]}
    except Exception as e:
        logger.error(f"AI check-code error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/hint")
async def get_hint(req: HintRequest):
    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA_API_KEY not configured")

    prompt = f"""You are a helpful Python mentor in a treasure hunt game.

Problem: {req.problem_title}

Student code:
```python
{req.code}
```

Error/issues: {req.error or "Logic might be wrong"}

Give ONE short encouraging hint (max 2 sentences) nudging them toward the solution. No code snippets."""

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{NVIDIA_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "max_tokens": 120,
                }
            )
        resp.raise_for_status()
        hint = resp.json()["choices"][0]["message"]["content"].strip()
        # Strip <think> tags
        hint = re.sub(r'<think>.*?</think>', '', hint, flags=re.DOTALL).strip()
        return {"hint": hint[:300]}
    except Exception as e:
        logger.error(f"AI hint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/proctor")
async def proctor_chat(req: ProctorRequest):
    """
    General AI proctor/assistant chat endpoint.
    Bypasses Vercel timeouts if used with streaming (optional).
    """
    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA_API_KEY not configured")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + req.messages

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # We don't implement full streaming here yet for simplicity, 
            # but we could return a StreamingResponse if needed.
            resp = await client.post(
                f"{NVIDIA_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": MODEL,
                    "messages": messages,
                    "temperature": 1.0,
                    "top_p": 0.95,
                    "max_tokens": 4096,
                }
            )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"AI proctor error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
