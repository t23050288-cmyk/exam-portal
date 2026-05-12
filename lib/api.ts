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
  category?: string;
  max_attempts?: number;
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
  category?: string;
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
  id?: string;
  score: number;
  total_marks: number;
  correct_count: number;
  wrong_count: number;
}

export interface LoginResponse {
  access_token: string;
  student_id: string;
  student_name: string;
  email?: string;
  branch?: string;
  exam_start_time: string | null;
  exam_duration_minutes?: number;
  exam_title: string;
  total_questions: number;
}


export interface StudentExamHistory {
  exam_title: string;
  score: number;
  total_marks: number;
  percentage: number;
  submitted_at: string;
  category: string;
}

export interface StudentDetailedStats {
  student_id: string;
  usn: string;
  name: string;
  email: string | null;
  branch: string;
  exams_completed: number;
  average_percentage: number;
  last_exam_at: string | null;
  history: StudentExamHistory[];
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

export interface SupportRequest {
  id: string;
  usn_or_email: string;
  description: string;
  status: "pending" | "resolved";
  created_at: string;
}


// --- Helpers ---

function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("exam_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || "GET";
  // Cache busting: append timestamp to ensure fresh data every time
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_BASE}${path}${sep}t=${Date.now()}`;
  
  // Production-style logging to match user preference
  console.log(`[API] Fetching: ${method} ${url}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      let detail = text;
      try { 
        const parsed = JSON.parse(text);
        detail = parsed.detail || parsed.message || text;
      } catch {}
      console.error(`[API] Error ${res.status}:`, detail);
      throw Object.assign(new Error(detail), { status: res.status });
    }

    const text = await res.text();
    if (!text) return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch (e) {
      console.error("[API] Malformed JSON response:", text);
      throw new Error("Invalid server response format");
    }
  } catch (err: any) {
    if (err.status) throw err;
    console.error("[API] Network error:", err.message);
    throw err;
  }
}

