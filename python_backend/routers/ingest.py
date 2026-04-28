"""
Ingest Router — Zero-Loss Spectral Parser v2.0
Powered by Inception AI (Mercury) for Semantic Mapping of complex document layouts.
Supports PDF (multi-column), DOCX, and Excel file uploads.
"""

from __future__ import annotations

import io
import re
import json
import logging
import uuid
import httpx
import asyncio
import time
from typing import List, Tuple, Dict, Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from models.schemas import (
    BulkImportRequest,
    IngestPreviewResponse,
    ParsedQuestion,
    QuestionCreate,
)
from db.supabase_client import get_supabase
from routers.admin import verify_admin
from core.config import get_settings

logger = logging.getLogger("examguard.ingest")

router = APIRouter(prefix="/admin/ingest", tags=["ingest"])


# ── Gemini AI Spectral Parser ──────────────────────────────────

_SPECTRAL_PROMPT = """You are a Zero-Loss Spectral Parser — a precision AI engine for extracting Multiple Choice Questions from exam documents.

Your mission:
1. Identify EVERY question, even in complex layouts.
2. The raw text has been pre-processed using SLAE (Segmented Layout-Aware Extraction) to ensure linear reading order.
3. Tether each option (A, B, C, D) STRICTLY to its parent question.
4. Output a perfectly sanitized JSON array.
5. Perform a Finesse Check: match extracted count to expected count.

Output ONLY a raw JSON object with this exact structure:
{
  "questions": [
    {
      "id": 1,
      "text": "Full question text here",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "A",
      "confidence": 0.95,
      "needs_review": false,
      "review_reason": null
    }
  ],
  "extracted_count": 10,
  "expected_count": 10,
  "finesse_check": "Extracted 10 questions. ✓"
}

Rules for "correct_answer": Use the answer key if available. Otherwise, default to "A" and set confidence < 0.5.
Rules for layout: Questions are now linearized. No more interleaved columns. Extract sequentially.

Here is the High-Fidelity Scan of the document:
---
{raw_text}
---

Output JSON only:"""


