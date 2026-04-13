"""
Ingest Router — Autonomous Question Harvester
Supports PDF, DOCX, and Excel file uploads. Extracts MCQ questions
using pattern recognition and returns a preview for admin approval.
"""

from __future__ import annotations

import io
import re
import logging
import uuid
import secrets
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

logger = logging.getLogger("examguard.ingest")

router = APIRouter(prefix="/admin/ingest", tags=["ingest"])

# ── Regex helpers ─────────────────────────────────────────────

# Matches: "Q1. What is...?" or "1. What is...?" or "Q1) What is..."
_Q_PATTERN = re.compile(
    r"(?:Q\s*\d+[.)]\s*|^\d+[.)]\s*)(.+?)(?=\n[A-Da-d][.)]\s|$)",
    re.MULTILINE | re.DOTALL,
)
# Matches: "A) option text" or "A. option text" or "(A) option text"
# Now supports same-line options (e.g. A. Yes B. No)
_OPT_PATTERN = re.compile(
    r"\s*\(?([A-Da-d])[.)]\s*(.+?)(?=\s*\(?[A-Da-d][.)]\s|\s*(?:Question|Q)?\s*\d|\Z)",
    re.IGNORECASE | re.DOTALL,
)
# Matches: "Answer: B" or "Correct: C" or "Ans: A"
_ANS_PATTERN = re.compile(
    r"(?:Answer|Correct\s*Answer|Ans)[:\s]+([A-Da-d])",
    re.IGNORECASE,
)

_OPTION_LABELS = ["A", "B", "C", "D"]


def _clean(text: str) -> str:
    return " ".join(text.split()).strip()


def _upload_asset(img_data: bytes, ext: str = "png") -> Optional[str]:
    """Uploads extracted PDF image to Supabase Storage and returns public URL."""
    try:
        db = get_supabase()
        filename = f"{uuid.uuid4()}.{ext}"
        bucket = "question-assets"
        
        # Upload to supabase storage
        result = db.storage.from_(bucket).upload(filename, img_data)
        if result:
            # Get public URL
            url_res = db.storage.from_(bucket).get_public_url(filename)
            return url_res
    except Exception as e:
        logger.error(f"Asset Upload Failed: {e}")
    return None

def _extract_questions_from_pdf(data: bytes) -> Tuple[List[ParsedQuestion], List[str]]:
    """
    Advanced layout-aware PDF harvester. Extracts text and images,
    mapping logos specifically to their nearest questions.
    """
    import pdfplumber
    from PIL import Image
    
    questions: List[ParsedQuestion] = []
    warnings: List[str] = []
    
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            # 1. Extract Images first for mapping
            page_images = []
            for img in page.images:
                try:
                    # Crop image from page
                    bbox = (img["x0"], img["top"], img["x1"], img["bottom"])
                    crop = page.within_bbox(bbox).to_image(resolution=150).original
                    
                    img_byte_arr = io.BytesIO()
                    crop.save(img_byte_arr, format='PNG')
                    img_url = _upload_asset(img_byte_arr.getvalue())
                    if img_url:
                        page_images.append({"url": img_url, "top": img["top"]})
                except:
                    continue

            # 2. Extract Text with layout preservation
            # We use horizontal clustering to handle multi-column layouts better
            raw_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
            if not raw_text: continue

            # Save for forensics
            with open(f"debug_page_{page_idx}.txt", "w", encoding="utf-8") as f:
                f.write(raw_text)

            # 3. Harvest Questions from this page
            # Use universal marker pattern
            q_marker_pattern = re.compile(r"(?:\n|^|\s{3,})(?:Question\s*|Q\s*)?(\d+)[.)]\s*", re.IGNORECASE)
            matches = list(q_marker_pattern.finditer(raw_text))
            
            for i in range(len(matches)):
                marker_pos = matches[i].start()
                # Find corresponding Y-coord if possible, or just use sequence
                # For now, we map images based on sequence on page
                
                start_idx = matches[i].end()
                end_idx = matches[i+1].start() if i + 1 < len(matches) else len(raw_text)
                
                block = raw_text[start_idx:end_idx].strip()
                if not block: continue

                # Sequential Option Validation (resolves "c) Raghuram Rajan" bug)
                opts: Dict[str, str] = {}
                last_found_pos = 0
                for label in _OPTION_LABELS:
                    # We use a non-greedy, anchored pattern that requires preceding space/start
                    opt_pat = re.compile(fr"(?:\s|^)\(?{label}[.)]\s*(.+?)(?=\s*\(?[A-Da-d][.)]\s|\s*(?:Question|Q)?\s*\d|\Z)", re.IGNORECASE | re.DOTALL)
                    m = opt_pat.search(block, last_found_pos)
                    if m:
                        opts[label] = _clean(m.group(1))
                        last_found_pos = m.end() - 1 

                # Determine pure question text
                q_text_content = block
                first_opt_label = next(iter(opts.keys()), None)
                if first_opt_label:
                    first_opt_pat = re.compile(fr"(?:\s|^)\(?{first_opt_label}[.)]\s*", re.IGNORECASE)
                    q_split = first_opt_pat.split(block, maxsplit=1)
                    q_text_content = _clean(q_split[0])

                if not q_text_content and len(opts) < 2: continue

                # Match nearest image (if image appeared before this question on the page)
                # This is a heuristic: take images between previous question and this one
                q_img_url = None
                if page_images:
                    # Filter images belonging to this question (rough estimate)
                    # For simplicity: if it's the first question on page, take all top images
                    # Otherwise take images between markers
                    q_img_url = page_images[0]["url"] if i == 0 else None

                option_list: List[str] = []
                for lbl in _OPTION_LABELS:
                    option_list.append(opts.get(lbl, f"[Option {lbl} omitted]"))

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
                        image_url=q_img_url
                    )
                )

    return questions, warnings

