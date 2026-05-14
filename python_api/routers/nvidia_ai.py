"""
NVIDIA NIM AI proxy — PyHunt code validator
Routes: POST /api/ai/check-code
        POST /api/ai/hint
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os, httpx, json, re, logging, asyncio

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
        async with httpx.AsyncClient(timeout=60) as client:
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
    - stream=false → returns full JSON response (non-streaming)
    - stream=true  → returns SSE stream, proxied directly from NVIDIA NIM
    Timeout: 90s to accommodate DeepSeek reasoning phase.
    """
    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA_API_KEY not configured")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + req.messages

    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": 1.0,
        "top_p": 0.95,
        "max_tokens": 4096,
        "stream": req.stream,
    }
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json",
    }

    # ── NON-STREAMING ──────────────────────────────────────────────────────
    if not req.stream:
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(
                    f"{NVIDIA_BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload,
                )
            resp.raise_for_status()
            data = resp.json()
            # Strip <think>…</think> from non-streaming content
            for choice in data.get("choices", []):
                msg = choice.get("message", {})
                raw = msg.get("content", "")
                think_match = re.search(r"<think>(.*?)</think>", raw, re.DOTALL)
                if think_match:
                    msg["reasoning_content"] = think_match.group(1).strip()
                    msg["content"] = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
            return data
        except Exception as e:
            logger.error(f"AI proctor (non-stream) error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ── STREAMING ─────────────────────────────────────────────────────────
    async def stream_generator():
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                async with client.stream(
                    "POST",
                    f"{NVIDIA_BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as resp:
                    resp.raise_for_status()
                    in_think = False
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        if not line.startswith("data:"):
                            yield f"{line}\n\n"
                            continue
                        payload_str = line[5:].strip()
                        if payload_str == "[DONE]":
                            yield "data: [DONE]\n\n"
                            break
                        try:
                            chunk = json.loads(payload_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            reasoning = delta.get("reasoning_content", "") or delta.get("reasoning", "")

                            # Handle inline <think> tags in streaming content
                            if "<think>" in content:
                                in_think = True
                                parts = content.split("<think>", 1)
                                if parts[0]:
                                    chunk["choices"][0]["delta"]["content"] = parts[0]
                                    yield f"data: {json.dumps(chunk)}\n\n"
                                reasoning_start = parts[1] if len(parts) > 1 else ""
                                if reasoning_start:
                                    chunk["choices"][0]["delta"]["content"] = ""
                                    chunk["choices"][0]["delta"]["reasoning_content"] = reasoning_start
                                    yield f"data: {json.dumps(chunk)}\n\n"
                                continue
                            if "</think>" in content:
                                in_think = False
                                parts = content.split("</think>", 1)
                                if parts[0]:
                                    chunk["choices"][0]["delta"]["content"] = ""
                                    chunk["choices"][0]["delta"]["reasoning_content"] = parts[0]
                                    yield f"data: {json.dumps(chunk)}\n\n"
                                after = parts[1] if len(parts) > 1 else ""
                                if after:
                                    chunk["choices"][0]["delta"]["content"] = after
                                    chunk["choices"][0]["delta"]["reasoning_content"] = ""
                                    yield f"data: {json.dumps(chunk)}\n\n"
                                continue
                            if in_think:
                                # Route to reasoning_content
                                chunk["choices"][0]["delta"]["content"] = ""
                                chunk["choices"][0]["delta"]["reasoning_content"] = content
                                yield f"data: {json.dumps(chunk)}\n\n"
                                continue

                            yield f"data: {json.dumps(chunk)}\n\n"
                        except json.JSONDecodeError:
                            yield f"data: {json.dumps({'error': 'parse_error', 'raw': payload_str[:100]})}\n\n"
        except Exception as e:
            logger.error(f"AI stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Disable nginx buffering
            "Connection": "keep-alive",
        },
    )
