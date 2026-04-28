"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import {
  fetchAdminQuestions,
  createAdminQuestion,
  updateAdminQuestion,
  deleteAdminQuestion,
  fetchAdminStudents,
  createAdminStudent,
  updateAdminStudent,
  deleteAdminStudent,
  resetAdminStudent,
  exportResults,
  deleteAdminFolder,
  renameAdminFolder,
  uploadQuestionImage,
  fetchBranchExamSummary,
  AdminQuestion,
  AdminStudent,
  BranchExamSummary,
  forceSubmitAdminStudent,
  cleanupStaleSessions,
} from "@/lib/api";
import { BRANCH_IDS } from "@/lib/constants";
import styles from "./admin.module.css";
import adminStyles from "./admin-management.module.css";
import Skeleton from "@/components/Skeleton";

// ── Lazy-loaded new feature tabs ──────────────────────────────
import dynamic from "next/dynamic";
const LeaderboardPage = dynamic(() => import("./leaderboard/page"), { ssr: false });
const IngestPage      = dynamic(() => import("./ingest/page"),      { ssr: false });
const OrbitalControl  = dynamic(() => import("./control/page"),     { ssr: false });

// ── Types ─────────────────────────────────────────────────────
interface StudentRow {
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
  current_question: number | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function getElapsedTime(started: string | null, ended: string | null): string {
  if (!started) return "—";
  const t0 = new Date(started).getTime();
  const t1 = ended ? new Date(ended).getTime() : Date.now();
  const secs = Math.floor(Math.max(0, t1 - t0) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function isStale(lastActive: string | null): boolean {
  if (!lastActive) return true;
  return (Date.now() - new Date(lastActive).getTime()) > 10 * 60 * 1000; // 10 mins
}

const BRANCHES = BRANCH_IDS;
type Tab = "monitor" | "questions" | "students" | "leaderboard" | "ingest" | "control";
const ADMIN_AUTH_KEY = "examguard_admin_auth";

function getStoredAuth(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(ADMIN_AUTH_KEY) === "true"; } catch { return false; }
}

// ── Data-Stream Export Animation ──────────────────────────────
function ExportButton({ quizzes }: { quizzes: BranchExamSummary[] }) {
  const [phase, setPhase] = useState<"idle" | "streaming" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const doExport = async (name?: string) => {
    setShowMenu(false);
    if (phase === "streaming") return;
    setPhase("streaming");
    setError(null);
    try {
      const blob = await exportResults(name === "all" ? undefined : name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `results_${name || "all"}_${dateStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setPhase("done");
      setTimeout(() => setPhase("idle"), 3000);
    } catch (e: any) {
      setError(e.message);
      setPhase("idle");
    }
  };

  const quizNames = Array.from(new Set(quizzes.map(q => q.exam_name)));

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <button
          id="export-btn"
          onClick={() => setShowMenu(!showMenu)}
          disabled={phase === "streaming"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: phase === "streaming" ? "not-allowed" : "pointer",
            border: "1px solid rgba(139,92,246,0.35)",
            background: phase === "done"
              ? "rgba(16,185,129,0.12)"
              : "rgba(139,92,246,0.1)",
            color: phase === "done" ? "#34d399" : "#a78bfa",
            transition: "all 0.3s ease",
            position: "relative",
            overflow: "hidden",
            zIndex: 1,
          }}
        >
          {phase === "streaming" && (
            <span
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.25), transparent)",
                backgroundSize: "200% 100%",
                animation: "shimmerExport 1s linear infinite",
              }}
            />
          )}
          <span style={{ fontSize: 16 }}>
            {phase === "streaming" ? "☁️" : phase === "done" ? "✓" : "📊"}
          </span>
          {phase === "streaming" ? "Streaming data…" : phase === "done" ? "Downloaded!" : "Export Results"}
        </button>
        {error && <span style={{ fontSize: 11, color: "#f87171" }}>{error}</span>}
      </div>

      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 240,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
              padding: "8px",
              zIndex: 100,
              overflow: "hidden",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", padding: "4px 8px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Select Quiz to Download
            </div>
            <button 
              className={styles.menuItem} 
              onClick={() => doExport("all")}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}
            >
              <span style={{ opacity: 0.6 }}>📦</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>All Results (Universal)</span>
            </button>
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {quizNames.length === 0 ? (
                <div style={{ padding: "12px", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>No quizzes discovered</div>
              ) : quizNames.map(name => (
                <button 
                  key={name}
                  className={styles.menuItem}
                  onClick={() => doExport(name)}
                  style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}
                >
                  <span style={{ opacity: 0.6 }}>📝</span>
                  <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean>(false);
  const [initialized, setInitialized] = useState(false);
  const [pass, setPass] = useState("");
  const [passError, setPassError] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "submitted" | "not_started">("all");
  const [search, setSearch] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<Tab>("monitor");
  const [liveStats, setLiveStats] = useState({ answers: 0, violations: 0, submittals: 0 });
  const [quizzes, setQuizzes] = useState<BranchExamSummary[]>([]);
  const [quizFilter, setQuizFilter] = useState<string>("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAuthed(getStoredAuth());
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    try {
      if (authed) localStorage.setItem(ADMIN_AUTH_KEY, "true");
      else localStorage.removeItem(ADMIN_AUTH_KEY);
    } catch {}
  }, [authed, initialized]);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (pass === (process.env.NEXT_PUBLIC_ADMIN_SECRET || "admin@examguard2024")) {
      setAuthed(true);
    } else {
      setPassError("Incorrect admin password.");
    }
  };

  const fetchStudents = useCallback(async () => {
    try {
      const data = await fetchAdminStudents();
      const rows: StudentRow[] = (data || []).map((s: any) => ({
        student_id: s.student_id,
        usn: s.usn || s.roll_number,
        name: s.name,
        email: s.email,
        branch: s.branch || "CS",
        status: s.status,
        warnings: s.warnings,
        last_active: s.last_active,
        submitted_at: s.submitted_at,
        started_at: s.started_at,
        current_question: null,
      }));
      setStudents(rows);
      setLastUpdate(new Date());
      const violations = rows.filter((s) => s.status === "active").reduce((a, s) => a + (s.warnings || 0), 0);
      setLiveStats({ answers: 0, violations, submittals: rows.filter((s) => s.status === "submitted").length });
    } catch (err) {
      console.error("[ADMIN] fetchStudents:", err);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetchStudents().finally(() => setLoading(false));
    fetchAdminQuestions().then(qs => {
      const list: BranchExamSummary[] = [];
      qs.forEach(q => {
        const br = q.branch || "CS";
        const ex = q.exam_name || "ExamGuard Assessment";
        if (!list.find(x => x.branch === br && x.exam_name === ex)) {
          list.push({ branch: br, exam_name: ex, question_count: 1 });
        }
      });
      setQuizzes(list);
    }).catch(console.error);

    const channel = supabase
      .channel("admin-exam-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_status" }, () => fetchStudents())
      .subscribe();

    const interval = setInterval(fetchStudents, 5_000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [authed, fetchStudents]);

  const handleCleanup = async () => {
    if (!confirm("This will reset all sessions idle for > 4 hours to 'Not Started'. Continue?")) return;
    setLoading(true);
    try {
      const { count } = await cleanupStaleSessions();
      alert(`Successfully cleaned up ${count} stale sessions.`);
      fetchStudents();
    } catch (err: any) {
      alert("Cleanup failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForceSubmit = async (s: StudentRow) => {
    if (!confirm(`Force submit exam for ${s.name}? This will calculate score based on currently saved answers.`)) return;
    try {
      await forceSubmitAdminStudent(s.student_id);
      fetchStudents();
    } catch (err: any) {
      alert("Force submit failed: " + err.message);
    }
  };

  const total     = students.length;
  const active    = students.filter((s) => s.status === "active" && !isStale(s.last_active)).length;
  const idle      = students.filter((s) => s.status === "active" && isStale(s.last_active)).length;
  const submitted = students.filter((s) => s.status === "submitted").length;
  const notStarted = students.filter((s) => s.status === "not_started").length;
  const flagged   = students.filter((s) => s.warnings >= 2).length;

  const visible = students
    .filter((s) => filter === "all" || s.status === filter)
    .filter((s) => quizFilter === "all" || quizzes.some(q => q.exam_name === quizFilter && q.branch === s.branch))
    .filter((s) => !search.trim() || s.usn.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()));

  if (!initialized) {
    return (
      <div className="page-center">
        <div style={{ width: 400, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton height={60} borderRadius={12} />
          <Skeleton height={200} borderRadius={12} />
          <Skeleton height={50} borderRadius={12} />
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="page-center" style={{ background: "linear-gradient(160deg, #0d0d1a 0%, #0f0f23 100%)", minHeight: "100vh" }}>
        <div className={styles.loginCard} style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
          borderRadius: 24,
          padding: "48px 40px",
          width: "100%",
          maxWidth: 400,
        }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "#e2e8f0", marginBottom: 8 }}>
              EXAM Admin
            </h1>
            <p style={{ color: "rgba(148,163,184,0.7)", fontSize: 14 }}>ExamGuard Control Node — Staff Only</p>
          </div>
          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="password"
              className={adminStyles.input}
              placeholder="Admin password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoFocus
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
            />
            {passError && <p className="text-danger" style={{ fontSize: 13 }}>{passError}</p>}
            <button type="submit" className="btn btn-primary btn-lg" style={{ background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", border: "none", borderRadius: 12 }}>
              Access Command Node
            </button>
          </form>
        </div>
      </div>
    );
  }

  const TAB_CONFIG: { id: Tab; label: string; icon: string }[] = [
    { id: "monitor",     label: "Monitor",     icon: "📡" },
    { id: "leaderboard", label: "Leaderboard", icon: "⚡" },
    { id: "questions",   label: "Questions",   icon: "📋" },
    { id: "students",    label: "Students",    icon: "👥" },
    { id: "ingest",      label: "Harvester",   icon: "🌌" },
    { id: "control",     label: "Control",     icon: "🛸" },
  ];

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="10" fill="url(#adminGrad)" />
            <path d="M8 12h16M8 16h10M8 20h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <defs>
              <linearGradient id="adminGrad" x1="0" y1="0" x2="32" y2="32">
                <stop stopColor="#8b5cf6" /><stop offset="1" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>
          <div>
            <h1 className={styles.title} style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
              EXAM Admin
            </h1>
            <p className={styles.subtitle} style={{ fontSize: 11 }}>
              Live Exam Monitor · Updated {timeAgo(lastUpdate.toISOString())}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <nav className={adminStyles.tabs}>
          {TAB_CONFIG.map((t) => (
            <button
              key={t.id}
              className={`${adminStyles.tab} ${activeTab === t.id ? adminStyles.tabActive : ""}`}
              onClick={() => setActiveTab(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}
            >
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {activeTab === "monitor" && <ExportButton quizzes={quizzes} />}
          <button className="btn btn-outline" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setAuthed(false)}>
            Logout
          </button>
        </div>
      </header>

      {/* ── Monitor Tab ── */}
      {activeTab === "monitor" && (
        <>
          {/* ── Canva-Style 3 Hero Stat Cards ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
            padding: "20px 24px 0",
          }}>
            {/* Active Students */}
            <div style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "22px 24px",
              display: "flex",
              alignItems: "center",
              gap: 18,
              boxShadow: "var(--shadow-card)",
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: "rgba(25,118,210,0.1)",
                border: "1px solid rgba(25,118,210,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, flexShrink: 0,
              }}>👥</div>
              <div>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-primary)", lineHeight: 1 }}>
                  {active}
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", marginLeft: 8 }}>
                    ({idle} stale/idle)
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, fontWeight: 500 }}>Active Students</div>
              </div>
            </div>

            {/* Total Violations */}
            <div style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "22px 24px",
              display: "flex",
              alignItems: "center",
              gap: 18,
              boxShadow: "var(--shadow-card)",
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: "rgba(237,108,2,0.1)",
                border: "1px solid rgba(237,108,2,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, flexShrink: 0,
              }}>⚠️</div>
              <div>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--warning)", lineHeight: 1 }}>
                  {students.reduce((sum, s) => sum + (s.warnings || 0), 0)}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, fontWeight: 500 }}>Total Violations</div>
              </div>
            </div>

            {/* Completed Quizzes */}
            <div style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "22px 24px",
              display: "flex",
              alignItems: "center",
              gap: 18,
              boxShadow: "var(--shadow-card)",
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: "rgba(46,125,50,0.1)",
                border: "1px solid rgba(46,125,50,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, flexShrink: 0,
              }}>✅</div>
              <div>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--success)", lineHeight: 1 }}>
                  {submitted}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, fontWeight: 500 }}>Completed Quizzes</div>
              </div>
            </div>
          </div>

          {/* ── Violation Alerts Feed ── */}
          <ViolationAlertsFeed students={students} />

          {/* Controls */}
          <div className={styles.controls}>
            <input type="text" className={adminStyles.input} placeholder="Search by name or USN…" value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
            
            <select 
              className={adminStyles.input} 
              style={{ maxWidth: 200, padding: "8px 12px", cursor: "pointer" }}
              value={quizFilter}
              onChange={(e) => setQuizFilter(e.target.value)}
            >
              <option value="all">All Quizzes</option>
              {Array.from(new Set(quizzes.map(q => q.exam_name))).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <div className={styles.filters}>
              {(["all", "active", "submitted", "not_started"] as const).map((f) => (
                <button key={f} className={`btn ${filter === f ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setFilter(f)} style={{ fontSize: 12, padding: "6px 14px" }}>
                  {f === "not_started" ? "Not Started" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <button className="btn btn-outline" onClick={handleCleanup} style={{ fontSize: 12, padding: "6px 14px", border: "1px dashed var(--warning)", color: "var(--warning)" }}>
                🧹 Cleanup Stale
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={40} />
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th><th>USN NO.</th><th>Name</th><th>Email</th>
                    <th>Branch</th><th>Status</th><th>Start Time</th><th>Total Time</th>
                    <th>Submitted At</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>No students found.</td></tr>
                  ) : visible.map((s, i) => (
                    <tr key={s.student_id} className={s.warnings >= 3 ? styles.rowDanger : s.warnings >= 2 ? styles.rowWarning : ""}>
                      <td className="mono text-muted" style={{ fontSize: 12 }}>{i + 1}</td>
                      <td><span className="mono" style={{ fontSize: 13 }}>{s.usn}</span></td>
                      <td>{s.name}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.email || "—"}</td>
                      <td><span className="badge badge-neutral">{s.branch}</span></td>
                      <td><StatusBadge status={s.status} lastActive={s.last_active} /></td>
                      <td style={{ fontSize: 12 }}>{s.started_at ? new Date(s.started_at).toLocaleTimeString() : "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{getElapsedTime(s.started_at, s.submitted_at)}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString() : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          {s.status === "active" && (
                            <button className="btn btn-outline" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => handleForceSubmit(s)}>
                              Submit
                            </button>
                          )}
                          <button className="btn btn-outline" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => resetAdminStudent(s.student_id).then(fetchStudents)}>
                            Reset
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── New Feature Tabs ── */}
      {activeTab === "leaderboard" && <LeaderboardPage />}
      {activeTab === "ingest"      && <IngestPage />}
      {activeTab === "control"     && <OrbitalControl />}
      {activeTab === "questions"   && <QuestionsTab />}
      {activeTab === "students"    && <StudentsTab />}
    </div>
  );
}

// ── Violation Alerts Feed ─────────────────────────────────────
const VIOLATION_TYPES = ["Tab switched", "Window focus lost", "Copy/paste detected", "Fullscreen exit"];

function ViolationAlertsFeed({ students }: { students: StudentRow[] }) {
  // Build a flat list of synthetic violation events from warnings count
  const alerts: { name: string; usn: string; type: string; badge: number }[] = [];
  students
    .filter(s => s.warnings > 0)
    .sort((a, b) => (b.warnings || 0) - (a.warnings || 0))
    .forEach(s => {
      for (let i = 0; i < s.warnings; i++) {
        alerts.push({
          name: s.name,
          usn: s.usn,
          type: VIOLATION_TYPES[i % VIOLATION_TYPES.length],
          badge: alerts.length + 1,
        });
      }
    });

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}>
        {/* Panel header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>Violation Alerts</span>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 600,
            padding: "2px 10px",
            borderRadius: 999,
            background: alerts.length > 0 ? "var(--danger-bg)" : "var(--bg-secondary)",
            color: alerts.length > 0 ? "var(--danger)" : "var(--text-muted)",
            border: alerts.length > 0 ? "1px solid rgba(211,47,47,0.2)" : "1px solid var(--border)",
          }}>
            {alerts.length} events
          </span>
        </div>

        {/* Alert list */}
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {alerts.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
              ✅ No violations recorded
            </div>
          ) : (
            alerts.reverse().map((alert, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 20px",
                  borderBottom: i < alerts.length - 1 ? "1px solid var(--border)" : "none",
                  background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-secondary)",
                  transition: "background 0.2s",
                }}
              >
                {/* Triangle warning icon */}
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: "rgba(211,47,47,0.08)",
                  border: "1px solid rgba(211,47,47,0.18)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, flexShrink: 0, marginTop: 2,
                }}>⚠</div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 2 }}>
                    {alert.name}
                    <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{alert.usn}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--danger)", fontWeight: 500, marginBottom: 2 }}>
                    {alert.type}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Recorded during active session</div>
                </div>

                {/* Badge number */}
                <div style={{
                  minWidth: 28, height: 28,
                  borderRadius: 8,
                  background: "rgba(211,47,47,0.1)",
                  border: "1px solid rgba(211,47,47,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                  color: "var(--danger)",
                  flexShrink: 0,
                }}>#{alert.badge}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function StatusBadge({ status, lastActive }: { status: string; lastActive: string | null }) {
  const idle = lastActive ? (Date.now() - new Date(lastActive).getTime()) > 60_000 : false;
  if (status === "submitted") return <span className="badge badge-success">✓ Submitted</span>;
  if (status === "active" && idle) return <span className="badge badge-warning">⏸ Idle</span>;
  if (status === "active") return <span className="badge badge-success">● Active</span>;
  return <span className="badge badge-neutral">○ Not Started</span>;
}