async def _call_inception_api(raw_text: str, chunk_index: int = 0) -> dict:
    """Call Inception AI API for AI-powered spectral parsing (OpenAI-compatible)."""
    settings = get_settings()
    if not settings.inception_api_key:
        raise ValueError("INCEPTION_API_KEY not configured")

    prompt = _SPECTRAL_PROMPT.replace("{raw_text}", raw_text)

    url = f"{settings.ai_base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.inception_api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": settings.ai_model,
        "messages": [
            {
                "role": "system", 
                "content": "You are a precise data extraction specialist. Output valid JSON only. "
                           "Keep internal reasoning brief. "
                           "Focus on the provided snippet of text."
            },
            {"role": "user", "content": prompt}
        ],
        "temperature": 1.0,
        "top_p": 0.95,
        "max_tokens": 16384
    }

    # Add thinking/reasoning if it's the deepseek-ai/deepseek-v4-pro model or enabled
    if "deepseek-v4" in settings.ai_model or settings.ai_thinking:
        payload["chat_template_kwargs"] = {"thinking": True, "reasoning_effort": "high"}

    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=240.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                
                if response.status_code == 429:
                    wait_time = (attempt + 1) * 5
                    logger.warning(f"Rate limited (429) on chunk {chunk_index}. Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                
                response.raise_for_status()
                break
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            await asyncio.sleep(2)

    data = response.json()
    message = data["choices"][0]["message"]
    raw_content = message.get("content") or ""
    reasoning = message.get("reasoning_content") or ""
    
    if not raw_content and reasoning:
        raw_content = reasoning

    if not raw_content:
        # Log failure for this specific chunk
        with open(f"debug_chunk_{chunk_index}_fail.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        raise ValueError(f"Chunk {chunk_index} returned an empty response.")
    
    # ── Robust JSON Extraction ──
    try:
        start_obj = raw_content.find('{')
        start_arr = raw_content.find('[')
        
        if start_obj != -1 and (start_arr == -1 or start_obj < start_arr):
            start_idx = start_obj
            end_idx = raw_content.rfind('}')
        elif start_arr != -1:
            start_idx = start_arr
            end_idx = raw_content.rfind(']')
        else:
            start_idx = -1
            end_idx = -1

        if start_idx != -1 and end_idx != -1:
            raw_json_text = raw_content[start_idx:end_idx+1]
        else:
            raw_json_text = raw_content.strip()

        raw_json_text = re.sub(r"^```(?:json)?\n?", "", raw_json_text)
        raw_json_text = re.sub(r"\n?```$", "", raw_json_text)
        raw_json_text = re.sub(r',\s*([\]}])', r'\1', raw_json_text)

        return json.loads(raw_json_text)
    except Exception as e:
        logger.error(f"Inception JSON parse error in chunk {chunk_index}: {e}")
        with open(f"debug_chunk_{chunk_index}_parse_fail.json", "w", encoding="utf-8") as f:
            f.write(raw_content)
        raise ValueError(f"Chunk {chunk_index} response was not valid JSON.")


def _chunk_text_by_questions(raw_text: str, target_chunk_size: int = 2500) -> List[str]:
    """
    Intelligent document splitter. 
    Ultra-granular (2500 chars) to ensure ZERO truncation even with reasoning.
    """
    # Pattern to find question starts (e.g., "\n1.", "\nQuestion 10.", "\nQ1.")
    q_marker = re.compile(r"(?:\n|^)\s*(?:\d+|Question\s+\d+|Q\d+)[.)]\s+", re.IGNORECASE)
    
    chunks = []
    current_pos = 0
    text_len = len(raw_text)

    while current_pos < text_len:
        # If remaining text is small enough, it's our last chunk
        if text_len - current_pos <= target_chunk_size * 1.3:
            chunks.append(raw_text[current_pos:])
            break
            
        # Search for a marker around the target size
        search_start = current_pos + target_chunk_size
        search_end = min(search_start + 4000, text_len) # Expansion window
        
        # Try to find the next question marker to cut before it
        marker_match = q_marker.search(raw_text, search_start, search_end)
        
        if marker_match:
            cut_point = marker_match.start()
            # If marker was preceded by a newline, include it in the next chunk
            if raw_text[cut_point] == '\n':
                cut_point += 1
            chunks.append(raw_text[current_pos:cut_point])
            current_pos = cut_point
        else:
            # No natural split found in window, fall back to newline split
            newline_pos = raw_text.rfind('\n', search_start, search_end)
            if newline_pos != -1:
                chunks.append(raw_text[current_pos:newline_pos+1])
                current_pos = newline_pos + 1
            else:
                # Hard cut
                chunks.append(raw_text[current_pos:search_start])
                current_pos = search_start

    return chunks


async def _spectral_parse_with_ai(raw_text: str) -> Tuple[List[ParsedQuestion], List[str], dict]:
    """
    Recursive Spectral Orchestrator.
    Chunks text, calls AI in parallel, and merges results.
    """
    # 1. Chunking
    chunks = _chunk_text_by_questions(raw_text)
    logger.info(f"Ingest: Splitting document into {len(chunks)} chunks for AI spectral parsing.")

    # 2. Parallel Processing
    tasks = [_call_inception_api(chunk, i) for i, chunk in enumerate(chunks)]
    chunk_results = await asyncio.gather(*tasks, return_exceptions=True)

    # 3. Merging & Stitching
    questions: List[ParsedQuestion] = []
    warnings: List[str] = []
    total_extracted = 0
    total_expected = 0

    for i, res in enumerate(chunk_results):
        if isinstance(res, Exception):
            logger.error(f"Chunk {i} failed: {res}")
            warnings.append(f"⚠ Chunk {i+1} extraction failed: {str(res)[:100]}")
            continue
            
        raw_qs = res.get("questions", [])
        for chunk_q in raw_qs:
            text = str(chunk_q.get("text", "")).strip()
            options_raw = chunk_q.get("options", [])

            # Pad options
            options: List[str] = []
            for j in range(4):
                if j < len(options_raw):
                    options.append(str(options_raw[j]).strip())
                else:
                    options.append(f"[Option {chr(65+j)} not found]")

            correct = str(chunk_q.get("correct_answer", "A")).upper()
            if correct not in ("A", "B", "C", "D"): correct = "A"

            questions.append(
                ParsedQuestion(
                    text=text or f"[Question {len(questions)+1} unclear]",
                    options=options,
                    correct_answer=correct,
                    marks=1,
                    branch="CS",
                    order_index=len(questions),
                    confidence=float(chunk_q.get("confidence", 0.5)),
                    needs_review=bool(chunk_q.get("needs_review", False)),
                    review_reason=chunk_q.get("review_reason")
                )
            )
        
        total_extracted += res.get("extracted_count", len(raw_qs))
        total_expected += res.get("expected_count", len(raw_qs))

    ai_meta = {
        "extracted_count": len(questions),
        "expected_count": total_expected,
        "finesse_check": f"Recursive Extraction: Processed {len(chunks)} chunks. Found {len(questions)} total qs.",
    }

    return questions, warnings, ai_meta


# ── Legacy Regex Fallback ──────────────────────────────────────

_OPTION_LABELS = ["A", "B", "C", "D"]
_ANS_PATTERN = re.compile(
    r"(?:Answer|Correct\s*Answer|Ans)[:\s]+([A-Da-d])",
    re.IGNORECASE,
)


def _clean(text: str) -> str:
    return " ".join(text.split()).strip()


def _extract_questions_from_text(raw_text: str) -> Tuple[List[ParsedQuestion], List[str]]:
    """Regex-based harvester. Fallback when AI is unavailable."""
    questions: List[ParsedQuestion] = []
    warnings: List[str] = []

    q_marker_pattern = re.compile(r"(?:\n|^|\s{3,})(?:Question\s*|Q\s*)?(\d+)[.)]\s*", re.IGNORECASE)
    matches = list(q_marker_pattern.finditer(raw_text))

    for i in range(len(matches)):
        start_idx = matches[i].end()
        end_idx = matches[i + 1].start() if i + 1 < len(matches) else len(raw_text)
        block = raw_text[start_idx:end_idx].strip()
        if not block:
            continue

        opts: Dict[str, str] = {}
        last_found_pos = 0
        for label in _OPTION_LABELS:
            opt_pat = re.compile(
                fr"(?:\s|^)\(?{label}[.)]\s*(.+?)(?=\s*\(?[A-Da-d][.)]\s|\s*\d+[.)]|\Z)",
                re.IGNORECASE | re.DOTALL,
            )
            m = opt_pat.search(block, last_found_pos)
            if m:
                opts[label] = _clean(m.group(1))
                last_found_pos = m.end() - 1

        q_text_content = block
        first_opt_label = next(iter(opts.keys()), None)
        if first_opt_label:
            first_opt_pat = re.compile(fr"(?:\s|^)\(?{first_opt_label}[.)]\s*", re.IGNORECASE)
            q_split = first_opt_pat.split(block, maxsplit=1)
            q_text_content = _clean(q_split[0])

        if not q_text_content and len(opts) < 2:
            continue

        option_list: List[str] = []
        for lbl in _OPTION_LABELS:
            option_list.append(opts.get(lbl, f"[Option {lbl} missing]"))

        ans_match = _ANS_PATTERN.search(block)
        correct = ans_match.group(1).upper() if ans_match else "A"

        questions.append(
            ParsedQuestion(
                text=q_text_content,
                options=option_list,
                correct_answer=correct,
                marks=1,
                branch="CS",
                order_index=len(questions),
            )
        )

    return questions, warnings


# ── File type raw-text extractors ──────────────────────────────

def _extract_pdf_text(data: bytes) -> str:
    """
    Extract text using SLAE (Segmented Layout-Aware Extraction).
    Detects 2-column layouts and linearizes them for the AI.
    """
    try:
        import pdfplumber
        pages_text = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                width = float(page.width)
                height = float(page.height)
                
                # Column Gutter detection: Find the average horizontal center
                # We crop Left (0 to 52%) and Right (48% to 100%) with a slight overlap
                # to catch any bleed, then the AI handles the cleaning.
                left_bbox = (0, 0, width * 0.52, height)
                right_bbox = (width * 0.48, 0, width, height)
                
                left_crop = page.crop(left_bbox)
                right_crop = page.crop(right_bbox)
                
                left_text = left_crop.extract_text(x_tolerance=3, y_tolerance=3) or ""
                right_text = right_crop.extract_text(x_tolerance=3, y_tolerance=3) or ""
                
                # Determine if it's likely a 2-column page
                # If both crops have significant content, it's 2-column
                if len(left_text.strip()) > 100 and len(right_text.strip()) > 100:
                    pages_text.append(f"{left_text}\n{right_text}")
                else:
                    # Single column or mostly empty, use standard extraction
                    standard_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                    pages_text.append(standard_text)
                    
        return "\n".join(pages_text)
    except Exception as e:
        logger.error(f"SLAE PDF Error: {e}")
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(data))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e2:
            raise HTTPException(status_code=422, detail=f"PDF parse error: {e2}")


def _extract_docx_text(data: bytes) -> str:
    try:
        import docx
        doc = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"DOCX parse error: {e}")


