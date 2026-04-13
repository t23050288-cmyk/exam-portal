from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    usn: str
    password: str
    name: Optional[str] = None
    email: Optional[str] = None
    branch: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    student_id: str
    student_name: str
    email: Optional[str] = None
    branch: str = "CS"
    exam_start_time: Optional[str]     # ISO timestamp (when this student started)
    exam_duration_minutes: int


# ── Questions ─────────────────────────────────────────────────
class QuestionOut(BaseModel):
    id: str
    text: str
    options: list[str]
    branch: str = "CS"
    order_index: int
    marks: int
    exam_name: str = "Initial Assessment"
    image_url: Optional[str] = None



class QuestionsResponse(BaseModel):
    questions: list[QuestionOut]
    total: int


# ── Answers ───────────────────────────────────────────────────
class SaveAnswerRequest(BaseModel):
    question_id: str
    selected_option: str   # "A", "B", "C", or "D"


class SaveAnswerResponse(BaseModel):
    saved: bool
    question_id: str


# ── Submit ────────────────────────────────────────────────────
class SubmitExamRequest(BaseModel):
    answers: Dict[str, str]   # { "question_id": "A", ... }


class SubmitExamResponse(BaseModel):
    submitted: bool
    score: int
    total_marks: int
    percentage: float
    submitted_at: str


# ── Violations ────────────────────────────────────────────────
class ReportViolationRequest(BaseModel):
    type: str    # tab_switch | window_blur | fullscreen_exit | etc.
    metadata: Optional[Dict[str, Any]] = {}


class ReportViolationResponse(BaseModel):
    warning_count: int
    auto_submitted: bool
    message: str


# ── Admin ─────────────────────────────────────────────────────
# ── Admin Management ──────────────────────────────────────────
class AdminQuestionOut(BaseModel):
    id: str
    text: str
    options: list[str]
    branch: str = "CS"
    correct_answer: str
    marks: int
    order_index: int
    exam_name: str = "Initial Assessment"
    image_url: Optional[str] = None


class AdminQuestionsResponse(BaseModel):
    questions: list[AdminQuestionOut]
    total: int

class QuestionCreate(BaseModel):
    text: str
    options: list[str]
    branch: str
    correct_answer: str
    marks: int = 1
    order_index: int
    exam_name: str = "Initial Assessment"
    image_url: Optional[str] = None


class QuestionUpdate(BaseModel):
    text: Optional[str] = None
    options: Optional[list[str]] = None
    branch: Optional[str] = None
    correct_answer: Optional[str] = None
    marks: Optional[int] = None
    order_index: Optional[int] = None
    exam_name: Optional[str] = None
    image_url: Optional[str] = None


class StudentCreate(BaseModel):
    usn: str
    name: str
    email: Optional[str] = None
    branch: str
    password: str  # Plain text, will be hashed in backend

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    branch: Optional[str] = None
    password: Optional[str] = None
    is_active_session: Optional[bool] = None

class StudentStatus(BaseModel):
    student_id: str
    usn: str
    name: str
    email: Optional[str] = None
    branch: str = "CS"
    status: str
    warnings: int
    last_active: Optional[str]
    submitted_at: Optional[str]


# ── Exam Config ───────────────────────────────────────────────
class ExamConfig(BaseModel):
    is_active: bool = True
    scheduled_start: Optional[str] = None   # ISO timestamp or None
    duration_minutes: int = 60
    exam_title: Optional[str] = "ExamGuard Assessment"


class ExamConfigUpdate(BaseModel):
    is_active: Optional[bool] = None
    scheduled_start: Optional[str] = None
    duration_minutes: Optional[int] = None
    exam_title: Optional[str] = None


# ── Leaderboard ───────────────────────────────────────────────
class LeaderboardEntry(BaseModel):
    rank: int
    student_id: str
    usn: str
    name: str
    branch: str
    score: int
    total_marks: int
    percentage: float
    time_taken_seconds: Optional[int]   # None if not submitted
    submitted_at: Optional[str]


class LeaderboardResponse(BaseModel):
    entries: List[LeaderboardEntry]
    total_submitted: int
    updated_at: str


# ── File Ingestion ────────────────────────────────────────────
class ParsedQuestion(BaseModel):
    text: str
    options: List[str]          # exactly 4
    correct_answer: str         # "A" | "B" | "C" | "D"
    marks: int = 1
    branch: str = "CS"
    order_index: int = 0
    exam_name: str = "Initial Assessment"
    image_url: Optional[str] = None



class IngestPreviewResponse(BaseModel):
    questions: List[ParsedQuestion]
    total: int
    source_file: str
    parse_warnings: List[str]


class BulkImportRequest(BaseModel):
    questions: List[QuestionCreate]
    replace_existing: bool = False  # if True wipe branch questions first
