"""
Groq AI proxy — PyHunt code validator (Rounds 3 & 4)
Routes: POST /api/ai/check-code
        POST /api/ai/hint
        POST /api/ai/proctor (supports streaming)
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os, json, re, logging, asyncio
import httpx
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
    Uses NVIDIA NIM if available (supports streaming), otherwise falls back to Groq.
    """
    # ── NVIDIA NIM BRANCH (Supports Streaming + Reasoning) ──────────────────
    if settings.nvidia_api_key:
        try:
            payload = {
                "model": settings.proctor_model,
                "messages": [{"role": "system", "content": "You are a professional proctor assistant."}] + req.messages,
                "temperature": 1.0,
                "top_p": 0.95,
                "max_tokens": 4096,
                "stream": req.stream,
            }
            headers = {
                "Authorization": f"Bearer {settings.nvidia_api_key}",
                "Content-Type": "application/json",
            }
            base_url = "https://integrate.api.nvidia.com/v1"

            if not req.stream:
                async with httpx.AsyncClient(timeout=90) as http_client:
                    resp = await http_client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                # Clean up <think> tags for DeepSeek R1
                for choice in data.get("choices", []):
                    msg = choice.get("message", {})
                    raw = msg.get("content", "")
                    msg["content"] = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
                return data

            # STREAMING GENERATOR
            async def stream_generator():
                try:
                    async with httpx.AsyncClient(timeout=90) as http_client:
                        async with http_client.stream("POST", f"{base_url}/chat/completions", headers=headers, json=payload) as resp:
                            resp.raise_for_status()
                            in_think = False
                            async for line in resp.aiter_lines():
                                if not line.strip() or not line.startswith("data:"): continue
                                payload_str = line[5:].strip()
                                if payload_str == "[DONE]":
                                    yield "data: [DONE]\n\n"
                                    break
                                try:
                                    chunk = json.loads(payload_str)
                                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                                    content = delta.get("content", "")
                                    
                                    # Logic to split content and reasoning (for DeepSeek)
                                    if "<think>" in content:
                                        in_think = True
                                        content = content.replace("<think>", "")
                                    if "</think>" in content:
                                        in_think = False
                                        content = content.replace("</think>", "")
                                    
                                    if in_think:
                                        chunk["choices"][0]["delta"]["content"] = ""
                                        chunk["choices"][0]["delta"]["reasoning_content"] = content
                                    
                                    yield f"data: {json.dumps(chunk)}\n\n"
                                except: continue
                except Exception as e:
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"

            return StreamingResponse(stream_generator(), media_type="text/event-stream")

        except Exception as e:
            logger.warning(f"NVIDIA Proctor failed, falling back to Groq: {e}")

    # ── GROQ FALLBACK (Non-Streaming) ──────────────────────────────────────
    if not settings.groq_api_key:
        raise HTTPException(status_code=500, detail="No AI keys configured")

    try:
        completion = client.chat.completions.create(
            model=MODEL_SMART,
            messages=[{"role": "system", "content": "You are a professional proctor assistant."}] + req.messages,
            temperature=0.7,
            max_tokens=1024,
            stream=False # Groq fallback currently non-streaming in this simple implementation
        )
        return {"choices": [{"message": {"content": completion.choices[0].message.content}}]}
    except Exception as e:
        logger.error(f"AI proctor error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