export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || "GET";
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_BASE}${path}${sep}t=${Date.now()}`;
  
  console.log(`[API-ADMIN] Fetching: ${method} ${url}`);

  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    "x-admin-secret": ADMIN_SECRET,
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      let detail = text;
      try { 
        const parsed = JSON.parse(text);
        detail = parsed.detail || parsed.message || text;
      } catch {}
      console.error(`[API-ADMIN] Error ${res.status}:`, detail);
      throw Object.assign(new Error(detail), { status: res.status });
    }

    const text = await res.text();
    if (!text) return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch (e) {
      console.error("[API-ADMIN] Malformed JSON response:", text);
      throw new Error("Invalid server response format");
    }
  } catch (err: any) {
    if (err.status) throw err;
    console.error("[API-ADMIN] Network error:", err.message);
    throw err;
  }
}

// --- API functions ---

export async function loginStudent(
  usn: string,
  password: string,
  extra?: { name?: string; email?: string; branch?: string }
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ usn, password, ...extra }),
  });
}

export async function fetchQuestions(title: string, _cacheBust?: number): Promise<any> {
  const bust = _cacheBust || Date.now();
  // We return the whole object now so the UI can use .questions and .available_exams
  return apiFetch<any>(
    `/exam/questions?title=${encodeURIComponent(title)}&_t=${bust}`,
    { cache: "no-store" } as any
  );
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
  // Use unique timestamp to bypass mobile/CDN caching entirely
  const data = await fetch(`${API_BASE}/admin/exam/config/public?t=${Date.now()}`, { 
    cache: "no-store",
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate" }
  });
  if (!data.ok) return [];
  const json = await data.json();
  return Array.isArray(json) ? json : (json.configs || []);
}

export async function fetchExamConfig(title?: string): Promise<ExamConfig> {
  if (title) {
    const raw = await adminFetch<ExamConfig | ExamConfig[]>(`/admin/exam-config?title=${encodeURIComponent(title)}`);
    if (Array.isArray(raw)) return (raw.find((e) => e.exam_title === title) || raw[0] || {}) as ExamConfig;
    return raw as ExamConfig;
  }
  const raw = await adminFetch<ExamConfig | ExamConfig[]>("/admin/exam-config");
  if (Array.isArray(raw)) return (raw[0] || {}) as ExamConfig;
  return raw as ExamConfig;
}

export async function updateExamConfig(
  idOrUpdates: string | Partial<ExamConfig>,
  updates?: Partial<ExamConfig>
): Promise<ExamConfig> {
  if (typeof idOrUpdates === "string") {
    // Update by ID — use PATCH on the specific config
    return adminFetch<ExamConfig>(`/admin/exam-config/${idOrUpdates}`, {
      method: "PATCH",
      body: JSON.stringify(updates || {}),
    });
  } else {
    // Upsert by exam_title — Python backend uses POST
    return adminFetch<ExamConfig>("/admin/exam-config", {
      method: "POST",
      body: JSON.stringify(idOrUpdates),
    });
  }
}

export async function fetchAdminQuestions(): Promise<{ questions: AdminQuestion[]; total: number }> {
  return adminFetch("/admin/questions");
}

export async function fetchAdminStudents(): Promise<AdminStudent[]> {
  return adminFetch("/admin/students");
}

// ── Admin CRUD stubs (wired to backend) ────────────────────────────────────

export async function createAdminQuestion(q: Partial<AdminQuestion>): Promise<AdminQuestion> {
  return adminFetch<AdminQuestion>("/admin/questions", { method: "POST", body: JSON.stringify(q) });
}

export async function updateAdminQuestion(id: string, q: Partial<AdminQuestion>): Promise<AdminQuestion> {
  return adminFetch<AdminQuestion>(`/admin/questions/${id}`, { method: "PATCH", body: JSON.stringify(q) });
}

export async function deleteAdminQuestion(id: string): Promise<void> {
  return adminFetch<void>(`/admin/questions/${id}`, { method: "DELETE" });
}

export async function createAdminStudent(s: Partial<AdminStudent>): Promise<AdminStudent> {
  return adminFetch<AdminStudent>("/admin/students", { method: "POST", body: JSON.stringify(s) });
}

export async function updateAdminStudent(id: string, s: Partial<AdminStudent>): Promise<AdminStudent> {
  return adminFetch<AdminStudent>(`/admin/students/${id}`, { method: "PATCH", body: JSON.stringify(s) });
}

export async function deleteAdminStudent(id: string): Promise<void> {
  return adminFetch<void>(`/admin/students/${id}`, { method: "DELETE" });
}

export async function resetAdminStudent(id: string): Promise<void> {
  return adminFetch<void>(`/admin/students/${id}/reset`, { method: "POST" });
}

export async function forceSubmitAdminStudent(id: string): Promise<void> {
  return adminFetch<void>(`/admin/students/${id}/force-submit`, { method: "POST" });
}

export async function cleanupStaleSessions(): Promise<{ cleaned: number; count: number }> {
  const res = await adminFetch<{ cleaned?: number; count?: number; message?: string }>("/admin/students/cleanup-stale", { method: "POST" });
  const n = res.cleaned ?? res.count ?? 0;
  return { cleaned: n, count: n };
}


export async function fetchStudentDetailedStats(branch = "all", category = "all"): Promise<StudentDetailedStats[]> {
  return adminFetch<StudentDetailedStats[]>(`/admin/student-detailed-stats?branch=${encodeURIComponent(branch)}&category=${encodeURIComponent(category)}`);
}


export async function exportResults(branch?: string): Promise<Blob> {
  const url = branch ? `/admin/export?branch=${encodeURIComponent(branch)}` : "/admin/export";
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { "X-Admin-Secret": ADMIN_SECRET },
  });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
}

export async function deleteAdminFolder(folderName: string): Promise<void> {
  return adminFetch<void>(`/admin/folders/${encodeURIComponent(folderName)}`, { method: "DELETE" });
}

export async function renameAdminFolder(oldName: string, newName: string): Promise<void> {
  return adminFetch<void>(`/admin/folders/${encodeURIComponent(oldName)}`, { 
    method: "PATCH", 
    body: JSON.stringify({ old_name: oldName, new_name: newName }) 
  });
}

export async function editAdminFolderBranch(folderName: string, branches: string | string[]): Promise<void> {
  const newBranch = Array.isArray(branches) ? `,${branches.join(",")},` : branches;
  return adminFetch<void>(`/admin/folders/${encodeURIComponent(folderName)}/branch`, { 
    method: "PATCH", 
    body: JSON.stringify({ 
      exam_name: folderName,
      old_branch: "", // Redundant but required by current schema
      new_branch: newBranch 
    }) 
  });
}

export async function uploadQuestionImage(file: File, questionId?: string): Promise<{ url: string; public_id?: string; image_url?: string }> {
  // Step 1: Get signed upload params from our backend
  const signRes = await fetch(`${API_BASE}/admin/sign-upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": ADMIN_SECRET,
    },
    body: JSON.stringify({}),
  });

  if (!signRes.ok) {
    // Fallback: try direct server upload (for small files < 4.5MB)
    const fd = new FormData();
    fd.append("file", file);
    if (questionId) fd.append("question_id", questionId);
    const res = await fetch(`${API_BASE}/admin/questions/upload`, {
      method: "POST",
      headers: { "X-Admin-Secret": ADMIN_SECRET },
      body: fd,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "Upload failed");
      throw new Error(errText);
    }
    return res.json();
  }

  const signData = await signRes.json();

  // Step 2: Upload directly from browser to Cloudinary (no body size limit)
  const cloudForm = new FormData();
  cloudForm.append("file", file);
  cloudForm.append("api_key", signData.api_key);
  cloudForm.append("timestamp", String(signData.timestamp));
  cloudForm.append("signature", signData.signature);
  cloudForm.append("folder", signData.folder);

  const uploadRes = await fetch(signData.upload_url, {
    method: "POST",
    body: cloudForm,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "Cloudinary upload failed");
    throw new Error(`Upload failed: ${errText}`);
  }

  const result = await uploadRes.json();
  if (!result.secure_url) {
    throw new Error(`Cloudinary error: ${result.error?.message || JSON.stringify(result)}`);
  }

  return {
    url: result.secure_url,
    image_url: result.secure_url,
    public_id: result.public_id,
  };
}

