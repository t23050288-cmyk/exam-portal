"use client";
export const dynamic = 'force-dynamic';


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
  editAdminFolderBranch,
  uploadQuestionImage,
  fetchBranchExamSummary,
  updateExamConfig,
  AdminQuestion,
  AdminStudent,
  BranchExamSummary,
  forceSubmitAdminStudent,
  cleanupStaleSessions,
  fetchExamConfig,
  fetchPublicExamConfig,
  fetchStudentDetailedStats,
  StudentDetailedStats,
  StudentExamHistory,
} from "@/lib/api";
import { BRANCHES as BRANCH_LIST, BRANCH_IDS } from "@/lib/constants";
import styles from "./admin.module.css";
import adminStyles from "./admin-management.module.css";
import Skeleton from "@/components/Skeleton";

// ── Lazy-loaded new feature tabs ──────────────────────────────
import nextDynamic from "next/dynamic";
const LeaderboardPage = nextDynamic(() => import("@/components/admin/leaderboard/LeaderboardPage"), { ssr: false });
const IngestPage      = nextDynamic(() => import("@/components/admin/ingest/IngestPage"),      { ssr: false });
const OrbitalControl    = nextDynamic(() => import("@/components/admin/control-panel/ControlPage"),  { ssr: false });
const AdminDashboard    = nextDynamic(() => import("@/components/admin/AdminDashboard"),                { ssr: false });
const GradingQueue      = nextDynamic(() => import("@/components/admin/grading/GradingQueuePanel"),    { ssr: false });
const SOSAdminPage      = nextDynamic(() => import("@/app/admin/sos/page"),                         { ssr: false });
const PyHuntAdminTab    = nextDynamic(() => import("@/components/admin/PyHuntAdminTab"),                { ssr: false });
const AdminBackground   = nextDynamic(() => import("@/components/admin/AdminBackground"),                { ssr: false });


