from pydantic import BaseModel
from typing import Optional, Any, List, Dict


# ── Auth ──────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    usn: str
    password: str
    name: Optional[str] = None
    email: Optional[str] = None
    branch: Optional[str] = "CS"


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    student: Optional[Dict[str, Any]] = None
    # Add flattened fields for convenience
    student_id: str
    student_name: Optional[str] = None
    email: Optional[str] = None
    branch: Optional[str] = "CS"
    usn: Optional[str] = None
    exam_start_time: Optional[str] = None
    exam_duration_minutes: int = 60
    exam_title: str = "ExamGuard Assessment"
    total_questions: int = 0


# ── Questions ─────────────────────────────────────────────────

class TestCaseOut(BaseModel):
    input: str = ""
    expected_output: str = ""
    is_hidden: bool = False
    description: Optional[str] = None


class QuestionOut(BaseModel):
    id: str
    text: str
    options: list[str]
    branch: str = "CS"
    order_index: int
    marks: int = 1
    image_url: Optional[str] = None
    audio_url: Optional[str] = None
    category: Optional[str] = "Others"
    question_type: str = "mcq"   # "mcq" | "code"
    starter_code: Optional[str] = None
    test_cases: Optional[List[TestCaseOut]] = None


class QuestionsResponse(BaseModel):
    questions: list[QuestionOut]
    total: int


# ── Admin Question Management ─────────────────────────────────

class AdminQuestionOut(BaseModel):
    id: str
    text: str
    options: list[str]
    branch: str
    correct_answer: str
    marks: int
    order_index: int
    exam_name: Optional[str] = None
    image_url: Optional[str] = None
    audio_url: Optional[str] = None
    category: Optional[str] = "Others"
    question_type: str = "mcq"
    starter_code: Optional[str] = None


class AdminQuestionsResponse(BaseModel):
    questions: list[AdminQuestionOut]
    total: int


class QuestionCreate(BaseModel):
    text: str
    options: list[str]
    branch: str
    correct_answer: str
    marks: int = 1
    order_index: int = 0
    exam_name: Optional[str] = "Initial Assessment"
    image_url: Optional[str] = None
    audio_url: Optional[str] = None
    category: Optional[str] = "Others"
    question_type: str = "mcq"
    starter_code: Optional[str] = None


class QuestionUpdate(BaseModel):
    text: Optional[str] = None
    options: Optional[list[str]] = None
    branch: Optional[str] = None
    correct_answer: Optional[str] = None
    marks: Optional[int] = None
    exam_name: Optional[str] = None
    image_url: Optional[str] = None
    audio_url: Optional[str] = None
    category: Optional[str] = None
    question_type: Optional[str] = None
    starter_code: Optional[str] = None


# ── Code Questions ────────────────────────────────────────────

class TestCaseIn(BaseModel):
    input: str = ""
    expected_output: str = ""
    is_hidden: bool = False
    description: Optional[str] = None


class CodeQuestionCreate(BaseModel):
    question_id: str
    starter_code: str = ""
    language: str = "python"
    test_cases: List[TestCaseIn] = []
    time_limit_ms: int = 10000


class TestResultIn(BaseModel):
    input: str
    expected: str
    actual: str
    passed: bool
    description: Optional[str] = None
    error: Optional[str] = None


class CodeSubmitRequest(BaseModel):
    question_id: str
    code: str
    test_results: List[TestResultIn] = []
    passed_count: int = 0
    total_count: int = 0
    is_final: bool = False


class CodeSubmitResponse(BaseModel):
    saved: bool
    question_id: str
    passed_count: int
    total_count: int


# ── Batch Save Answers ────────────────────────────────────────

class BatchSaveRequest(BaseModel):
    answers: Dict[str, str]   # { question_id: "A"|"B"|"C"|"D"|<code> }


class BatchSaveResponse(BaseModel):
    saved: bool
    count: int


# ── Telemetry Batch ───────────────────────────────────────────

class TelemetryEventIn(BaseModel):
    id: str            # client UUID for dedup
    type: str
    ts: str            # ISO timestamp
    payload: Optional[Dict[str, Any]] = None


class BatchEventsRequest(BaseModel):
    events: List[TelemetryEventIn]


class BatchEventsResponse(BaseModel):
    received: int


# ── Answers ───────────────────────────────────────────────────

class SaveAnswerRequest(BaseModel):
    question_id: str
    selected_option: str


class SaveAnswerResponse(BaseModel):
    saved: bool
    question_id: str


# ── Submit ────────────────────────────────────────────────────

class SubmitExamRequest(BaseModel):
    answers: dict


class SubmitExamResponse(BaseModel):
    submitted: bool
    score: int
    total_marks: int
    correct_count: int
    wrong_count: int
    percentage: float
    submitted_at: str


# ── Start / Session ───────────────────────────────────────────

class StartExamResponse(BaseModel):
    started_at: Optional[str] = None
    status: str = "active"
    started: bool = True
    exam_title: Optional[str] = None


# ── Students ──────────────────────────────────────────────────

