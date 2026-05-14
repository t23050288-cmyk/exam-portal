"""
Groq AI proxy — PyHunt code validator (Rounds 3 & 4)
Routes: POST /api/ai/check-code
        POST /api/ai/hint
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, json, re, logging
from groq import Groq
from core.config import get_settings

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger("examguard.groq_ai")

# Initialize client globally
settings = get_settings()
client = Groq(api_key=settings.groq_api_key) if settings.groq_api_key else None

# Models
MODEL_SMART = "llama-3.1-70b-versatile"
MODEL_FAST  = "llama-3.1-8b-instant"

SYSTEM_PROMPT = """You are a strict Python evaluator for the 'PyHunt' competition. 
Analyze the student's code for syntax and logic.
Rule: Be extremely concise. 
Rule: You MUST respond ONLY in strict JSON.

JSON Schema:
{
  "correct": boolean,
  "score": integer (0-10),
  "status": "Pass" or "Fail",
  "feedback": "One technical sentence only."
}
"""

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

async def _get_groq_completion(model: str, prompt: str, max_tokens: int = 150):
    if not client:
        raise ValueError("GROQ_API_KEY not configured")
    
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1,
        max_tokens=max_tokens,
        response_format={"type": "json_object"}
    )
    return completion.choices[0].message.content

@router.post("/check-code")
async def check_code(req: CodeCheckRequest):
    if not settings.groq_api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

    tc_text = "\n".join(
        f"  Input: {tc.get('input','')} → Expected: {tc.get('expected','')}"
        for tc in req.test_cases
    )
    prompt = f"""Problem: {req.problem_title}
Description: {req.problem_description}
Round: {req.round_num}

Test Cases:
{tc_text}

Student Code:
```python
{req.code}
```"""

    try:
        # Plan A: The High-Intelligence Model
        try:
            content = await _get_groq_completion(MODEL_SMART, prompt)
        except Exception as e:
            logger.warning(f"Groq 70B failed, falling back to 8B: {e}")
            # Plan B: The Instant Fallback
            content = await _get_groq_completion(MODEL_FAST, prompt)
        
        return json.loads(content)
    except Exception as e:
        logger.error(f"AI check-code error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hint")
async def get_hint(req: HintRequest):
    if not settings.groq_api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

    prompt = f"""Problem: {req.problem_title}
Student code:
```python
{req.code}
```
Error/issues: {req.error or "Logic might be wrong"}

Give ONE short encouraging hint (max 2 sentences) nudging them toward the solution. No code snippets.
Return JSON: {{"hint": "your hint here"}}"""

    try:
        content = await _get_groq_completion(MODEL_FAST, prompt, max_tokens=100)
        return json.loads(content)
    except Exception as e:
        logger.error(f"AI hint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/proctor")
async def proctor_chat(req: ProctorRequest):
    """
    General AI proctor/assistant chat endpoint.
    Uses NVIDIA NIM (DeepSeek) if available, otherwise falls back to Groq.
    """
    try:
        # 1. Try NVIDIA NIM first if key exists
        if settings.nvidia_api_key:
            try:
                from openai import OpenAI
                nv_client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=settings.nvidia_api_key)
                completion = nv_client.chat.completions.create(
                    model=settings.proctor_model,
                    messages=[{"role": "system", "content": "You are a professional proctor assistant for the PyHunt competition."}] + req.messages,
                    temperature=0.7,
                    max_tokens=1024,
                )
                return {"choices": [{"message": {"content": completion.choices[0].message.content}}]}
            except Exception as nv_err:
                logger.warning(f"NVIDIA Proctor failed: {nv_err}")
        
        # 2. Fallback to Groq
        if not settings.groq_api_key:
             raise HTTPException(status_code=500, detail="No AI keys (Groq/NVIDIA) configured for proctor.")

        completion = client.chat.completions.create(
            model=MODEL_SMART,
            messages=[{"role": "system", "content": "You are a professional proctor assistant for the PyHunt competition."}] + req.messages,
            temperature=0.7,
            max_tokens=1024,
        )
        return {"choices": [{"message": {"content": completion.choices[0].message.content}}]}
    except Exception as e:
        logger.error(f"AI proctor error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