// ── Types ─────────────────────────────────────────────────────
interface StudentRow {
  student_id: string;
  usn: string;
  name: string;
  email: string | null;
  branch: string;
  status: "not_started" | "active" | "submitted";
  warnings: number;
  banned?: boolean;
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
const ALL_BRANCH_DATA = BRANCH_LIST;
type Tab = "monitor" | "dashboard" | "questions" | "students" | "leaderboard" | "ingest" | "control" | "grading" | "sos" | "pyhunt" | "analytics";
const ADMIN_AUTH_KEY = "examguard_admin_auth";

function getStoredAuth(): boolean {
  if (typeof window === "undefined") return false;
  try { return sessionStorage.getItem(ADMIN_AUTH_KEY) === "true"; } catch { return false; }
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
  const [mounted, setMounted] = useState(false);
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
  const [activeExamIds, setActiveExamIds] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAuthed(getStoredAuth());
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    try {
      if (authed) sessionStorage.setItem(ADMIN_AUTH_KEY, "true");
      else sessionStorage.removeItem(ADMIN_AUTH_KEY);
    } catch {}
  }, [authed, initialized]);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (pass === (process.env.NEXT_PUBLIC_ADMIN_SECRET || "rudranshsarvam")) {
      setAuthed(true);
    } else {
      setPassError("Incorrect admin password.");
    }
  };

  // Fetch active exam IDs for AdminDashboard
  const fetchActiveExams = useCallback(async () => {
    try {
      const cfg = await fetchExamConfig();
      if (cfg && cfg.id) setActiveExamIds([cfg.id]);
    } catch { /* ignore */ }
  }, []);

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
    // Build quizzes list from both config (even if no questions) and actual questions
    const buildQuizList = async () => {
      try {
        const configs = await fetchPublicExamConfig();
        const { questions: qs } = await fetchAdminQuestions();
        const list: BranchExamSummary[] = [];
        
        // 1. Add all named exams from config
        configs.forEach((c: any) => {
          if (c.exam_title && !list.find(x => x.exam_name === c.exam_title)) {
            list.push({ branch: "ALL", exam_name: c.exam_title, question_count: 0 });
          }
        });
        
        // 2. Add/Update based on questions (captures branch-specific counts)
        qs.forEach((q: any) => {
          const br = q.branch || "CS";
          const ex = q.exam_name || "ExamGuard Assessment";
          const existing = list.find(x => x.branch === br && x.exam_name === ex);
          if (!existing) {
            list.push({ branch: br, exam_name: ex, question_count: 1 });
          } else {
            existing.question_count++;
          }
        });
        setQuizzes(list);
      } catch (err) {
        console.error("[ADMIN] buildQuizList failed:", err);
      }
    };
    buildQuizList();

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

  const handleBanStudent = async (s: StudentRow) => {
    if (!confirm(`Ban ${s.name}? This will force-submit their exam and LOCK them out until you click Reset.`)) return;
    try {
      // Force submit first
      if (s.status === "active") {
        await forceSubmitAdminStudent(s.student_id);
      }
      // Then mark as banned in Supabase students table
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await sb.from("students").update({ is_banned: true }).eq("id", s.student_id);
      await fetchStudents();
      alert(`${s.name} has been banned and their exam force-submitted.`);
    } catch (err: any) {
      alert("Ban failed: " + err.message);
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

  if (!mounted) return null;

  if (!authed) {
    return (
      <div className={styles.pageCenter}>
        <AdminBackground />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={styles.loginCard}
        >
          <div className={styles.loginHeader}>
            <div className={styles.loginIconWrap}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#28D7D6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              <div className={styles.loginIconGlow} />
            </div>
            <h1 className={styles.loginTitle}>EXAM GUARD</h1>
            <p className={styles.loginSubtitle}>SYSTEM ADMINISTRATION NODE</p>
          </div>

          <form onSubmit={handleAuth} className={styles.loginForm}>
            <div className={styles.loginInputWrap}>
              <svg className={styles.loginInputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                type="password"
                className={styles.loginInput}
                placeholder="Access Key"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoFocus
              />
            </div>
            
            <AnimatePresence>
              {passError && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={styles.loginError}
                >
                  {passError}
                </motion.p>
              )}
            </AnimatePresence>

            <button type="submit" className={styles.loginBtn}>
              INITIALIZE COMMAND
            </button>
            
            <div className={styles.loginFooter}>
              <span className={styles.footerDot} />
              Secured Academic Intelligence Interface
            </div>
          </form>
        </motion.div>
      </div>
    );
  }


  const TAB_CONFIG: { id: Tab; label: string; icon: string }[] = [
    { id: "monitor",     label: "Monitor",     icon: "📡" },
    { id: "dashboard",   label: "Dashboard",   icon: "📊" },
    { id: "leaderboard", label: "Leaderboard", icon: "⚡" },
    { id: "questions",   label: "Questions",   icon: "📋" },
    { id: "students",    label: "Students",    icon: "👥" },
    { id: "ingest",      label: "Harvester",   icon: "🌌" },
    { id: "control",     label: "Control",     icon: "🛸" },
    { id: "grading",     label: "Grading",     icon: "⚙️" },
    { id: "sos",         label: "SOS",         icon: "🆘" },
    { id: "pyhunt",      label: "PyHunt",      icon: "🐍" },
    { id: "analytics",   label: "Analytics",   icon: "📊" },
  ];

  return (
    <div className={styles.page}>
      <AdminBackground />
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
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {s.status === "active" && (
                            <button className="btn btn-outline" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => handleForceSubmit(s)}>
                              Submit
                            </button>
                          )}
                          {/* BAN: force-submit + lock until admin resets */}
                          {!s.banned && s.status !== "submitted" && (
                            <button
                              style={{ fontSize: 10, padding: "4px 8px", borderRadius: 6, border: "1px solid #ef4444", background: "rgba(239,68,68,0.12)", color: "#ef4444", cursor: "pointer", fontWeight: 700 }}
                              onClick={() => handleBanStudent(s)}
                              title="Force submit & lock — student cannot re-take until Reset"
                            >
                              🚫 Ban
                            </button>
                          )}
                          {s.banned && (
                            <span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 6, background: "rgba(239,68,68,0.08)", color: "#ef4444", fontWeight: 700, border: "1px solid rgba(239,68,68,0.2)" }}>
                              🔒 Banned
                            </span>
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
      {activeTab === "dashboard"   && <AdminDashboard examId={activeExamIds[0] || ""} />}
      {activeTab === "grading"     && <GradingQueue />}
      {activeTab === "ingest"      && <IngestPage />}
      {activeTab === "control"     && <OrbitalControl />}
      {activeTab === "questions"   && <QuestionsTab />}
      {activeTab === "students"    && <StudentsTab />}
      {activeTab === "sos"         && <SOSAdminPage />}
      {activeTab === "pyhunt"      && <PyHuntAdminTab />}
      {activeTab === "analytics"   && <AnalyticsTab />}
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

// ── Analytics Tab ─────────────────────────────────────────────
function AnalyticsTab() {
  const [stats, setStats] = useState<StudentDetailedStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentDetailedStats | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStudentDetailedStats(branchFilter, categoryFilter);
      setStats(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [branchFilter, categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = stats.filter(s => 
    (s.name || "").toLowerCase().includes(search.toLowerCase()) || 
    (s.usn || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={adminStyles.managementPage}>
      <div className={adminStyles.header}>
        <h2 className={adminStyles.headerTitle}>Academic Analytics</h2>
        <div style={{ display: "flex", gap: 12 }}>
          <select 
            className={adminStyles.input} 
            value={branchFilter} 
            onChange={(e) => setBranchFilter(e.target.value)}
            style={{ width: 140, height: 38, fontSize: 13 }}
          >
            <option value="all">All Branches</option>
            {ALL_BRANCH_DATA.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select 
            className={adminStyles.input} 
            value={categoryFilter} 
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ width: 140, height: 38, fontSize: 13 }}
          >
            <option value="all">All Categories</option>
            <option value="Aptitude">Aptitude</option>
            <option value="Programming">Programming</option>
            <option value="Others">Others</option>
          </select>
          <div style={{ position: "relative" }}>
            <input 
              className={adminStyles.input}
              placeholder="Search USN or Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 34, width: 220, height: 38, fontSize: 13 }}
            />
            <span style={{ position: "absolute", left: 10, top: 9, opacity: 0.4 }}>🔍</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className={adminStyles.empty}>No matching student records found.</div>
      ) : (
        <div className={adminStyles.tableWrapper}>
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Branch</th>
                <th>Exams Done</th>
                <th>Avg. Score</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.student_id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span className="mono text-muted" style={{ fontSize: 11 }}>{s.usn}</span>
                    </div>
                  </td>
                  <td><span className="badge badge-neutral" style={{ fontSize: 11 }}>{s.branch}</span></td>
                  <td className="mono" style={{ textAlign: "center", fontWeight: 700 }}>{s.exams_completed}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 60, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${s.average_percentage}%`, height: "100%", background: s.average_percentage >= 70 ? "#10b981" : s.average_percentage >= 40 ? "#f59e0b" : "#ef4444", boxShadow: "0 0 8px currentColor" }} />
                      </div>
                      <span style={{ fontWeight: 800, fontSize: 13, minWidth: 35 }}>{s.average_percentage}%</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>{s.last_exam_at ? new Date(s.last_exam_at).toLocaleDateString() : "—"}</td>
                  <td>
                    <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 12, borderRadius: 8 }} onClick={() => setSelectedStudent(s)}>
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {selectedStudent && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={adminStyles.modalOverlay}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={adminStyles.modal} 
              style={{ maxWidth: 650, borderRadius: 20 }}
            >
              <div className={adminStyles.modalHeader} style={{ padding: "24px 28px" }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{selectedStudent.name}</h3>
                  <p style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>{selectedStudent.usn} · {selectedStudent.branch} · {selectedStudent.email || "No Email"}</p>
                </div>
                <button className={adminStyles.closeBtn} onClick={() => setSelectedStudent(null)} style={{ fontSize: 24 }}>×</button>
              </div>
              
              <div style={{ padding: "0 28px 28px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
                  <div style={{ background: "rgba(139, 92, 246, 0.05)", padding: 18, borderRadius: 16, border: "1px solid rgba(139, 92, 246, 0.15)" }}>
                    <div style={{ fontSize: 11, color: "#a78bfa", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Assessments Completed</div>
                    <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{selectedStudent.exams_completed}</div>
                  </div>
                  <div style={{ background: "rgba(45, 212, 191, 0.05)", padding: 18, borderRadius: 16, border: "1px solid rgba(45, 212, 191, 0.15)" }}>
                    <div style={{ fontSize: 11, color: "#2dd4bf", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Academic Proficiency</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "#2dd4bf", marginTop: 4 }}>{selectedStudent.average_percentage}%</div>
                  </div>
                </div>

                <h4 style={{ fontSize: 12, fontWeight: 800, marginBottom: 14, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Session History</h4>
                <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 6 }}>
                  {selectedStudent.history.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", opacity: 0.4, border: "1px dashed var(--border)", borderRadius: 12 }}>No session records discovered.</div>
                  ) : selectedStudent.history.map((h, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 14, transition: "transform 0.2s" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{h.exam_title}</div>
                        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                          {new Date(h.submitted_at).toLocaleDateString()} at {new Date(h.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · <span style={{ color: "var(--accent-light)", fontWeight: 600 }}>{h.category}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 900, fontSize: 18, color: "var(--text-primary)" }}>{h.score} <span style={{ fontSize: 13, opacity: 0.4, fontWeight: 500 }}>/ {h.total_marks}</span></div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: h.percentage >= 70 ? "#10b981" : h.percentage >= 40 ? "#f59e0b" : "#ef4444", marginTop: 2 }}>{h.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Questions Tab (unchanged logic, kept here) ────────────────
function QuestionsTab() {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [formData, setFormData] = useState<Omit<AdminQuestion, "id">>({ 
    text: "", 
    options: ["", "", "", ""], 
    branch: "CS", 
    correct_answer: "", 
    order_index: 0, 
    marks: 1, 
    exam_name: "General Assessment",
    image_url: "",
    audio_url: "",
    category: "Others"
  });
  const [folderBranchModal, setFolderBranchModal] = useState<{ name: string, branches: string[] } | null>(null);
  const [activeExamTitles, setActiveExamTitles] = useState<string[]>([]);


  const load = useCallback(async () => {
    setLoading(true);
    try { 
      const data = await fetchAdminQuestions(); 
      setQuestions(data.questions); 
      
      const configRes = await fetch('/api/admin/exam/config/public').then(r => r.json());
      const activeTitles = (configRes || []).filter((c: any) => c.is_active).map((c: any) => c.exam_title);
      setActiveExamTitles(activeTitles);
    }
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
      setFormData({ text: "", options: ["", "", "", ""], branch: "CS", correct_answer: "", order_index: questions.length, marks: 1, exam_name: "General Assessment", image_url: "", audio_url: "", category: "Others" });
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

  const handleEditBranchFolder = (folderName: string) => {
    // Find current branch of this folder (from first question)
    const currentBranchStr = questions.find(q => q.exam_name === folderName)?.branch || "CS";
    // Branches are stored padded with commas e.g. ",CS,BCA-1," so we split them
    const currentBranches = currentBranchStr.split(",").map(b => b.trim()).filter(Boolean);
    if (currentBranches.length === 0) currentBranches.push("CS");
    setFolderBranchModal({ name: folderName, branches: currentBranches });
  };

  const handleSaveFolderBranch = async () => {
    if (!folderBranchModal) return;
    if (folderBranchModal.branches.length === 0) {
      alert("Please select at least one branch.");
      return;
    }
    try {
      setLoading(true);
      await editAdminFolderBranch(folderBranchModal.name, folderBranchModal.branches);
      const newBranchStr = `,${folderBranchModal.branches.join(",")},`;
      setQuestions(questions.map(q => 
        q.exam_name === folderBranchModal.name ? { ...q, branch: newBranchStr } : q
      ));
      setFolderBranchModal(null);
    } catch (error: any) {
      alert(`Failed to update branch: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleActivateFolder = async (folderName: string) => {
    try {
      setLoading(true);
      await updateExamConfig({ exam_title: folderName, is_active: true });
      setActiveExamTitles(prev => prev.includes(folderName) ? prev : [...prev, folderName]);
      alert(`Successfully activated exam: ${folderName}`);
    } catch (error: any) {
      alert(`Failed to activate exam: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateFolder = async (folderName: string) => {
    if (!confirm(`Deactivate "${folderName}"? Students will no longer be able to access questions.`)) return;
    try {
      setLoading(true);
      await updateExamConfig({ exam_title: folderName, is_active: false });
      setActiveExamTitles(prev => prev.filter(t => t !== folderName));
      alert(`Exam "${folderName}" has been deactivated.`);
    } catch (error: any) {
      alert(`Failed to deactivate exam: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Schedule + Duration Modal State ──
  const [configModal, setConfigModal] = useState<{ name: string; mode: "schedule" | "duration" } | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [durationMin, setDurationMin] = useState("30");

  const handleScheduleFolder = async (folderName: string) => {
    if (!scheduleDate || !scheduleTime) { alert("Please set both date and time."); return; }
    const scheduled = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    try {
      setLoading(true);
      await updateExamConfig({ exam_title: folderName, scheduled_start: scheduled, is_active: true });
      setActiveExamTitles(prev => prev.includes(folderName) ? prev : [...prev, folderName]);
      setConfigModal(null);
      alert(`Exam "${folderName}" scheduled for ${scheduleDate} at ${scheduleTime}. It will auto-start for students at that time.`);
    } catch (error: any) {
      alert(`Failed to schedule exam: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetDuration = async (folderName: string) => {
    const mins = parseInt(durationMin, 10);
    if (isNaN(mins) || mins < 1) { alert("Enter a valid duration (1+ minutes)."); return; }
    try {
      setLoading(true);
      await updateExamConfig({ exam_title: folderName, duration_minutes: mins });
      setConfigModal(null);
      alert(`Exam "${folderName}" duration set to ${mins} minutes.`);
    } catch (error: any) {
      alert(`Failed to set duration: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Attempts Modal State ──
  const [attemptsModal, setAttemptsModal] = useState<{ name: string } | null>(null);
  const [attemptsValue, setAttemptsValue] = useState("1");

  const handleSetAttempts = async (folderName: string) => {
    const val = parseInt(attemptsValue, 10);
    if (isNaN(val) || val < 1) { alert("Enter a valid number of attempts (1+)."); return; }
    try {
      setLoading(true);
      await updateExamConfig({ exam_title: folderName, max_attempts: val });
      setAttemptsModal(null);
      alert(`Exam "${folderName}" max attempts set to ${val}.`);
    } catch (error: any) {
      alert(`Failed to set attempts: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredQuestions = questions.filter((q) => {
    const branchMatch = selectedBranch === "All" || q.branch === selectedBranch;
    const categoryMatch = selectedCategory === "All" || q.category === selectedCategory;
    return branchMatch && categoryMatch;
  });

  // Group by exam_name and branch
  const clusters: Record<string, AdminQuestion[]> = {};
  filteredQuestions.forEach(q => {
    const name = q.exam_name || "Uncategorized";
    const branch = q.branch || "CS";
    const clusterKey = `${name}|${branch}`;
    if (!clusters[clusterKey]) clusters[clusterKey] = [];
    clusters[clusterKey].push(q);
  });

  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});
  const toggleCluster = (key: string) => setExpandedClusters(prev => ({ ...prev, [key]: !prev[key] }));

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
          <select className={adminStyles.input} style={{ width: 140, height: 36, padding: "0 8px", fontSize: 13 }}
            value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="All">All Categories</option>
            <option value="Aptitude">Aptitude</option>
            <option value="Programming">Programming</option>
            <option value="Others">Others</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setFormData({ text: "", options: ["", "", "", ""], branch: "CS", correct_answer: "", order_index: questions.length, marks: 1, exam_name: "General Assessment", image_url: "", category: "Others" }); setShowModal(true); }}>
          + Add Question
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : filteredQuestions.length === 0 ? (
        <div className={adminStyles.empty}>No questions found for branch: {selectedBranch}</div>
      ) : (
        <div className={adminStyles.managementGrid}>
          <AnimatePresence mode="popLayout">
            {Object.entries(clusters).map(([clusterKey, clusterQuestions], idx) => {
              const [name, branch] = clusterKey.split("|");
              const palette = CARD_PALETTE[idx % CARD_PALETTE.length];
              const diff = inferDifficulty(name);
              const diffStyle = DIFF_COLORS[diff];
              const desc = inferDescription(name);
              const branchList = [branch];
              const skills = inferSkills(name, branchList);

              return (
                <React.Fragment key={clusterKey}>
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.35 }}
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
                    onClick={() => toggleCluster(clusterKey)}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 22 }}>{palette.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 16, color: palette.accent, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
                          {name} <small style={{ fontWeight: 400, opacity: 0.7 }}>({branch})</small>
                        </div>
                      </div>
                      {!expandedClusters[clusterKey] && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                          {/* 0. ATTEMPTS */}
                          <button
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1px solid rgba(255,152,0,0.4)", background: "rgba(255,152,0,0.08)", color: "#ff9800", cursor: "pointer", fontWeight: 700 }}
                            onClick={(e) => { e.stopPropagation(); setAttemptsModal({ name }); setAttemptsValue("1"); }}
                          >🔄 Attempts</button>
                          {/* 1. ACTIVATE */}
                          {activeExamTitles.includes(name) ? (
                            <>
                              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, background: "rgba(46,125,50,0.1)", color: "#2e7d32", border: "1px solid rgba(46,125,50,0.2)", fontWeight: 700, display: "flex", alignItems: "center" }}>
                                ✅ Active
                              </span>
                              {/* 2. DEACTIVATE */}
                              <button
                                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1px solid rgba(211,47,47,0.3)", background: "transparent", color: "var(--danger)", cursor: "pointer", fontWeight: 600 }}
                                onClick={(e) => { e.stopPropagation(); handleDeactivateFolder(name); }}
                              >Deactivate</button>
                            </>
                          ) : (
                            <button
                              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: `1px solid var(--success)`, background: "transparent", color: "var(--success)", cursor: "pointer", fontWeight: 700 }}
                              onClick={(e) => { e.stopPropagation(); handleActivateFolder(name); }}
                            >Activate</button>
                          )}
                          {/* 3. SCHEDULE */}
                          <button
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1px solid rgba(25,118,210,0.4)", background: "transparent", color: "#1976d2", cursor: "pointer", fontWeight: 600 }}
                            onClick={(e) => { e.stopPropagation(); setConfigModal({ name, mode: "schedule" }); setScheduleDate(""); setScheduleTime(""); }}
                          >📅 Schedule</button>
                          {/* 4. DURATION */}
                          <button
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1px solid rgba(103,58,183,0.4)", background: "transparent", color: "#7c4dff", cursor: "pointer", fontWeight: 600 }}
                            onClick={(e) => { e.stopPropagation(); setConfigModal({ name, mode: "duration" }); setDurationMin("30"); }}
                          >🕐 Timings</button>
                          <button
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: `1px solid ${palette.border}`, background: "transparent", color: palette.accent, cursor: "pointer", fontWeight: 600 }}
                            onClick={(e) => { e.stopPropagation(); handleRenameFolder(name); }}
                          >Rename</button>
                          <button
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: `1px solid ${palette.border}`, background: "transparent", color: palette.accent, cursor: "pointer", fontWeight: 600 }}
                            onClick={(e) => { e.stopPropagation(); handleEditBranchFolder(name); }}
                          >Edit Branch</button>
                          <button
                            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, border: "1px solid rgba(211,47,47,0.3)", background: "transparent", color: "var(--danger)", cursor: "pointer", fontWeight: 600 }}
                            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(name); }}
                          >Delete</button>
                        </div>
                      )}
                    </div>

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

                    <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 14 }}>
                      {desc}
                    </p>

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

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${palette.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                          📋 {clusterQuestions.length} question{clusterQuestions.length !== 1 ? "s" : ""}
                        </span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          {clusterQuestions[0]?.category || "Others"}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: palette.accent, fontWeight: 700 }}>
                        {expandedClusters[clusterKey] ? "▲ Collapse" : "▼ View Questions"}
                      </span>
                    </div>
                  </motion.div>

                  <AnimatePresence>
                    {expandedClusters[clusterKey] && (
                      <motion.div
                        style={{ gridColumn: "1 / -1" }}
                        className={adminStyles.isolationView}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <div className={adminStyles.nodeManagementHeader}>
                          <div className={adminStyles.nodeInfo}>
                            <h4 style={{ margin: 0, color: palette.accent }}>{name} ({branch})</h4>
                            <small style={{ color: "var(--text-muted)" }}>{clusterQuestions.length} Questions</small>
                          </div>
                          <div className={adminStyles.nodeActions}>
                            {activeExamTitles.includes(name) ? (
                              <>
                                <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, background: "rgba(46,125,50,0.1)", color: "#2e7d32", border: "1px solid rgba(46,125,50,0.2)", fontWeight: 700, display: "flex", alignItems: "center" }}>
                                  ✅ Active
                                </span>
                                <button className="btn btn-outline btn-danger" style={{ fontSize: 12, padding: "4px 12px" }}
                                  onClick={() => handleDeactivateFolder(name)}>Deactivate</button>
                              </>
                            ) : (
                              <button className="btn btn-outline" style={{ fontSize: 12, padding: "4px 12px", color: "var(--success)", borderColor: "var(--success)" }}
                                onClick={() => handleActivateFolder(name)}>Activate</button>
                            )}

                            <button className="btn btn-outline" style={{ fontSize: 12, padding: "4px 12px" }}
                              onClick={() => handleRenameFolder(name)}>Rename</button>
                            <button className="btn btn-outline" style={{ fontSize: 12, padding: "4px 12px" }}
                              onClick={() => handleEditBranchFolder(name)}>Edit Branch</button>
                            <button className="btn btn-outline btn-danger" style={{ fontSize: 12, padding: "4px 12px" }}
                              onClick={() => handleDeleteFolder(name)}>Delete Folder</button>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                          {clusterQuestions.map((q) => (
                            <div key={q.id} className={adminStyles.card} style={{ margin: 0 }}>
                              <div className={adminStyles.cardHeader}>
                                <div className={adminStyles.cardIndex} style={{ fontSize: 11, fontWeight: 700, color: palette.accent }}>Q{q.order_index + 1}</div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button className="btn btn-outline" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => { setEditing(q); setFormData({ ...q }); setShowModal(true); }}>Edit</button>
                                  <button className="btn btn-outline btn-danger" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => handleDelete(q.id)}>Delete</button>
                                </div>
                              </div>
                              {q.image_url && (
                                <div className={adminStyles.cardThumbnailContainer}>
                                  <img src={q.image_url} alt="Thumbnail" className={adminStyles.cardThumbnail} />
                                </div>
                              )}
                              {q.audio_url && (
                                <div style={{ padding: "6px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 10, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                                  <span style={{ fontSize: 16 }}>🎵</span>
                                  <audio src={q.audio_url} controls style={{ height: 24, flex: 1, filter: "invert(1) hue-rotate(180deg) brightness(1.5)" }} />
                                </div>
                              )}
                              <p className={adminStyles.cardText} style={{ fontSize: 14 }}>{q.text}</p>
                              <div className={adminStyles.cardFooter} style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                                <span className="badge badge-neutral" style={{ fontSize: 10 }}>{q.branch}</span>
                                <span className="badge badge-neutral" style={{ fontSize: 10 }}>{q.marks} Marks</span>
                                <span className="badge badge-neutral" style={{ fontSize: 10, background: "rgba(99,102,241,0.1)", color: "#a5b4fc" }}>{q.category || "Others"}</span>
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
                <select 
                  className={adminStyles.input}
                  value={Array.from(new Set(questions.map(q => q.exam_name))).includes(formData.exam_name) ? formData.exam_name : "NEW_IDENTITY"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "NEW_IDENTITY") {
                      setFormData({ ...formData, exam_name: "" });
                    } else {
                      setFormData({ ...formData, exam_name: val });
                    }
                  }}
                >
                  <option value="">Select Identity...</option>
                  {Array.from(new Set(questions.map(q => q.exam_name))).filter(Boolean).sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  <option value="NEW_IDENTITY">+ Add New Identity</option>
                </select>
                {(formData.exam_name === "" || !Array.from(new Set(questions.map(q => q.exam_name))).includes(formData.exam_name)) && (
                  <input
                    type="text"
                    className={adminStyles.input}
                    placeholder="Enter New Identity Name..."
                    style={{ marginTop: 8 }}
                    value={formData.exam_name}
                    onChange={(e) => setFormData({ ...formData, exam_name: e.target.value })}
                  />
                )}
              </div>
              <div className={adminStyles.formGroup}>
                <label>Branch</label>
                <select className={adminStyles.input} value={formData.branch} onChange={(e) => setFormData({ ...formData, branch: e.target.value })}>
                  {ALL_BRANCH_DATA.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className={adminStyles.formGroup}>
                <label>Category</label>
                <select className={adminStyles.input} value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                  <option value="Aptitude">Aptitude</option>
                  <option value="Programming">Programming</option>
                  <option value="Others">Others</option>
                </select>
              </div>
            </div>

            <div className={adminStyles.formGroup} style={{ marginTop: 16 }}>
              <label>Media Assets</label>
              <div className={adminStyles.mediaSplit}>
                {/* Image Section */}
                <div className={adminStyles.mediaBox}>
                  <div className={adminStyles.mediaLabel}>Image (Photo)</div>
                  {formData.image_url ? (
                    <div className={adminStyles.imagePreviewContainer} style={{ height: 120 }}>
                      <img src={formData.image_url} alt="Question" className={adminStyles.imagePreview} style={{ maxHeight: 120 }} />
                      <button 
                        className={adminStyles.removeImageBtn}
                        onClick={() => setFormData({ ...formData, image_url: "" })}
                        title="Remove Image"
                        type="button"
                        style={{ width: 20, height: 20, fontSize: 14 }}
                      >×</button>
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
                            const res = await uploadQuestionImage(file);
                            setFormData({ ...formData, image_url: res.url });
                          } catch (err: any) {
                            alert(`Image upload failed: ${err.message}`);
                          }
                        }}
                      />
                      <label htmlFor="question-image-upload" style={{ cursor: "pointer", display: "block", padding: "12px", textAlign: "center" }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>🖼️</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Upload Photo</div>
                      </label>
                    </div>
                  )}
                </div>

                {/* Audio Section */}
                <div className={adminStyles.mediaBox}>
                  <div className={adminStyles.mediaLabel}>Audio (Music)</div>
                  {(formData as any).audio_url ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: 8, height: 120, justifyContent: "center" }}>
                      <audio src={(formData as any).audio_url} controls style={{ width: "100%", height: 32 }} />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, audio_url: "" } as any)}
                        className="btn btn-outline btn-sm"
                        style={{ color: "#f87171", borderColor: "rgba(248,113,113,0.3)", fontSize: 11 }}
                      >Remove Audio</button>
                    </div>
                  ) : (
                    <div className={adminStyles.uploadZone}>
                      <input 
                        type="file" 
                        id="question-audio-upload" 
                        style={{ display: "none" }}
                        accept="audio/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const res = await uploadQuestionImage(file);
                            setFormData({ ...formData, audio_url: res.url } as any);
                          } catch (err: any) {
                            alert(`Audio upload failed: ${err.message}`);
                          }
                        }}
                      />
                      <label htmlFor="question-audio-upload" style={{ cursor: "pointer", display: "block", padding: "12px", textAlign: "center" }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>🎵</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Upload Audio</div>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className={adminStyles.modalActions}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!formData.text || !formData.correct_answer || formData.options.some((o) => !o)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {folderBranchModal && (
        <div className={adminStyles.modalOverlay} onClick={() => setFolderBranchModal(null)}>
          <div className={adminStyles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3>Edit Folder Branch</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Updating the branches for <strong>{folderBranchModal.name}</strong> will affect all questions inside it.
            </p>
            <div className={adminStyles.formGroup}>
              <label>Select Branches</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                {ALL_BRANCH_DATA.map((b) => (
                  <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={folderBranchModal.branches.includes(b.id)}
                      onChange={(e) => {
                        const newBranches = e.target.checked 
                          ? [...folderBranchModal.branches, b.id]
                          : folderBranchModal.branches.filter(id => id !== b.id);
                        setFolderBranchModal({ ...folderBranchModal, branches: newBranches });
                      }}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>
            <div className={adminStyles.modalActions} style={{ marginTop: 24 }}>
              <button className="btn btn-outline" onClick={() => setFolderBranchModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveFolderBranch}>Update Branches</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule / Duration Config Modal ── */}
      {configModal && (
        <div className={adminStyles.modalOverlay} onClick={() => setConfigModal(null)}>
          <div className={adminStyles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            {configModal.mode === "schedule" ? (
              <>
                <h3>📅 Schedule Exam</h3>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                  Set a date and time for <strong>{configModal.name}</strong> to auto-start for students.
                </p>
                <div className={adminStyles.formGroup}>
                  <label>Date</label>
                  <input
                    type="date"
                    className={adminStyles.input}
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className={adminStyles.formGroup} style={{ marginTop: 12 }}>
                  <label>Time</label>
                  <input
                    type="time"
                    className={adminStyles.input}
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                {scheduleDate && scheduleTime && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px", borderRadius: 10,
                    background: "rgba(25,118,210,0.08)", border: "1px solid rgba(25,118,210,0.2)",
                    fontSize: 13, color: "#64b5f6",
                  }}>
                    ⏰ Exam will auto-start at: <strong>{scheduleDate} {scheduleTime}</strong>
                  </div>
                )}
                <div className={adminStyles.modalActions} style={{ marginTop: 24 }}>
                  <button className="btn btn-outline" onClick={() => setConfigModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={() => handleScheduleFolder(configModal.name)} disabled={!scheduleDate || !scheduleTime}>
                    Set Schedule
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>🕐 Set Exam Duration</h3>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                  Set how long <strong>{configModal.name}</strong> will last. Students get exactly this much time.
                </p>
                <div className={adminStyles.formGroup}>
                  <label>Duration (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    className={adminStyles.input}
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value)}
                    placeholder="e.g. 20"
                    style={{ width: "100%", fontSize: 16, fontWeight: 700 }}
                  />
                </div>
                <div style={{
                  display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap",
                }}>
                  {[10, 15, 20, 30, 45, 60, 90, 120].map(m => (
                    <button
                      key={m}
                      onClick={() => setDurationMin(String(m))}
                      style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                        cursor: "pointer",
                        border: durationMin === String(m) ? "1px solid #7c4dff" : "1px solid rgba(255,255,255,0.1)",
                        background: durationMin === String(m) ? "rgba(124,77,255,0.15)" : "rgba(255,255,255,0.03)",
                        color: durationMin === String(m) ? "#b388ff" : "var(--text-muted)",
                      }}
                    >{m} min</button>
                  ))}
                </div>
                {parseInt(durationMin) > 0 && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px", borderRadius: 10,
                    background: "rgba(103,58,183,0.08)", border: "1px solid rgba(103,58,183,0.2)",
                    fontSize: 13, color: "#b388ff",
                  }}>
                    ⏱️ Exam duration: <strong>{durationMin} minutes</strong> (dynamically applied)
                  </div>
                )}
                <div className={adminStyles.modalActions} style={{ marginTop: 24 }}>
                  <button className="btn btn-outline" onClick={() => setConfigModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={() => handleSetDuration(configModal.name)} disabled={!durationMin || parseInt(durationMin) < 1}>
                    Save Duration
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Attempts Modal ── */}
      {attemptsModal && (
        <div className={adminStyles.modalOverlay} onClick={() => setAttemptsModal(null)}>
          <div className={adminStyles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: 8 }}>🔄 Set Max Attempts</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              Set how many times a student can attempt <strong>{attemptsModal.name}</strong>.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
                  Maximum Attempts
                </label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={attemptsValue}
                  onChange={(e) => setAttemptsValue(e.target.value)}
                  className={adminStyles.input}
                  style={{ width: "100%", textAlign: "center", fontSize: 18, fontWeight: 800, padding: "12px" }}
                  placeholder="1"
                />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={() => setAttemptsModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => handleSetAttempts(attemptsModal.name)} disabled={!attemptsValue || parseInt(attemptsValue) < 1}>
                  Save Attempts
                </button>
              </div>
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
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{created:number;skipped:number;errors:any[]}|null>(null);
  const [infoStudent, setInfoStudent] = useState<any>(null);
  const [pyHuntProgress, setPyHuntProgress] = useState<any>(null);
  const [examResults, setExamResults] = useState<any[]>([]);
  const [examConfigs, setExamConfigs] = useState<any[]>([]);
  const [branchFilter, setBranchFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [infoCatTab, setInfoCatTab] = useState("all");

  const handleExportStudents = () => {
    const headers = ["Name", "USN", "Email", "Branch", "Status", "Warnings", "Submitted At"];
    const rows = students.map(s => [
      s.name, s.usn, s.email || "", s.branch, s.status, s.warnings, s.submitted_at || ""
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `students_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setCsvUploading(true); setCsvResult(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/admin/students/bulk", {
        method:"POST", headers:{"x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET||"rudranshsarvam"}, body:fd
      });
      setCsvResult(await r.json()); load();
    } catch (err:any) { setCsvResult({created:0,skipped:0,errors:[{error:err.message}]}); }
    finally { setCsvUploading(false); e.target.value=""; }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stData = await fetchAdminStudents();
      const [resR, cfgR, qR, phR] = await Promise.all([
        supabase.from("exam_results").select("student_id, exam_title, category, score, total_marks, submitted_at"),
        supabase.from("exam_config").select("exam_title, category, is_active"),
        supabase.from("questions").select("exam_name, branch, category"),
        supabase.from("pyhunt_progress").select("student_id, current_round, status")
      ]);

      setStudents(stData || []);
      setExamResults(resR.data || []);
      setExamConfigs(cfgR.data || []);
      (window as any).__examBranchMap = qR.data || [];
      (window as any).__pyHuntSessions = phR.data || [];
    }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { 
    load(); 
    // Real-time subscription for students and exam_status
    const channel = supabase
      .channel("admin-students-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_status" }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load]);


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

  const handleShowInfo = async (student: AdminStudent) => {
    setInfoStudent(student);
    setPyHuntProgress(null);
    try {
      const { data, error } = await supabase
        .from("pyhunt_progress")
        .select("*")
        .eq("student_id", student.usn) // Assuming USN is used as student_id in progress
        .single();
      if (data) setPyHuntProgress(data);
    } catch (err) {
      console.error("Failed to fetch PyHunt progress:", err);
    }
  };

  const [deleteAllCount, setDeleteAllCount] = React.useState(0);
  const [deleteAllTimer, setDeleteAllTimer] = React.useState<ReturnType<typeof setTimeout> | null>(null);

  const handleDeleteAll = async () => {
    const newCount = deleteAllCount + 1;
    setDeleteAllCount(newCount);
    if (deleteAllTimer) clearTimeout(deleteAllTimer);
    const t = setTimeout(() => setDeleteAllCount(0), 3000);
    setDeleteAllTimer(t);
    if (newCount >= 3) {
      setDeleteAllCount(0);
      if (deleteAllTimer) clearTimeout(deleteAllTimer);
      try {
        for (const s of students) { await deleteAdminStudent(s.student_id); }
        load();
        alert("All students deleted successfully.");
      } catch { alert("Failed to delete all students."); }
    }
  };

  return (
    <div className={adminStyles.managementPage}>
      <div className={adminStyles.header}>
        <h2 className={adminStyles.headerTitle}>Students ({students.length})</h2>
        <div style={{ display: "flex", gap: 12 }}>
          {/* Branch & Category Selects */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            <select className={adminStyles.input} style={{ width: 140, height: 38, padding: "0 10px", fontSize: 13, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}
              value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="all">All Branches</option>
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select className={adminStyles.input} style={{ width: 140, height: 38, padding: "0 10px", fontSize: 13, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}
              value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="all">All Categories</option>
              <option value="Aptitude">Aptitude</option>
              <option value="Programming">Programming</option>
              <option value="Others">Others</option>
            </select>
          </div>

          <button
            className="btn btn-outline"
            onClick={handleDeleteAll}
            style={{ color: deleteAllCount > 0 ? "#f87171" : undefined, borderColor: deleteAllCount > 0 ? "#f87171" : undefined, fontSize: 13, height: 38 }}
          >
            🗑️ Delete All {deleteAllCount > 0 ? `(${deleteAllCount}/3)` : ""}
          </button>
          
          <button className="btn btn-primary" style={{ height: 38 }} onClick={() => { setEditing(null); setFormData({ usn: "", name: "", email: "", branch: "CS", password: "" }); setShowModal(true); }}>
            + Add Student
          </button>

          <label className="btn btn-outline" style={{ height: 38, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            📁 Bulk Upload
            <input type="file" accept=".csv" style={{ display: "none" }} onChange={handleCsvUpload} disabled={csvUploading} />
          </label>
          
          <button onClick={handleExportStudents} style={{ padding:"0 16px", height: 38, borderRadius:10, border:"1px solid #10b981", background:"transparent", color:"#34d399", fontSize:13, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
            📥 Export CSV
          </button>
        </div>
      </div>

      {csvResult && (
        <div style={{ margin: "20px 0", padding: "16px 24px", background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 24 }}>
              <div><span style={{ color: "#10b981", fontWeight: 700 }}>{csvResult.created ?? 0}</span> <span style={{ opacity: 0.7, fontSize: 13 }}>Created</span></div>
              <div><span style={{ color: "#f59e0b", fontWeight: 700 }}>{csvResult.skipped ?? 0}</span> <span style={{ opacity: 0.7, fontSize: 13 }}>Skipped</span></div>
              {csvResult.errors?.length > 0 && <div><span style={{ color: "#ef4444", fontWeight: 700 }}>{csvResult.errors.length}</span> <span style={{ opacity: 0.7, fontSize: 13 }}>Errors</span></div>}
            </div>
            <button onClick={() => setCsvResult(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>✕</button>
          </div>
          {csvResult.errors?.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#fca5a5", maxHeight: 100, overflowY: "auto" }}>
              {csvResult.errors.slice(0, 5).map((e: any, i: number) => (
                <div key={i}>• {e.usn || e.line}: {e.error}</div>
              ))}
              {csvResult.errors.length > 5 && <div>...and {csvResult.errors.length - 5} more errors</div>}
            </div>
          )}
        </div>
      )}


      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : students.length === 0 ? (
        <div className={adminStyles.empty}>No students yet. Add one to get started.</div>
      ) : (() => {
        const filtered = branchFilter === "all" ? students : students.filter(s => (s.branch||"CS") === branchFilter);
        // Helper: count completed exams for a student based on branch assignments
        const getCompletion = (sid: string, studentBranch: string) => {
          const qMap = (window as any).__examBranchMap || [];
          
          // Get unique exam titles from ALL configs (active or inactive)
          // This represents the "total" set of exams that have been configured/given
          const configuredExams = new Set(examConfigs.map(c => c.exam_title));

          // Find exams that have at least one question for this student's branch 
          // AND have a configuration record
          const branchExams = new Set(qMap
            .filter((q: any) => {
              const bMatch = (q.branch === studentBranch || q.branch?.includes(studentBranch));
              const cMatch = catFilter === "all" || q.category === catFilter;
              const hasConfig = configuredExams.has(q.exam_name);
              return bMatch && cMatch && hasConfig;
            })
            .map((q: any) => q.exam_name)
          );

          const completed = new Set(examResults.filter((r: any) => r.student_id === sid).map((r: any) => r.exam_title));
          
          // Count done exams that are actually in the branchExams set
          const done = Array.from(completed).filter(title => branchExams.has(title)).length;
          return { done, total: branchExams.size };
        };


        return (
        <div className={adminStyles.tableWrapper}>
          <table className={adminStyles.table}>
            <thead>
              <tr><th>#</th><th>USN</th><th>Name</th><th>Email</th><th>Branch</th><th>Completed</th><th>PyHunt</th><th>Actions</th></tr>

            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const comp = getCompletion(s.student_id, s.branch || "CS");
                return (
                <tr key={s.student_id}>
                  <td className="mono text-muted">{i + 1}</td>
                  <td className="mono">{s.usn}</td>
                  <td>{s.name}</td>
                  <td style={{ fontSize: 12 }}>{s.email || "—"}</td>
                  <td><span className="badge badge-neutral">{s.branch || "CS"}</span></td>
                  <td>
                    <span style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:800, background: comp.done >= comp.total && comp.total > 0 ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.1)", color: comp.done >= comp.total && comp.total > 0 ? "#10b981" : "#f59e0b", border: comp.done >= comp.total && comp.total > 0 ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(245,158,11,0.2)" }}>
                      {comp.done}/{comp.total}
                    </span>
                  </td>
                  <td>
                    {(() => {
                      const ph = (window as any).__pyHuntSessions?.find((p: any) => p.student_id === s.usn);
                      if (!ph) return <span style={{ opacity: 0.2 }}>—</span>;
                      const isDone = ph.status === "finished" || ph.current_round >= 5;
                      return (
                        <span style={{ fontSize: 11, fontWeight: 800, color: isDone ? "#10b981" : "#00dcff" }}>
                          {isDone ? "✓ Finished" : `Round ${ph.current_round}`}
                        </span>
                      );
                    })()}
                  </td>
                  {/* Warnings removed per request */}

                  <td>
                    <div style={{ display:"flex", gap:6, background:"rgba(255,255,255,0.02)", borderRadius:12, padding:6, border:"1px solid rgba(255,255,255,0.05)" }}>
                      <button title="View Report" onClick={() => handleShowInfo(s)} style={{ height:32, padding:"0 12px", borderRadius:8, border:"none", background:"rgba(16,185,129,0.12)", color:"#10b981", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>View Report</button>
                      <button title="Edit Profile" onClick={() => { let bID = s.branch || "CS"; const match = ALL_BRANCH_DATA.find(b => b.name === bID || b.id === bID); if (match) bID = match.id; setEditing(s); setFormData({ usn: s.usn, name: s.name, email: s.email || "", branch: bID, password: "" }); setShowModal(true); }} style={{ height:32, padding:"0 12px", borderRadius:8, border:"none", background:"rgba(99,102,241,0.12)", color:"#818cf8", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>Edit</button>
                      <button title="Reset Password" onClick={() => { const p = prompt("Enter new password:"); if (p) updateAdminStudent(s.student_id, { password: p }).then(() => alert("Password reset")); }} style={{ height:32, padding:"0 12px", borderRadius:8, border:"none", background:"rgba(255,255,255,0.05)", color:"#94a3b8", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>Reset</button>
                      <button title="Allow Re-Exam" onClick={() => handleResetExam(s.student_id)} style={{ height:32, padding:"0 12px", borderRadius:8, border:"none", background:"rgba(245,158,11,0.12)", color:"#f59e0b", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>Retake</button>
                      <button title="Remove Student" onClick={() => handleDelete(s.student_id)} style={{ height:32, padding:"0 12px", borderRadius:8, border:"none", background:"rgba(239,68,68,0.12)", color:"#f87171", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>Delete</button>
                    </div>

                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        );
      })()}

      {infoStudent && (() => {
        const sid = infoStudent.student_id;
        const sBranch = infoStudent.branch || "CS";
        const qMap = (window as any).__examBranchMap || [];
        const sResults = examResults.filter((r: any) => r.student_id === sid);
        
        // Branch-aware totals per category (Only count CONFIGURED exams)
        const getCatStats = (cat: string) => {
          const configuredTitles = new Set(examConfigs.map(c => c.exam_title));
          const catExams = new Set(qMap.filter((q: any) => {
            const bMatch = q.branch?.includes("," + sBranch + ",") || q.branch === sBranch;
            const cMatch = (q.category||"Others").toLowerCase() === cat.toLowerCase();
            const hasConfig = configuredTitles.has(q.exam_name);
            return bMatch && cMatch && hasConfig;
          }).map((q: any) => q.exam_name));

          const completed = new Set(sResults.filter((r: any) => (r.category||"Others").toLowerCase() === cat.toLowerCase()).map((r: any) => r.exam_title));
          const done = Array.from(completed).filter(t => catExams.has(t)).length;
          return { done, total: catExams.size };
        };


        const catFilter = (cat: string) => cat === "all" ? sResults : sResults.filter((r: any) => (r.category || "Others").toLowerCase() === cat.toLowerCase());
        const filteredResults = catFilter(infoCatTab);
        
        const overall = {
          done: new Set(qMap.filter((q: any) => (q.branch === sBranch || q.branch?.includes(sBranch)) && examConfigs.some(c => c.exam_title === q.exam_name)).map((q: any) => q.exam_name).filter((t: any) => sResults.some((r: any) => r.exam_title === t))).size,
          total: new Set(qMap.filter((q: any) => (q.branch === sBranch || q.branch?.includes(sBranch)) && examConfigs.some(c => c.exam_title === q.exam_name)).map((q: any) => q.exam_name)).size
        };


        return (
        <div className={adminStyles.modalOverlay} onClick={() => setInfoStudent(null)}>
          <div className={adminStyles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600, background: "rgba(10, 15, 30, 0.98)", border: "1px solid rgba(139, 92, 246, 0.3)", boxShadow: "0 20px 50px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg, #6366f1, #a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, color: "#fff", boxShadow: "0 10px 20px rgba(99, 102, 241, 0.3)" }}>
                {infoStudent.name ? infoStudent.name[0] : "?"}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 24, color: "#fff", letterSpacing: "-0.02em" }}>{infoStudent.name || "Student"}</h3>
                <p style={{ margin: "4px 0", fontSize: 14, color: "var(--text-secondary)" }}>{infoStudent.usn} • {infoStudent.email || "No email"}</p>
                <div style={{ display: "inline-flex", padding: "4px 12px", background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", borderRadius: 20, fontSize: 12, fontWeight: 800, marginTop: 4 }}>
                  {sBranch} Branch
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>{overall.done}<span style={{ color: "rgba(255,255,255,0.3)", fontSize: 18 }}>/{overall.total}</span></div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: "0.1em" }}>TOTAL PROGRESS</div>
              </div>
            </div>

            {/* Category Stats Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
              {["Aptitude", "Programming", "Others"].map(cat => {
                const stat = getCatStats(cat);
                const pct = stat.total > 0 ? (stat.done / stat.total) * 100 : 0;
                return (
                  <div key={cat} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", bottom: 0, left: 0, height: 3, background: "#8b5cf6", width: `${pct}%`, transition: "width 1s ease" }} />
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", marginBottom: 8 }}>{cat.toUpperCase()}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>{stat.done}<span style={{ fontSize: 14, color: "rgba(255,255,255,0.2)" }}>/{stat.total}</span></div>
                  </div>
                );
              })}
            </div>

            {/* Category tabs for history */}
            <div style={{ display:"flex", gap:4, marginBottom:16, background:"rgba(0,0,0,0.2)", borderRadius:14, padding:4, border:"1px solid rgba(255,255,255,0.06)" }}>
              {["all","Aptitude","Programming","Others"].map(cat => (
                <button key={cat} onClick={() => setInfoCatTab(cat.toLowerCase())}
                  style={{ flex:1, padding:"10px 4px", borderRadius:10, border:"none", fontSize:11, fontWeight:800, cursor:"pointer",
                    background: infoCatTab === cat.toLowerCase() ? "rgba(139,92,246,0.25)" : "transparent",
                    color: infoCatTab === cat.toLowerCase() ? "#a78bfa" : "var(--text-muted)", transition: "all 0.2s" }}>
                  {cat === "all" ? "Full History" : cat}
                </button>
              ))}
            </div>

            {/* Exam results list */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.04)", overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-secondary)" }}>EXAM PERFORMANCE</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{filteredResults.length} records</span>
              </div>
              <div style={{ maxHeight:200, overflowY:"auto" }}>
                {filteredResults.length > 0 ? (
                  filteredResults.map((r: any, idx: number) => (
                    <div key={idx} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>{r.exam_title}</div>
                        <div style={{ fontSize:11, color:"var(--text-muted)", marginTop: 2 }}>{r.category || "Others"} • {new Date(r.submitted_at).toLocaleDateString()}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize:16, fontWeight:900, color: r.score >= r.total_marks * 0.5 ? "#10b981" : "#f87171" }}>{r.score}/{r.total_marks}</div>
                        <div style={{ fontSize:10, fontWeight:700, color: "rgba(255,255,255,0.2)" }}>{Math.round((r.score/(r.total_marks||1))*100)}%</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign:"center", padding:32, color:"var(--text-muted)", fontSize:13 }}>No submissions found for this category.</div>
                )}
              </div>
            </div>

            {/* PyHunt Progress */}
            <div style={{ background: "linear-gradient(135deg, rgba(0, 220, 255, 0.08), rgba(0, 220, 255, 0.02))", border: "1px solid rgba(0, 220, 255, 0.2)", borderRadius: 16, padding: 18, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14, color: "#00dcff", fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>🐍</span> PyHunt Quest
                </h4>
                {pyHuntProgress && (
                  <span style={{ fontSize: 11, fontWeight: 900, padding: "4px 10px", borderRadius: 20, background: pyHuntProgress.status === "finished" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)", color: pyHuntProgress.status === "finished" ? "#10b981" : "#f59e0b" }}>
                    {pyHuntProgress.status === "finished" ? "COMPLETED" : "IN PROGRESS"}
                  </span>
                )}
              </div>
              {pyHuntProgress ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div style={{ background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>CURRENT ROUND</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{pyHuntProgress.status === "finished" ? "Round 5" : `Round ${pyHuntProgress.current_round}`}</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>STATUS</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: pyHuntProgress.status === "finished" ? "#10b981" : "#00dcff" }}>
                      {pyHuntProgress.status === "finished" ? "🏆 Completed" : `Searching Round ${pyHuntProgress.current_round}`}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: 10, fontSize: 13, color: "rgba(0,220,255,0.4)", fontStyle: "italic" }}>No PyHunt journey recorded for this initiate.</div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => setInfoStudent(null)} style={{ padding: "12px 32px", borderRadius: 14, fontWeight: 800 }}>Done</button>
            </div>
          </div>
        </div>
        );
      })()}
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
                {ALL_BRANCH_DATA.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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