class StudentStatus(BaseModel):
    student_id: str
    usn: str
    name: str
    email: Optional[str] = None
    branch: str = "CS"
    status: str
    warnings: int
    last_active: Optional[str] = None
    submitted_at: Optional[str] = None
    started_at: Optional[str] = None
    is_banned: bool = False
    exams_completed: int = 0


class StudentCreate(BaseModel):
    usn: str
    name: str
    email: Optional[str] = None
    branch: str = "CS"
    password: str


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    branch: Optional[str] = None
    password: Optional[str] = None
    is_active_session: Optional[bool] = None


# ── ExamConfig ────────────────────────────────────────────────

class ExamConfig(BaseModel):
    id: Optional[str] = None
    is_active: bool = True
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    duration_minutes: int = 60
    exam_title: str = "ExamGuard Assessment"
    marks_per_question: Optional[int] = None
    negative_marks: Optional[int] = None
    shuffle_questions: Optional[bool] = None
    shuffle_options: Optional[bool] = None
    max_attempts: Optional[int] = None
    show_answers_after: Optional[bool] = None
    total_questions: Optional[int] = None
    total_marks: Optional[int] = None
    category: Optional[str] = "Others"
    exam_description: Optional[str] = None


class ExamConfigUpdate(BaseModel):
    is_active: Optional[bool] = None
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    duration_minutes: Optional[int] = None
    exam_title: Optional[str] = None
    marks_per_question: Optional[int] = None
    negative_marks: Optional[int] = None
    shuffle_questions: Optional[bool] = None
    shuffle_options: Optional[bool] = None
    max_attempts: Optional[int] = None
    show_answers_after: Optional[bool] = None
    total_questions: Optional[int] = None
    total_marks: Optional[int] = None
    category: Optional[str] = None
    exam_description: Optional[str] = None


# ── Violations ────────────────────────────────────────────────

class ReportViolationRequest(BaseModel):
    type: str
    metadata: Optional[dict] = None
    sessionId: Optional[str] = None


class ReportViolationResponse(BaseModel):
    warning_count: int
    auto_submitted: bool
    message: str


# ── Folder Management ─────────────────────────────────────────

class FolderRenameRequest(BaseModel):
    old_name: Optional[str] = None
    new_name: str


class FolderEditBranchRequest(BaseModel):
    exam_name: Optional[str] = None
    old_branch: Optional[str] = None
    new_branch: str


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
    time_taken_seconds: Optional[int] = None
    submitted_at: Optional[str] = None
    exam_name: Optional[str] = None


class LeaderboardResponse(BaseModel):
    entries: List[LeaderboardEntry]
    total: int = 0
    total_submitted: int = 0
    generated_at: str = ""
    updated_at: str = ""


# ── Ingest Models ─────────────────────────────────────────────

class ParsedQuestion(BaseModel):
    text: str
    options: List[str] = []
    correct_answer: str = "A"
    marks: int = 1
    branch: str = "CS"
    order_index: int = 0
    confidence: float = 1.0
    needs_review: bool = False
    review_reason: Optional[str] = None
    image_url: Optional[str] = None
    audio_url: Optional[str] = None
    question_type: str = "mcq"
    starter_code: Optional[str] = None
    category: Optional[str] = "Others"
    test_cases: Optional[List[Dict[str, Any]]] = None


class IngestPreviewResponse(BaseModel):
    questions: List[ParsedQuestion]
    total: int
    source_file: str = ""
    parse_warnings: List[str] = []
    ai_powered: bool = False
    ai_confidence_avg: float = 1.0
    needs_review_count: int = 0
    finesse_check: Optional[str] = None
    # legacy aliases
    extracted_count: int = 0
    expected_count: int = 0
    warnings: List[str] = []


class BulkImportRequest(BaseModel):
    questions: List[ParsedQuestion]
    exam_name: str = "Initial Assessment"
    replace_existing: bool = False
    max_questions: Optional[int] = None
    branch: str = "CS"
    marks_per_question: int = 1
    category: Optional[str] = "Others"
    duration_minutes: Optional[int] = 20
    enable_schedule: Optional[bool] = False
    schedule_start_date: Optional[str] = None
    schedule_start_time: Optional[str] = None
    schedule_end_date: Optional[str] = None
    schedule_end_time: Optional[str] = None

# ── Support / SOS ─────────────────────────────────────────────
class SupportRequestCreate(BaseModel):
    usn_or_email: str
    description: str

class SupportRequestOut(BaseModel):
    id: str
    usn_or_email: str
    description: str
    status: str = "pending"
    created_at: str


# ── Detailed Stats / Analytics ────────────────────────────────

class StudentExamHistory(BaseModel):
    exam_title: str
    score: int
    total_marks: int
    percentage: float
    submitted_at: str
    category: str = "Others"

class StudentDetailedStats(BaseModel):
    student_id: str
    usn: str
    name: str
    email: Optional[str] = None
    branch: str
    exams_completed: int
    average_percentage: float
    last_exam_at: Optional[str] = None
    history: List[StudentExamHistory] = []

# ── PyHunt ────────────────────────────────────────────────────

class PyHuntProgressUpdate(BaseModel):
    current_round: str
    turtle_image: Optional[str] = None
    finished: bool = False
    terminated: bool = False
    warning_count: Optional[int] = None
    last_violation: Optional[str] = None



