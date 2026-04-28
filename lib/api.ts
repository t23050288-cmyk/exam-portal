const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("exam_token");
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const isPreview = typeof window !== "undefined" && sessionStorage.getItem("exam_preview") === "true";
  const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin@examguard2024";

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(isPreview ? { "X-Admin-Secret": ADMIN_SECRET } : {}),
    ...options.headers,
  };

  const url = `${API_BASE}${path}`;
  if (!token && !path.includes("/auth/login")) {
    console.warn(`[API] Warning: Fetching ${url} without token.`);
  }

  console.log(`[API] Fetching: ${options.method || 'GET'} ${url}`);

  try {
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      console.error(`[API] 401 Unauthorized for ${url}. Clearing session.`);
      sessionStorage.removeItem("exam_token");
      sessionStorage.removeItem("exam_student");
      // Use window.location for hard redirect to clear state
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Request failed" }));
      console.error(`[API] Error response for ${url}:`, err);
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    return res.json();
  } catch (err) {
    console.error(`[API] Network error for ${url}:`, err);
    throw err;
  }
}

// ── Auth ──────────────────────────────────────────────────────
export interface LoginResponse {
  access_token: string;
  student_id: string;
  student_name: string;
  email?: string;
  branch: string;
  exam_start_time: string | null;
  exam_duration_minutes: number;
  exam_title: string;
  total_questions: number;
}

export async function loginStudent(
  usn: string,
  password: string,
  metadata?: { name?: string; email?: string; branch?: string }
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ usn, password, ...metadata }),
  });
}

export async function logoutStudent(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" }).catch(() => { });
  sessionStorage.removeItem("exam_token");
  sessionStorage.removeItem("exam_student");
}

// ── Questions ─────────────────────────────────────────────────
export interface Question {
  id: string;
  text: string;
  options: string[];
  branch: string;
  order_index: number;
  marks: number;
  image_url: string | null;
}

export async function fetchQuestions(title: string): Promise<Question[]> {
  const res = await apiFetch<{ questions: Question[]; total: number }>(
    `/exam/questions?title=${encodeURIComponent(title)}`
  );
  return res.questions;
}

// ── Save Answer ───────────────────────────────────────────────
export async function saveAnswer(
  question_id: string,
  selected_option: string
): Promise<void> {
  await apiFetch("/exam/save-answer", {
    method: "POST",
    body: JSON.stringify({ question_id, selected_option }),
  });
}

// ── Submit ────────────────────────────────────────────────────
export interface SubmitResponse {
  submitted: boolean;
  score: number;
  total_marks: number;
  correct_count: number;
  wrong_count: number;
  percentage: number;
  submitted_at: string;
}

export async function submitExam(
  answers: Record<string, string>,
  title: string
): Promise<SubmitResponse> {
  const payload = { ...answers, __exam_title: title };
  return apiFetch<SubmitResponse>("/exam/submit-exam", {
    method: "POST",
    body: JSON.stringify({ answers: payload }),
  });
}

export async function startExam(title: string): Promise<{ started_at: string }> {
  return apiFetch<{ started_at: string }>(`/exam/start-exam?title=${encodeURIComponent(title)}`, {
    method: "POST",
  });
}

// ── Violations ────────────────────────────────────────────────
export interface ViolationResponse {
  warning_count: number;
  auto_submitted: boolean;
  message: string;
}

export async function reportViolation(
  type: string,
  metadata: Record<string, unknown> = {}
): Promise<ViolationResponse> {
  return apiFetch<ViolationResponse>("/exam/report-violation", {
    method: "POST",
    body: JSON.stringify({ type, metadata }),
  });
}

// ── Admin Management ───────────────────────────────────────
export interface AdminQuestion {
  id: string;
  text: string;
  options: string[];
  branch: string;
  correct_answer: string;
  order_index: number;
  marks: number;
  exam_name: string;
  image_url: string | null;
}

export interface AdminStudent {
  student_id: string;
  usn: string;
  name: string;
  email: string | null;
  branch: string;
  status: "not_started" | "active" | "submitted";
  warnings: number;
  last_active: string | null;
  submitted_at: string | null;
  started_at: string | null;
}

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin@examguard2024";

function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  console.log(`[ADMIN API] Fetching: ${options.method || 'GET'} ${url}`);

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": ADMIN_SECRET,
      ...options.headers,
    },
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Admin request failed" }));
      console.error(`[ADMIN API] Error for ${url}:`, err);
      throw new Error(err.detail || `Admin API error: ${res.status}`);
    }
    return res.json();
  }).catch(err => {
    console.error(`[ADMIN API] Network error for ${url}:`, err);
    throw err;
  });
}

export async function fetchAdminQuestions(): Promise<AdminQuestion[]> {
  return adminFetch<{ questions: AdminQuestion[]; total: number }>("/admin/questions").then(
    (r) => r.questions
  );
}