def _extract_questions_from_text(raw_text: str) -> Tuple[List[ParsedQuestion], List[str]]:
    """Fallback text harvester for plain text/docx."""
    questions: List[ParsedQuestion] = []
    warnings: List[str] = []
    
    q_marker_pattern = re.compile(r"(?:\n|^|\s{3,})(?:Question\s*|Q\s*)?(\d+)[.)]\s*", re.IGNORECASE)
    matches = list(q_marker_pattern.finditer(raw_text))
    
    for i in range(len(matches)):
        start_idx = matches[i].end()
        end_idx = matches[i+1].start() if i + 1 < len(matches) else len(raw_text)
        block = raw_text[start_idx:end_idx].strip()
        if not block: continue

        opts: Dict[str, str] = {}
        last_found_pos = 0
        for label in _OPTION_LABELS:
            opt_pat = re.compile(fr"(?:\s|^)\(?{label}[.)]\s*(.+?)(?=\s*\(?[A-Da-d][.)]\s|\s*\d+[.)]|\Z)", re.IGNORECASE | re.DOTALL)
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

        if not q_text_content and len(opts) < 2: continue
        
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
                image_url=None
            )
        )
    return questions, warnings


# ── File type parsers ─────────────────────────────────────────

def _parse_pdf(data: bytes) -> str:
    """Fallback text-only parse if needed, but usually we use _extract_questions_from_pdf."""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as e:
        # Fallback to PyPDF2 if pdfplumber fails (layout issue)
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(data))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except:
            raise HTTPException(status_code=422, detail=f"PDF parse error: {e}")


def _parse_docx(data: bytes) -> str:
    try:
        import docx  # type: ignore  (python-docx)
        doc = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"DOCX parse error: {e}")