function WarningBadge({ count }: { count: number }) {
  if (count === 0) return <span className="badge badge-neutral">0</span>;
  if (count === 1) return <span className="badge badge-warning">⚠ 1</span>;
  if (count === 2) return <span className="badge" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}>⚠ 2</span>;
  return <span className="badge badge-danger">🔴 {count}</span>;
}

// ── Questions Tab (unchanged logic, kept here) ────────────────
function QuestionsTab() {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("All");
  const [formData, setFormData] = useState<Omit<AdminQuestion, "id">>({ 
    text: "", 
    options: ["", "", "", ""], 
    branch: "CS", 
    correct_answer: "", 
    order_index: 0, 
    marks: 1, 
    exam_name: "General Assessment",
    image_url: ""
  });

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await fetchAdminQuestions(); setQuestions(data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!formData.text) return alert("Please enter question text");
    if (formData.options.some((o) => !o)) return alert("All options must be filled");
    if (!formData.correct_answer) return alert("Please select a correct answer");
    if (!formData.branch) return alert("Please select a branch");
    try {
      if (editing) await updateAdminQuestion(editing.id, formData);
      else await createAdminQuestion(formData);
      setShowModal(false); setEditing(null);
      setFormData({ text: "", options: ["", "", "", ""], branch: "CS", correct_answer: "", order_index: questions.length, marks: 1, exam_name: "General Assessment", image_url: "" });
      load();
    } catch { alert("Failed to save question"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;
    try {
      await deleteAdminQuestion(id);
      setQuestions(questions.filter((q) => q.id !== id));
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleDeleteFolder = async (folderName: string) => {
    if (!confirm(`WARNING: This will permanently delete the entire Isolation Node '${folderName}' and ALL questions inside it. Continue?`)) return;
    try {
      setLoading(true);
      await deleteAdminFolder(folderName);
      setQuestions(questions.filter((q) => q.exam_name !== folderName));
      setExpandedClusters(prev => ({ ...prev, [folderName]: false }));
    } catch (error: any) {
      alert(`Failed to delete folder: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRenameFolder = async (folderName: string) => {
    const newName = prompt(`Enter new name for Isolation Node '${folderName}':`, folderName);
    if (!newName || newName.trim() === folderName) return;

    try {
      setLoading(true);
      await renameAdminFolder(folderName, newName.trim());
      // Update local state: find and update all questions in this folder
      setQuestions(questions.map(q => 
        q.exam_name === folderName ? { ...q, exam_name: newName.trim() } : q
      ));
      setExpandedClusters(prev => {
        const next = { ...prev };
        delete next[folderName];
        next[newName.trim()] = true;
        return next;
      });
    } catch (error: any) {
      alert(`Failed to rename folder: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredQuestions = selectedBranch === "All" ? questions : questions.filter((q) => q.branch === selectedBranch);

  // Group by exam_name
  const clusters: Record<string, AdminQuestion[]> = {};
  filteredQuestions.forEach(q => {
    const name = q.exam_name || "Uncategorized";
    if (!clusters[name]) clusters[name] = [];
    clusters[name].push(q);
  });

  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});
  const toggleCluster = (name: string) => setExpandedClusters(prev => ({ ...prev, [name]: !prev[name] }));

  // Palette for category cards — cycles through 4 colors
  const CARD_PALETTE = [
    { bg: "rgba(25,118,210,0.06)",  border: "rgba(25,118,210,0.25)",  accent: "#1565c0",  icon: "📐", skillColor: "rgba(25,118,210,0.1)",  skillText: "#1565c0" },
    { bg: "rgba(103,58,183,0.06)",  border: "rgba(103,58,183,0.25)",  accent: "#6a1b9a",  icon: "🧠", skillColor: "rgba(103,58,183,0.1)",  skillText: "#6a1b9a" },
    { bg: "rgba(27,153,105,0.06)",  border: "rgba(27,153,105,0.25)",  accent: "#1b5e20",  icon: "📖", skillColor: "rgba(27,153,105,0.1)",  skillText: "#1b5e20" },
    { bg: "rgba(230,119,14,0.06)",  border: "rgba(230,119,14,0.25)",  accent: "#e65100",  icon: "💻", skillColor: "rgba(230,119,14,0.1)",  skillText: "#e65100" },
  ];

  function inferDifficulty(name: string): "Easy" | "Medium" | "Hard" {
    const n = name.toLowerCase();
    if (n.includes("final") || n.includes("advanced") || n.includes("hard") || n.includes("logical") || n.includes("programming")) return "Hard";
    if (n.includes("mid") || n.includes("aptitude") || n.includes("medium") || n.includes("intermediate")) return "Medium";
    return "Easy";
  }

  function inferDescription(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("aptitude") || n.includes("quant")) return "Tests mathematical reasoning, numerical ability, and problem-solving skills with numbers, percentages, ratios, and basic arithmetic operations.";
    if (n.includes("logical") || n.includes("reasoning")) return "Evaluates analytical thinking, pattern recognition, and logical deduction abilities through puzzles, sequences, and reasoning problems.";
    if (n.includes("english") || n.includes("comprehension") || n.includes("language")) return "Assesses language proficiency, reading comprehension, grammar, vocabulary, and written communication skills.";
    if (n.includes("program") || n.includes("code") || n.includes("cs") || n.includes("computer")) return "Tests programming concepts, algorithms, data structures, and coding logic across multiple programming languages.";
    if (n.includes("final")) return "Comprehensive final assessment covering all topics from the semester. Tests deep understanding and application of core concepts.";
    if (n.includes("mid")) return "Mid-semester evaluation covering syllabus units 1 to 3. Tests understanding of foundational concepts and skill application.";
    return `Assessment covering key topics in ${name}. Evaluates conceptual understanding and practical application skills.`;
  }

  function inferSkills(name: string, branches: string[]): string[] {
    const n = name.toLowerCase();
    const branchTag = branches[0] || "General";
    if (n.includes("aptitude") || n.includes("quant")) return ["Arithmetic", "Algebra", "Geometry", "Data Interpretation", "Percentages"];
    if (n.includes("logical") || n.includes("reasoning")) return ["Pattern Recognition", "Analytical Thinking", "Problem Solving", "Critical Reasoning"];
    if (n.includes("english") || n.includes("comprehension")) return ["Reading Comprehension", "Grammar", "Vocabulary", "Sentence Formation"];
    if (n.includes("program") || n.includes("code") || n.includes("computer")) return ["Algorithms", "Data Structures", "Programming Logic", "Code Optimization"];
    return [branchTag, "Core Concepts", "Application", "Analysis"];
  }

  const DIFF_COLORS: Record<string, { bg: string; text: string }> = {
    Easy:   { bg: "rgba(46,125,50,0.1)",  text: "#2e7d32" },
    Medium: { bg: "rgba(237,108,2,0.1)",  text: "#e65100" },
    Hard:   { bg: "rgba(211,47,47,0.1)",   text: "#c62828" },
  };

  return (
    <div className={adminStyles.managementPage}>
      <div className={adminStyles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h2 className={adminStyles.headerTitle}>Questions ({filteredQuestions.length})</h2>
          <select className={adminStyles.input} style={{ width: 140, height: 36, padding: "0 8px", fontSize: 13 }}
            value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
            <option value="All">All Branches</option>
            {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setFormData({ text: "", options: ["", "", "", ""], branch: "CS", correct_answer: "", order_index: questions.length, marks: 1, exam_name: "General Assessment", image_url: "" }); setShowModal(true); }}>
          + Add Question
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : filteredQuestions.length === 0 ? (
        <div className={adminStyles.empty}>No questions found for branch: {selectedBranch}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 20, padding: "8px 0" }}>
          <AnimatePresence>
            {Object.entries(clusters).map(([name, clusterQs], idx) => {
              const palette = CARD_PALETTE[idx % CARD_PALETTE.length];
              const diff = inferDifficulty(name);
              const diffStyle = DIFF_COLORS[diff];
              const desc = inferDescription(name);
              const branchList = [...new Set(clusterQs.map(q => q.branch))];
              const skills = inferSkills(name, branchList);

              return (
                <React.Fragment key={name}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.35, delay: idx * 0.05 }}
                    style={{
                      background: palette.bg,
                      border: `1.5px solid ${palette.border}`,
                      borderRadius: 18,
                      padding: "24px 24px 20px",
                      cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      transition: "box-shadow 0.2s, transform 0.2s",
                      position: "relative",
                      overflow: "hidden",
                    }}
                    whileHover={{ y: -3, boxShadow: `0 8px 24px ${palette.border}` }}
                    onClick={() => toggleCluster(name)}
                  >
                    {/* Icon + Title row */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 22 }}>{palette.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 16, color: palette.accent, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
                          {name}
                        </div>
                      </div>
                      {/* Actions (only when not expanded) */}
                      {!expandedClusters[name] && (
                        <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                          <button
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: `1px solid ${palette.border}`, background: "transparent", color: palette.accent, cursor: "pointer", fontWeight: 600 }}
                            onClick={() => handleRenameFolder(name)}
                          >Rename</button>
                          <button
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1px solid rgba(211,47,47,0.3)", background: "transparent", color: "var(--danger)", cursor: "pointer", fontWeight: 600 }}
                            onClick={() => handleDeleteFolder(name)}
                          >Delete</button>
                        </div>
                      )}
                    </div>

                    {/* Difficulty badge */}
                    <div style={{ marginBottom: 12 }}>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 12px",
                        borderRadius: 999,
                        fontSize: 12, fontWeight: 600,
                        background: diffStyle.bg,
                        color: diffStyle.text,
                        border: `1px solid ${diffStyle.bg.replace("0.1", "0.3")}`,
                      }}>{diff}</span>
                    </div>

                    {/* Description */}
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 14 }}>
                      {desc}
                    </p>

                    {/* Key Skills */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: palette.accent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                        Key Skills Tested:
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {skills.map(skill => (
                          <span key={skill} style={{
                            padding: "4px 11px",
                            borderRadius: 999,
                            fontSize: 12, fontWeight: 500,
                            background: palette.skillColor,
                            color: palette.skillText,
                            border: `1px solid ${palette.border}`,
                          }}>{skill}</span>
                        ))}
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${palette.border}` }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                        📋 {clusterQs.length} question{clusterQs.length !== 1 ? "s" : ""} · {branchList.join(", ")}
                      </span>
                      <span style={{ fontSize: 12, color: palette.accent, fontWeight: 700 }}>
                        {expandedClusters[name] ? "▲ Collapse" : "▼ View Questions"}
                      </span>
                    </div>
                  </motion.div>

                  {/* Expanded question list */}
                  <AnimatePresence>
                    {expandedClusters[name] && (
                      <motion.div
                        style={{ gridColumn: "1 / -1" }}
                        className={adminStyles.isolationView}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <div className={adminStyles.nodeManagementHeader}>
                          <div className={adminStyles.nodeInfo}>
                            <h4 style={{ margin: 0, color: palette.accent }}>{name}</h4>
                            <small style={{ color: "var(--text-muted)" }}>{clusterQs.length} Questions</small>
                          </div>
                          <div className={adminStyles.nodeActions}>
                            <button className="btn btn-outline" style={{ fontSize: 12, padding: "4px 12px" }}
                              onClick={() => handleRenameFolder(name)}>Rename</button>
                            <button className="btn btn-outline btn-danger" style={{ fontSize: 12, padding: "4px 12px" }}
                              onClick={() => handleDeleteFolder(name)}>Delete Folder</button>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                          {clusterQs.map((q) => (
                            <div key={q.id} className={adminStyles.card} style={{ margin: 0 }}>
                              <div className={adminStyles.cardHeader}>
                                <div className={adminStyles.cardIndex} style={{ fontSize: 11, fontWeight: 700, color: palette.accent }}>Q{q.order_index + 1}</div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button className="btn-icon" onClick={() => { setEditing(q); setFormData({ ...q }); setShowModal(true); }}>✏️</button>
                                  <button className="btn-icon btn-danger" onClick={() => handleDelete(q.id)}>🗑️</button>
                                </div>
                              </div>
                              {q.image_url && (
                                <div className={adminStyles.cardThumbnailContainer}>
                                  <img src={q.image_url} alt="Thumbnail" className={adminStyles.cardThumbnail} />
                                </div>
                              )}
                              <p className={adminStyles.cardText} style={{ fontSize: 14 }}>{q.text}</p>
                              <div className={adminStyles.cardFooter} style={{ display: "flex", gap: 10, marginTop: 12 }}>
                                <span className="badge badge-neutral" style={{ fontSize: 10 }}>{q.branch}</span>
                                <span className="badge badge-neutral" style={{ fontSize: 10 }}>{q.marks} Marks</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 20, textAlign: "right" }}>
                          <button className="btn btn-outline" onClick={() => toggleCluster(name)}>Close</button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {showModal && (
        <div className={adminStyles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={adminStyles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Edit Question" : "Add Question"}</h3>
            <div className={adminStyles.formGroup}>
              <label>Question Text</label>
              <textarea className={adminStyles.input} value={formData.text} onChange={(e) => setFormData({ ...formData, text: e.target.value })} rows={3} />
            </div>
            <div className={adminStyles.formGroup}>
              <label>Options</label>
              {formData.options.map((opt, i) => (
                <input key={i} className={adminStyles.input} placeholder={`Option ${String.fromCharCode(65 + i)}`} value={opt}
                  onChange={(e) => { const n = [...formData.options]; n[i] = e.target.value; setFormData({ ...formData, options: n }); }} />
              ))}
            </div>
            <div className={adminStyles.formRow}>
              <div className={adminStyles.formGroup}>
                <label>Order Index</label>
                <input type="number" className={adminStyles.input} value={formData.order_index} onChange={(e) => setFormData({ ...formData, order_index: +e.target.value })} />
              </div>
              <div className={adminStyles.formGroup}>
                <label>Marks</label>
                <input type="number" className={adminStyles.input} value={formData.marks} onChange={(e) => setFormData({ ...formData, marks: +e.target.value })} />
              </div>
              <div className={adminStyles.formGroup}>
                <label>Correct Answer</label>
                <select className={adminStyles.input} value={formData.correct_answer} onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}>
                  <option value="">Select correct option…</option>
                  {formData.options.map((_, i) => <option key={i} value={String.fromCharCode(65 + i)}>Option {String.fromCharCode(65 + i)}</option>)}
                </select>
              </div>
              <div className={adminStyles.formGroup}>
                <label>Exam Identity (Anchor)</label>
                <input
                  type="text"
                  className={adminStyles.input}
                  value={formData.exam_name}
                  onChange={(e) => setFormData({ ...formData, exam_name: e.target.value })}
                />
              </div>
              <div className={adminStyles.formGroup}>
                <label>Branch</label>
                <select className={adminStyles.input} value={formData.branch} onChange={(e) => setFormData({ ...formData, branch: e.target.value })}>
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>

            <div className={adminStyles.formGroup} style={{ marginTop: 16 }}>
              <label>Media Asset (Optional)</label>
              {formData.image_url ? (
                <div className={adminStyles.imagePreviewContainer}>
                  <img src={formData.image_url} alt="Question" className={adminStyles.imagePreview} />
                  <button 
                    className={adminStyles.removeImageBtn}
                    onClick={() => setFormData({ ...formData, image_url: "" })}
                    title="Remove Image"
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className={adminStyles.uploadZone}>
                  <input 
                    type="file" 
                    id="question-image-upload" 
                    style={{ display: "none" }}
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const url = await uploadQuestionImage(file);
                        setFormData({ ...formData, image_url: url });
                      } catch (err: any) {
                        alert(`Upload failed: ${err.message}`);
                      }
                    }}
                  />
                  <label htmlFor="question-image-upload" style={{ cursor: "pointer", display: "block", padding: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>🖼️</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Click to upload image asset</div>
                  </label>
                </div>
              )}
            </div>
            <div className={adminStyles.modalActions}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!formData.text || !formData.correct_answer || formData.options.some((o) => !o)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Students Tab ──────────────────────────────────────────────
function StudentsTab() {
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AdminStudent | null>(null);
  const [formData, setFormData] = useState({ usn: "", name: "", email: "", branch: "CS", password: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await fetchAdminStudents(); setStudents(data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    const usnRegex = /^[A-Z0-9]{5}[A-Z]{2}[0-9]{3}$/;
    if (!formData.usn) return alert("USN is required");
    // Unrestricted USN
    if (!formData.name) return alert("Name is required");
    if (!formData.branch) return alert("Branch is required");
    if (!editing && !formData.password) return alert("Password is required for new students");
    try {
      if (editing) {
        const updateData: any = {};
        if (formData.name) updateData.name = formData.name;
        if (formData.email) updateData.email = formData.email;
        if (formData.branch) updateData.branch = formData.branch;
        if (formData.password) updateData.password = formData.password;
        await updateAdminStudent(editing.student_id, updateData);
      } else {
        await createAdminStudent(formData);
      }
      setShowModal(false); setEditing(null);
      setFormData({ usn: "", name: "", email: "", branch: "CS", password: "" });
      load();
    } catch (e: any) { alert(e.message || "Failed to save student"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this student and all their exam data?")) return;
    try { await deleteAdminStudent(id); load(); } catch { alert("Failed to delete"); }
  };

  const handleResetExam = async (id: string) => {
    if (!confirm("Allow this student to retake the exam? This will clear all their previous answers and warnings.")) return;
    try { await resetAdminStudent(id); load(); alert("Exam state reset successfully."); }
    catch { alert("Failed to reset exam state"); }
  };

  return (
    <div className={adminStyles.managementPage}>
      <div className={adminStyles.header}>
        <h2 className={adminStyles.headerTitle}>Students ({students.length})</h2>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setFormData({ usn: "", name: "", email: "", branch: "CS", password: "" }); setShowModal(true); }}>
          + Add Student
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : students.length === 0 ? (
        <div className={adminStyles.empty}>No students yet. Add one to get started.</div>
      ) : (
        <div className={adminStyles.tableWrapper}>
          <table className={adminStyles.table}>
            <thead>
              <tr><th>#</th><th>USN</th><th>Name</th><th>Email</th><th>Branch</th><th>Status</th><th>Warnings</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.student_id}>
                  <td className="mono text-muted">{i + 1}</td>
                  <td className="mono">{s.usn}</td>
                  <td>{s.name}</td>
                  <td style={{ fontSize: 12 }}>{s.email || "—"}</td>
                  <td><span className="badge badge-neutral">{s.branch || "CS"}</span></td>
                  <td><StatusBadge status={s.status} lastActive={s.last_active} /></td>
                  <td><WarningBadge count={s.warnings} /></td>
                  <td>
                    <div className={adminStyles.actionButtons}>
                      <button className="btn btn-outline" onClick={() => { setEditing(s); setFormData({ usn: s.usn, name: s.name, email: s.email || "", branch: s.branch || "CS", password: "" }); setShowModal(true); }}>Edit</button>
                      <button className="btn btn-outline" onClick={() => { const p = prompt("Enter new password:"); if (p) updateAdminStudent(s.student_id, { password: p }).then(() => alert("Password reset")); }}>Reset PW</button>
                      <button className="btn btn-outline" style={{ color: "var(--accent)", borderColor: "var(--accent)" }} onClick={() => handleResetExam(s.student_id)}>Re-Exam</button>
                      <button className="btn btn-outline text-danger" onClick={() => handleDelete(s.student_id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className={adminStyles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={adminStyles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Edit Student" : "Add Student"}</h3>
            {!editing && (
              <div className={adminStyles.formGroup}>
                <label>USN NO</label>
                <input className={adminStyles.input} value={formData.usn} onChange={(e) => setFormData({ ...formData, usn: e.target.value.toUpperCase() })} placeholder="1MS21CS001" />
              </div>
            )}
            <div className={adminStyles.formGroup}>
              <label>Name</label>
              <input className={adminStyles.input} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className={adminStyles.formGroup}>
              <label>Email</label>
              <input className={adminStyles.input} type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="student@example.com" />
            </div>
            <div className={adminStyles.formGroup}>
              <label>Branch</label>
              <select className={adminStyles.input} value={formData.branch} onChange={(e) => setFormData({ ...formData, branch: e.target.value })}>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className={adminStyles.formGroup}>
              <label>{editing ? "New Password (leave blank to keep)" : "Password"}</label>
              <input type="password" className={adminStyles.input} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
            </div>
            <div className={adminStyles.modalActions}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!formData.name || (!editing && (!formData.usn || !formData.password))}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}