export async function createAdminQuestion(data: {
  text: string;
  options: string[];
  branch: string;
  correct_answer: string;
  order_index: number;
  marks: number;
  exam_name: string;
}): Promise<AdminQuestion> {
  return adminFetch<AdminQuestion>("/admin/questions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateAdminQuestion(
  id: string,
  data: Partial<{
    text: string;
    options: string[];
    branch: string;
    correct_answer: string;
    order_index: number;
    marks: number;
    exam_name: string;
  }>
): Promise<AdminQuestion> {
  return adminFetch<AdminQuestion>(`/admin/questions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteAdminQuestion(id: string): Promise<void> {
  await adminFetch(`/admin/questions/${id}`, { method: "DELETE" });
}

export async function fetchAdminStudents(): Promise<AdminStudent[]> {
  return adminFetch<AdminStudent[]>("/admin/students");
}

export async function createAdminStudent(data: {
  usn: string;
  name: string;
  email?: string;
  branch: string;
  password: string;
}): Promise<{ id: string }> {
  return adminFetch<{ id: string }>("/admin/students", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateAdminStudent(
  id: string,
  data: { name?: string; email?: string; branch?: string; password?: string; is_active_session?: boolean }
): Promise<{ updated: boolean }> {
  return adminFetch<{ updated: boolean }>(`/admin/students/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteAdminStudent(id: string): Promise<void> {
  await adminFetch(`/admin/students/${id}`, { method: "DELETE" });
}

export async function resetAdminStudent(id: string): Promise<void> {
  await adminFetch(`/admin/students/${id}/reset`, { method: "POST" });
}

export async function forceSubmitAdminStudent(id: string): Promise<{ score: number }> {
  return adminFetch<{ score: number }>(`/admin/students/${id}/force-submit`, { method: "POST" });
}

export async function cleanupStaleSessions(): Promise<{ count: number }> {
  return adminFetch<{ count: number }>("/admin/students/cleanup-stale", { method: "POST" });
}

// ── Orbital Node Management (Folder CRUD) ─────────────────────

export async function deleteAdminFolder(folderName: string): Promise<void> {
  await adminFetch(`/admin/folders/${encodeURIComponent(folderName)}`, {
    method: "DELETE",
  });
}

export async function renameAdminFolder(oldName: string, newName: string): Promise<void> {
  await adminFetch(`/admin/folders/${encodeURIComponent(oldName)}`, {
    method: "PATCH",
    body: JSON.stringify({ new_name: newName }),
  });
}

export async function uploadQuestionImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/admin/questions/upload`, {
    method: 'POST',
    headers: {
      'X-Admin-Secret': ADMIN_SECRET,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Image upload failed');
  }

  const data = await res.json();
  return data.image_url;
}

// ── Exam Config (Orbital Control) ─────────────────────────────
export interface ExamConfig {
  is_active: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;
  duration_minutes: number;
  exam_title: string;
  marks_per_question: number;
  negative_marks: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  max_attempts: number;
  show_answers_after: boolean;
  total_questions: number;
  total_marks: number;
  exam_description: string | null;
}

export async function fetchExamConfig(title?: string): Promise<ExamConfig> {
  const path = title ? `/admin/exam/config?title=${encodeURIComponent(title)}` : "/admin/exam/config";
  return adminFetch<ExamConfig>(path);
}

export async function updateExamConfig(data: Partial<ExamConfig>): Promise<ExamConfig> {
  return adminFetch<ExamConfig>("/admin/exam/config", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Public endpoint — no admin secret needed. Returns all active configurations. */
export async function fetchPublicExamConfig(): Promise<ExamConfig[]> {
  const res = await fetch(`${API_BASE}/admin/exam/config/public`);
  if (!res.ok) return [];
  return res.json();
}

/**
 * Fetch question counts grouped by branch for the student dashboard.
 * Returns a summary of available exam nodes.
 */
export interface BranchExamSummary {
  branch: string;
  exam_name: string;
  question_count: number;
}

export async function fetchBranchExamSummary(): Promise<BranchExamSummary[]> {
  try {
    // Use the public questions endpoint — reading branch distribution
    const res = await fetch(`${API_BASE}/exam/questions`, {
      headers: {
        Authorization: `Bearer ${typeof window !== "undefined" ? sessionStorage.getItem("exam_token") || "" : ""}`,
      },
    });
    if (!res.ok) return [];
    const data: { questions: Array<{ branch: string; exam_name?: string }> } = await res.json();
    const branchMap: Record<string, { count: number; exam_name: string }> = {};
    for (const q of data.questions) {
      const br = q.branch || "CS";
      if (!branchMap[br]) branchMap[br] = { count: 0, exam_name: q.exam_name || "ExamGuard Assessment" };
      branchMap[br].count++;
    }
    return Object.entries(branchMap).map(([branch, info]) => ({
      branch,
      exam_name: info.exam_name,
      question_count: info.count,
    }));
  } catch {
    return [];
  }
}


// ── Leaderboard ───────────────────────────────────────────────
export interface LeaderboardEntry {
  rank: number;
  student_id: string;
  usn: string;
  name: string;
  branch: string;
  score: number;
  total_marks: number;
  percentage: number;
  time_taken_seconds: number | null;
  submitted_at: string | null;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const data = await adminFetch<{ entries: LeaderboardEntry[]; total_submitted: number; updated_at: string }>(
    "/leaderboard/admin"
  );
  return data.entries;
}

// ── Export (Crystalline Data) ─────────────────────────────────
/** Returns a Blob of the Excel file */
export async function exportResults(quizName?: string): Promise<Blob> {
  // Construct URL correctly even if API_BASE is relative
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const url = new URL(`${API_BASE}/admin/export`.replace("//", "/"), base);
  if (quizName) url.searchParams.append("quiz_name", quizName);

  const res = await fetch(url.toString(), {
    headers: { "X-Admin-Secret": ADMIN_SECRET },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Export failed" }));
    throw new Error(err.detail || "Export failed");
  }
  return res.blob();
}

