/**
 * Centralized API utility for the Exam Portal.
 * Uses relative paths (/api) to ensure seamless operation on Vercel.
 */

// SSR Polyfills to prevent build-time ReferenceErrors
if (typeof window === "undefined") {
  (global as any).sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
  (global as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
}

export const API_BASE = "/api";
export const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "rudranshsarvam";

// --- Types ---

export interface ExamConfig {
  id: string;
  exam_title: string;
  duration_minutes: number;
  is_active: boolean;
  scheduled_start: string | null;
  scheduled_end?: string | null;
  total_questions?: number;
  total_marks?: number;
  schedule_start_date?: string;
  schedule_start_time?: string;
  enable_schedule?: boolean;
  schedule_end_date?: string;
  schedule_end_time?: string;
  enable_end_schedule?: boolean;
}

export interface TestCase {
  input: string;
  expected_output: string;
  is_hidden: boolean;
  description?: string;
}

export interface TestResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  description?: string | null;
  error?: string | null;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  image_url?: string;
  audio_url?: string;
  marks?: number;
  question_type?: "mcq" | "code";
  starter_code?: string;
  test_cases?: TestCase[];
}

export interface AdminQuestion extends Question {
  branch: string;
  correct_answer: string;
  order_index: number;
  exam_name?: string;
}

export interface AdminStudent {
  student_id: string;
  name: string;
  email: string | null;
  usn: string;
  branch: string;
  status: "not_started" | "active" | "submitted";
  warnings: number;
  last_active: string | null;
  submitted_at: string | null;
  password?: string;
}

export interface BranchExamSummary {
  branch: string;
  exam_name: string;
  question_count: number;
}

export interface SubmitResponse {
  score: number;
  total_marks: number;
  correct_count: number;
  wrong_count: number;
}

export interface LoginResponse {
  access_token: string;
  student_id: string;
  student_name: string;
  exam_start_time: string | null;
  exam_title: string;
  total_questions: number;
}

export interface ViolationResponse {
  warning_count: number;
  auto_submitted: boolean;
  message: string;
}

// --- Telemetry Event ---
export interface TelemetryEvent {
  id: string;          // client-generated UUID for dedup
  type: string;        // tab_switch | window_blur | copy_attempt | etc.
  ts: string;          // ISO timestamp
  payload?: Record<string, unknown>;
}

// --- Helpers ---

function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("exam_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text)?.detail ?? text; } catch {}
    throw Object.assign(new Error(detail), { status: res.status });
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    "x-admin-secret": ADMIN_SECRET,
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text)?.detail ?? text; } catch {}
    throw Object.assign(new Error(detail), { status: res.status });
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

// --- API functions ---

export async function loginStudent(
  usn: string,
  password: string
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ usn, password }),
  });
}

export async function fetchQuestions(title: string): Promise<Question[]> {
  const data = await apiFetch<{ questions: Question[]; total: number }>(
    `/exam/questions?title=${encodeURIComponent(title)}`
  );
  return data.questions;
}

export async function saveAnswer(
  questionId: string,
  selectedOption: string
): Promise<void> {
  await apiFetch("/exam/save-answer", {
    method: "POST",
    body: JSON.stringify({ question_id: questionId, selected_option: selectedOption }),
  });
}

/**
 * Batch save multiple answers at once (IndexedDB-backed autosave)
 */
export async function batchSaveAnswers(
  answers: Record<string, string>
): Promise<void> {
  await apiFetch("/exam/batch-save", {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

/**
 * Submit Pyodide code execution result for a question.
 */
export async function submitCodeAnswer(
  questionId: string,
  code: string,
  testResults: TestResult[],
  passedCount: number,
  totalCount: number,
  isFinal = false
): Promise<void> {
  await apiFetch("/exam/submit-code", {
    method: "POST",
    body: JSON.stringify({
      question_id: questionId,
      code,
      test_results: testResults,
      passed_count: passedCount,
      total_count: totalCount,
      is_final: isFinal,
    }),
  });
}

/**
 * Flush batched telemetry events to server (every 30s or on threshold)
 */
export async function flushTelemetryBatch(events: TelemetryEvent[]): Promise<void> {
  if (events.length === 0) return;
  await apiFetch("/exam/batch-events", {
    method: "POST",
    body: JSON.stringify({ events }),
  });
}

export async function submitExam(
  answers: Record<string, string>,
  examTitle: string
): Promise<SubmitResponse> {
  return apiFetch<SubmitResponse>("/exam/submit-exam", {
    method: "POST",
    body: JSON.stringify({ answers: { ...answers, __exam_title: examTitle } }),
  });
}

export async function reportViolation(
  type: string,
  metadata?: Record<string, unknown>
): Promise<ViolationResponse> {
  return apiFetch<ViolationResponse>("/exam/report-violation", {
    method: "POST",
    body: JSON.stringify({ type, metadata }),
  });
}

export async function fetchPublicExamConfig(): Promise<ExamConfig[]> {
  const data = await fetch(`${API_BASE}/exam/config`);
  if (!data.ok) return [];
  const json = await data.json();
  return Array.isArray(json) ? json : (json.configs || []);
}

export async function fetchExamConfig(): Promise<ExamConfig[]> {
  return adminFetch<ExamConfig[]>("/admin/exam-config");
}

export async function updateExamConfig(
  id: string,
  updates: Partial<ExamConfig>
): Promise<ExamConfig> {
  return adminFetch<ExamConfig>(`/admin/exam-config/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function fetchAdminQuestions(): Promise<{ questions: AdminQuestion[]; total: number }> {
  return adminFetch("/admin/questions");
}

export async function fetchAdminStudents(): Promise<AdminStudent[]> {
  return adminFetch("/admin/students");
}
