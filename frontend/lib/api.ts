const API_BASE = "/api";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("exam_token");
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const url = `${API_BASE}${path}`;
  console.log(`[API] Fetching: ${options.method || 'GET'} ${url}`);

  try {
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      sessionStorage.removeItem("exam_token");
      sessionStorage.removeItem("exam_student");
      window.location.href = "/login";
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

export async function fetchQuestions(): Promise<Question[]> {
  const res = await apiFetch<{ questions: Question[]; total: number }>(
    "/exam/questions"
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
  percentage: number;
  submitted_at: string;
}

export async function submitExam(
  answers: Record<string, string>
): Promise<SubmitResponse> {
  return apiFetch<SubmitResponse>("/exam/submit-exam", {
    method: "POST",
    body: JSON.stringify({ answers }),
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
  duration_minutes: number;
  exam_title: string;
}

export async function fetchExamConfig(): Promise<ExamConfig> {
  return adminFetch<ExamConfig>("/admin/exam/config");
}

export async function updateExamConfig(data: Partial<ExamConfig>): Promise<ExamConfig> {
  return adminFetch<ExamConfig>("/admin/exam/config", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Public endpoint — no admin secret needed */
export async function fetchPublicExamConfig(): Promise<ExamConfig> {
  const res = await fetch(`${API_BASE}/admin/exam/config/public`);
  if (!res.ok) return { is_active: true, scheduled_start: null, duration_minutes: 60, exam_title: "ExamGuard Assessment" };
  return res.json();
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
export async function exportResults(): Promise<Blob> {
  const url = `${API_BASE}/admin/export`;
  const res = await fetch(url, {
    headers: { "X-Admin-Secret": ADMIN_SECRET },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Export failed" }));
    throw new Error(err.detail || "Export failed");
  }
  return res.blob();
}