def _parse_excel(data: bytes) -> Tuple[List[ParsedQuestion], List[str]]:
    """
    Structured Excel import using openpyxl (removing pandas dependency).
    Expected header names: question, option_a, option_b, option_c, option_d,
                          correct_answer, marks (optional), branch (optional)
    """
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
        sheet = wb.active
        if not sheet:
            raise ValueError("Empty Excel file")

        # Get rows as list of lists
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            return [], []

        # Process headers
        header_row = [str(c).strip().lower().replace(" ", "_") if c else "" for c in rows[0]]
        header_map = {name: i for i, name in enumerate(header_row) if name}

        required = {"question", "option_a", "option_b", "option_c", "option_d", "correct_answer"}
        missing_cols = required - set(header_map.keys())

        if missing_cols:
            # Fallback: find any col with "question" or just use first col if it's questions
            q_idx = next((i for i, h in enumerate(header_row) if "question" in h or h == "q"), 0)
            raw = "\n\n".join(str(r[q_idx]) for r in rows[1:] if r and len(r) > q_idx and r[q_idx])
            return _extract_questions_from_text(raw)

    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Excel parse error: {e}")

    questions: List[ParsedQuestion] = []
    warnings: List[str] = []

    for i, row in enumerate(rows[1:], start=2):
        if not any(row): continue
        
        def get_val(col_name: str, default: str = "") -> str:
            idx = header_map.get(col_name)
            if idx is not None and idx < len(row):
                val = row[idx]
                return str(val).strip() if val is not None else default
            return default

        q_text = get_val("question")
        if not q_text:
            continue

        opts = [
            get_val("option_a"),
            get_val("option_b"),
            get_val("option_c"),
            get_val("option_d"),
        ]
        correct = get_val("correct_answer", "A").upper()
        if correct not in _OPTION_LABELS:
            correct = "A"
            warnings.append(f"Row {i}: Invalid correct_answer '{correct}', defaulting to A.")

        try:
            marks_raw = get_val("marks", "1")
            marks = int(float(marks_raw)) if marks_raw else 1
        except:
            marks = 1

        branch = get_val("branch", "CS")

        questions.append(
            ParsedQuestion(
                text=q_text,
                options=opts,
                correct_answer=correct,
                marks=marks,
                branch=branch,
                order_index=len(questions),
            )
        )

    return questions, warnings


# ── Routes ────────────────────────────────────────────────────

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
    Upload a PDF, DOCX, or Excel file. Returns a structured preview of
    extracted questions for admin review before committing to the database.
    """
    if file.size and file.size > 20 * 1024 * 1024:  # 20 MB guard
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    data = await file.read()
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content_type = file.content_type or ""

    file_type = ALLOWED_TYPES.get(content_type) or ext

    questions: List[ParsedQuestion] = []
    warnings: List[str] = []

    if file_type == "pdf":
        questions, warnings = _extract_questions_from_pdf(data)
    elif file_type == "docx":
        raw_text = _parse_docx(data)
        questions, warnings = _extract_questions_from_text(raw_text)
    elif file_type in ("xlsx", "xls"):
        questions, warnings = _parse_excel(data)
    elif file_type == "txt":
        raw_text = data.decode("utf-8", errors="replace")
        questions, warnings = _extract_questions_from_text(raw_text)
    else:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{file_type}'. Supported: PDF, DOCX, XLSX, TXT",
        )

    logger.info(f"Ingest: parsed {len(questions)} questions from '{filename}' ({len(warnings)} warnings)")

    return IngestPreviewResponse(
        questions=questions,
        total=len(questions),
        source_file=filename,
        parse_warnings=warnings,
    )


@router.post("/commit")
async def commit_questions(
    request: BulkImportRequest,
    _: bool = Depends(verify_admin),
):
    """
    Commit pre-parsed questions to the database.
    If replace_existing=True, deletes existing questions for affected branches first.
    """
    db = get_supabase()
    questions = request.questions

    if not questions:
        raise HTTPException(status_code=400, detail="No questions to import")

    if request.replace_existing:
        branches = list({q.branch for q in questions})
        for branch in branches:
            db.table("questions").delete().eq("branch", branch).execute()
        logger.info(f"Ingest commit: cleared questions for branches {branches}")

    inserted = 0
    errors: list[str] = []
    for q in questions:
        try:
            db.table("questions").insert(q.model_dump()).execute()
            inserted += 1
        except Exception as e:
            errors.append(str(e))

    logger.info(f"Ingest commit: inserted {inserted}/{len(questions)} questions")

    return {
        "committed": inserted,
        "total": len(questions),
        "errors": errors,
    }
