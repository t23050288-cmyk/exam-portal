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
export const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "admin@examguard2024";

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
  // UI mapping fields used in control panel
  schedule_start_date?: string;
  schedule_start_time?: string;
  enable_schedule?: boolean;
  schedule_end_date?: string;
  schedule_end_time?: string;
  enable_end_schedule?: boolean;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  image_url?: string;
  marks?: number;
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
  message: string;
  auto_submitted: boolean;
}

// --- Centralized Fetch Wrapper ---

async function baseFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`API Error (${response.status}): ${errorBody || response.statusText}`);
  }

  // Handle binary data for export
  if (path.includes("/export") || path.includes("/download")) {
    return (await response.blob()) as unknown as T;
  }

  return response.json();
}

// Helper to safely access storage on client-only
const getSafeToken = () => {
  if (typeof window !== "undefined" && window.sessionStorage) {
    return window.sessionStorage.getItem("exam_token");
  }
  return null;
};

/**
 * Enhanced fetch for admin endpoints that injects the secret header.
 */
export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as any) };
  headers["X-Admin-Secret"] = ADMIN_SECRET;
  
  const token = getSafeToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return baseFetch<T>(path, { ...options, headers });
}

// --- Public Endpoints ---

export async function fetchPublicExamConfig(): Promise<ExamConfig[]> {
  return baseFetch<ExamConfig[]>("/admin/config");
}

export async function fetchQuestions(examTitle: string): Promise<Question[]> {
  const token = getSafeToken();
  return baseFetch<Question[]>(`/exam/questions?exam_title=${encodeURIComponent(examTitle)}`, {
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
  });
}


export async function submitExam(answers: Record<string, string>, examTitle: string): Promise<SubmitResponse> {
  const token = getSafeToken();
  return baseFetch<SubmitResponse>("/exam/submit-exam", {
    method: "POST",
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
    body: JSON.stringify({ answers, exam_title: examTitle }),
  });
}

export async function loginStudent(usn: string, pass: string, meta: { name: string, email: string, branch: string }): Promise<LoginResponse> {
  return baseFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ usn, password: pass, ...meta }),
  });
}

export async function startExam(examTitle: string): Promise<{ started_at: string }> {
  const token = getSafeToken();
  return baseFetch<{ started_at: string }>("/exam/start", {
    method: "POST",
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
    body: JSON.stringify({ exam_title: examTitle }),
  });
}

export async function saveAnswer(questionId: string, answer: string): Promise<void> {
  const token = getSafeToken();
  return baseFetch<void>("/exam/save-answer", {
    method: "POST",
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
    body: JSON.stringify({ question_id: questionId, selected_option: answer }),
  });
}

export async function reportViolation(type: string, metadata?: Record<string, any>): Promise<ViolationResponse> {
  const token = getSafeToken();
  return baseFetch<ViolationResponse>("/exam/violation", {
    method: "POST",
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
    body: JSON.stringify({ type, metadata }),
  });
}

// --- Admin Question Endpoints ---

export async function fetchAdminQuestions(): Promise<AdminQuestion[]> {
  const data = await adminFetch<any>("/admin/questions");
  return Array.isArray(data) ? data : (data?.questions || []);
}

export async function createAdminQuestion(q: Omit<AdminQuestion, "id">): Promise<AdminQuestion> {
  return adminFetch<AdminQuestion>("/admin/questions", {
    method: "POST",
    body: JSON.stringify(q),
  });
}

export async function updateAdminQuestion(id: string, q: Partial<AdminQuestion>): Promise<AdminQuestion> {
  return adminFetch<AdminQuestion>(`/admin/questions/${id}`, {
    method: "PUT",
    body: JSON.stringify(q),
  });
}

export async function deleteAdminQuestion(id: string): Promise<void> {
  return adminFetch<void>(`/admin/questions/${id}`, { method: "DELETE" });
}

export async function uploadQuestionImage(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return adminFetch<{ url: string }>("/admin/upload", {
    method: "POST",
    body: formData,
  });
}

// --- Admin Student Endpoints ---

export async function fetchAdminStudents(): Promise<AdminStudent[]> {
  const data = await adminFetch<any>("/admin/students");
  return Array.isArray(data) ? data : (data?.students || []);
}

export async function createAdminStudent(s: Partial<AdminStudent>): Promise<AdminStudent> {
  return adminFetch<AdminStudent>("/admin/students", {
    method: "POST",
    body: JSON.stringify(s),
  });
}

export async function updateAdminStudent(id: string, s: Partial<AdminStudent>): Promise<AdminStudent> {
  return adminFetch<AdminStudent>(`/admin/students/${id}`, {
    method: "PUT",
    body: JSON.stringify(s),
  });
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

// --- Admin Folder/Branch Endpoints ---

export async function deleteAdminFolder(examName: string): Promise<void> {
  return adminFetch<void>(`/admin/questions/folder/${encodeURIComponent(examName)}`, { method: "DELETE" });
}

export async function renameAdminFolder(oldName: string, newName: string): Promise<void> {
  return adminFetch<void>(`/admin/questions/folder/rename`, {
    method: "POST",
    body: JSON.stringify({ old_name: oldName, new_name: newName }),
  });
}

export async function editAdminFolderBranch(examName: string, branches: string[]): Promise<void> {
  // Pad the comma-separated string to ensure accurate substring querying later (e.g., ",CS,BCA,")
  const paddedBranchString = `,${branches.join(",")},`;
  return adminFetch<void>(`/admin/folders/${encodeURIComponent(examName)}/branch`, {
    method: "PATCH",
    body: JSON.stringify({ new_branch: paddedBranchString }),
  });
}

// --- Exam Configuration Endpoints ---

export async function fetchExamConfig(examTitle: string) {
  return adminFetch<ExamConfig>(`/admin/config?exam_title=${encodeURIComponent(examTitle)}`);
}

export async function updateExamConfig(config: Partial<ExamConfig>) {
  return adminFetch<ExamConfig>("/admin/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

// --- Specialized Admin Endpoints ---

export async function fetchBranchExamSummary(branch: string): Promise<BranchExamSummary[]> {
  return adminFetch<BranchExamSummary[]>(`/admin/summary?branch=${encodeURIComponent(branch)}`);
}

export async function exportResults(examName?: string): Promise<Blob> {
  const path = examName 
    ? `/admin/export?exam_name=${encodeURIComponent(examName)}` 
    : "/admin/export";
  return adminFetch<Blob>(path);
}

export async function cleanupStaleSessions(): Promise<{ count: number }> {
  return adminFetch<{ count: number }>("/admin/cleanup", { method: "POST" });
}