export async function fetchBranchExamSummary(): Promise<BranchExamSummary[]> {
  return adminFetch<BranchExamSummary[]>("/admin/branch-summary");
}

export async function startExam(examTitle: string): Promise<{ started_at: string; status: string }> {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("exam_token") || "" : "";
  const res = await fetch(`${API_BASE}/exam/start-exam?title=${encodeURIComponent(examTitle)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to start exam");
  }
  const data = await res.json();
  return { started_at: data.started_at || new Date().toISOString(), status: data.status || "active" };
}

export async function deleteAllLeaderboard(): Promise<void> {
  return adminFetch<void>("/admin/leaderboard/all", { method: "DELETE" });
}

export async function submitSupportRequest(usn_or_email: string, description: string): Promise<{ status: string; id: string }> {
  return apiFetch<{ status: string; id: string }>("/support/request", {
    method: "POST",
    body: JSON.stringify({ usn_or_email: usn_or_email, description }),
  });
}

export async function fetchSupportRequests(): Promise<SupportRequest[]> {
  return adminFetch<SupportRequest[]>("/support/list");
}

export async function resolveSupportRequest(requestId: string): Promise<void> {
  await adminFetch(`/support/resolve/${requestId}`, { method: "POST" });
}

export async function clearAllSupportRequests(): Promise<void> {
  await adminFetch("/support/clear-all", { method: "DELETE" });
}