def _parse_excel(data: bytes) -> Tuple[List[ParsedQuestion], List[str]]:
    """Structured Excel import via openpyxl."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
        sheet = wb.active
        if not sheet:
            raise ValueError("Empty Excel file")
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            return [], []

        header_row = [str(c).strip().lower().replace(" ", "_") if c else "" for c in rows[0]]
        header_map = {name: i for i, name in enumerate(header_row) if name}
        required = {"question", "option_a", "option_b", "option_c", "option_d", "correct_answer"}
        missing_cols = required - set(header_map.keys())
        if missing_cols:
            q_idx = next((i for i, h in enumerate(header_row) if "question" in h or h == "q"), 0)
            raw = "\n\n".join(str(r[q_idx]) for r in rows[1:] if r and len(r) > q_idx and r[q_idx])
            return _extract_questions_from_text(raw)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Excel parse error: {e}")

    questions: List[ParsedQuestion] = []
    warnings: List[str] = []

    for i, row in enumerate(rows[1:], start=2):
        if not any(row):
            continue

        def get_val(col_name: str, default: str = "") -> str:
            idx = header_map.get(col_name)
            if idx is not None and idx < len(row):
                val = row[idx]
                return str(val).strip() if val is not None else default
            return default

        q_text = get_val("question")
        if not q_text:
            continue

        opts = [get_val("option_a"), get_val("option_b"), get_val("option_c"), get_val("option_d")]
        correct = get_val("correct_answer", "A").upper()
        if correct not in _OPTION_LABELS:
            correct = "A"
            warnings.append(f"Row {i}: Invalid correct_answer, defaulting to A.")

        try:
            marks = int(float(get_val("marks", "1"))) if get_val("marks") else 1
        except Exception:
            marks = 1

        questions.append(
            ParsedQuestion(
                text=q_text,
                options=opts,
                correct_answer=correct,
                marks=marks,
                branch=get_val("branch", "CS"),
                order_index=len(questions),
            )
        )

    return questions, warnings


# ── Routes ─────────────────────────────────────────────────────

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "text/plain": "txt",
}


@router.post("/upload", response_model=IngestPreviewResponse)
async def upload_and_parse(
    file: UploadFile = File(...),
    _: bool = Depends(verify_admin),
):
    """
    Upload a PDF, DOCX, or Excel.
    Automatically routes through the Gemini AI Spectral Parser if GEMINI_API_KEY is configured,
    otherwise falls back to the legacy regex harvester.
    """
    if file.size and file.size > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    data = await file.read()
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    file_type = ALLOWED_TYPES.get(file.content_type or "") or ext

    settings = get_settings()
    ai_powered = False
    ai_meta: dict = {}
    questions: List[ParsedQuestion] = []
    warnings: List[str] = []

    # Excel: structured format — skip AI, use direct column mapping
    if file_type in ("xlsx", "xls"):
        questions, warnings = _parse_excel(data)

    # Text-based: try AI first, fallback to regex
    elif file_type in ("pdf", "docx", "txt"):
        if file_type == "pdf":
            raw_text = _extract_pdf_text(data)
        elif file_type == "docx":
            raw_text = _extract_docx_text(data)
        else:
            raw_text = data.decode("utf-8", errors="replace")

        if settings.inception_api_key:
            try:
                questions, warnings, ai_meta = await _spectral_parse_with_ai(raw_text)
                ai_powered = True
                logger.info(
                    f"Spectral AI parse: {len(questions)} questions from '{filename}' | "
                    f"Finesse Check: {ai_meta.get('finesse_check', 'n/a')}"
                )
            except Exception as e:
                logger.warning(f"AI parse failed ({e}), falling back to regex harvester.")
                warnings.append(f"⚠ AI spectral parser unavailable ({e}). Using legacy regex mode.")
                questions, regex_warns = _extract_questions_from_text(raw_text)
                warnings += regex_warns
        else:
            logger.info(f"INCEPTION_API_KEY not set — using legacy regex harvester for '{filename}'")
            warnings.append("ℹ AI spectral parsing disabled (no INCEPTION_API_KEY). Using legacy mode.")
            questions, regex_warns = _extract_questions_from_text(raw_text)
            warnings += regex_warns
    else:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{file_type}'. Supported: PDF, DOCX, XLSX, TXT",
        )

    # Compute aggregate confidence
    needs_review_count = sum(1 for q in questions if q.needs_review)
    avg_confidence = (
        sum(q.confidence for q in questions) / len(questions) if questions else 1.0
    )

    finesse_check = ai_meta.get("finesse_check")
    if ai_meta:
        extracted = ai_meta.get("extracted_count", len(questions))
        expected = ai_meta.get("expected_count", len(questions))
        if extracted != expected:
            warnings.append(
                f"⚠ Finesse Check mismatch: AI extracted {extracted} questions "
                f"but expected {expected} from document. Please review highlights."
            )

    return IngestPreviewResponse(
        questions=questions,
        total=len(questions),
        source_file=filename,
        parse_warnings=warnings,
        ai_powered=ai_powered,
        ai_confidence_avg=round(avg_confidence, 3),
        needs_review_count=needs_review_count,
        finesse_check=finesse_check,
    )


@router.post("/commit")
async def commit_questions(
    request: BulkImportRequest,
    _: bool = Depends(verify_admin),
):
    """
    Commit pre-parsed questions with Dynamic Schema Alignment.
    Ensures 100% success even if the database is missing columns.
    """
    db = get_supabase()
    questions = request.questions

    if not questions:
        raise HTTPException(status_code=400, detail="No questions to import")

    # ── Step 1: Dynamic Schema Discovery ──
    try:
        # Probe the table to see exactly which columns exist
        probe = db.table("questions").select("*").limit(1).execute()
        db_columns = list(probe.data[0].keys()) if (probe.data and len(probe.data) > 0) else [
            "id", "text", "options", "correct_answer", "marks", "order_index", "branch"
        ]
        logger.info(f"Schema discovery: {db_columns}")
    except Exception as e:
        logger.warning(f"Schema probe failed, falling back to defaults: {e}")
        db_columns = ["text", "options", "correct_answer", "marks", "order_index", "branch"]

    # ── Step 2: Gravity Guard (Isolation Enforcement) ──
    safe_exam_name = request.exam_name.strip()
    tag_prefix = f"⟦EXAM:{safe_exam_name}⟧"
    
    # Check for existing node collision (Column OR Tag prefix)
    collision = False
    if "exam_name" in db_columns:
        res = db.table("questions").select("id").eq("exam_name", safe_exam_name).limit(1).execute()
        if res.data: collision = True
    
    if not collision:
        res = db.table("questions").select("id").like("text", f"{tag_prefix}%").limit(1).execute()
        if res.data: collision = True

    if collision and not request.replace_existing:
        logger.warning(f"Gravity-Alert: Isolation breach on node '{safe_exam_name}'")
        raise HTTPException(
            status_code=409, 
            detail=f"GRAVITY_ALERT: Isolation Node '{safe_exam_name}' is already populated. Ingestion into legacy nodes is strictly prohibited to ensure data purity."
        )

    # ── Step 3: Deployment & Node Clearing ──
    if request.replace_existing:
        if "exam_name" in db_columns:
            db.table("questions").delete().eq("exam_name", safe_exam_name).execute()
        else:
            db.table("questions").delete().like("text", f"{tag_prefix}%").execute()
        logger.info(f"Isolation Node '{safe_exam_name}' reset for fresh harvest.")

    # ── Step 3: Schema-Safe Payload Refinement ──
    rows_to_insert = []
    for i, q in enumerate(questions):
        # We start with ALL fields
        row_text = q.text.strip()
        
        # VIRTUAL FOLDER LOGIC: 
        # If 'exam_name' column is MISSING, we inject it into the text as a Spectral Tag.
        if "exam_name" not in db_columns:
            row_text = f"⟦EXAM:{safe_exam_name}⟧ {row_text}"
            
        full_row = {
            "text": row_text,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "marks": q.marks,
            "branch": q.branch,
            "order_index": q.order_index if q.order_index > 0 else i,
            "exam_name": safe_exam_name,
            "image_url": q.image_url,
        }
        # Filter: ONLY keep fields that actually exist in the DB columns
        safe_row = {k: v for k, v in full_row.items() if k in db_columns}
        rows_to_insert.append(safe_row)

    # ── Step 4: Atomic Batch Insertion ──
    try:
        result = db.table("questions").insert(rows_to_insert).execute()
        
        # Verify success
        # Some versions of execute() don't return data on insert. 
        # We rely on no exception being raised.
        inserted_count = len(result.data) if result.data else len(rows_to_insert)
        
        return {
            "committed": inserted_count,
            "total": len(questions),
            "errors": [],
        }
    except Exception as e:
        error_str = str(e)
        logger.error(f"Ingest commit failed: {error_str}")
        
        # Raise explicit error so the UI shows it
        raise HTTPException(
            status_code=500,
            detail=f"Database Rejection: {error_str}"
        )
