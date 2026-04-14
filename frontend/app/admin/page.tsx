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
  AdminQuestion,
  AdminStudent,
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
  current_question: number | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

const BRANCHES = BRANCH_IDS;
type Tab = "monitor" | "questions" | "students" | "leaderboard" | "ingest" | "control";
const ADMIN_AUTH_KEY = "examguard_admin_auth";

function getStoredAuth(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(ADMIN_AUTH_KEY) === "true"; } catch { return false; }
}

// ── Data-Stream Export Animation ──────────────────────────────
function ExportButton() {
  const [phase, setPhase] = useState<"idle" | "streaming" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const doExport = async () => {
    if (phase === "streaming") return;
    setPhase("streaming");
    setError(null);
    try {
      const blob = await exportResults();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `examguard_results_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setPhase("done");
      setTimeout(() => setPhase("idle"), 3000);
    } catch (e: any) {
      setError(e.message);
      setPhase("idle");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        id="export-btn"
        onClick={doExport}
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
        }}
      >
        {/* Data-stream shimmer overlay */}
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
    if (pass === (process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin@examguard2024")) {
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

    const channel = supabase
      .channel("admin-exam-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_status" }, () => fetchStudents())
      .subscribe();

    const interval = setInterval(fetchStudents, 5_000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [authed, fetchStudents]);

  const total     = students.length;
  const active    = students.filter((s) => s.status === "active").length;
  const submitted = students.filter((s) => s.status === "submitted").length;
  const notStarted = students.filter((s) => s.status === "not_started").length;
  const flagged   = students.filter((s) => s.warnings >= 2).length;

  const visible = students
    .filter((s) => filter === "all" || s.status === filter)
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
          {activeTab === "monitor" && <ExportButton />}
          <button className="btn btn-outline" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setAuthed(false)}>
            Logout
          </button>
        </div>
      </header>

      {/* ── Monitor Tab ── */}
      {activeTab === "monitor" && (
        <>
          <div className={styles.statsRow}>
            {[
              { value: total,      label: "Total Students",    color: undefined },
              { value: active,     label: "Active",            color: "var(--success)" },
              { value: submitted,  label: "Submitted",         color: "var(--accent)" },
              { value: notStarted, label: "Not Started",       color: "var(--text-muted)" },
              { value: flagged,    label: "Flagged (2+ warns)", color: "var(--danger)" },
              { value: total > 0 ? `${Math.round((submitted / total) * 100)}%` : "0%", label: "Completion", color: "var(--warning)" },
            ].map((s, i) => (
              <div key={i} className={styles.statCard}>
                <span className={styles.statValue} style={s.color ? { color: s.color } : {}}>{s.value}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Live stats row */}
          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <span className={styles.statValue} style={{ fontSize: 20 }}>{liveStats.answers}</span>
              <span className={styles.statLabel}>Answers Given</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue} style={{ fontSize: 20, color: liveStats.violations > 0 ? "var(--danger)" : "inherit" }}>
                {liveStats.violations}
              </span>
              <span className={styles.statLabel}>Violations</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue} style={{ fontSize: 20 }}>{Math.floor((Date.now() / 1000) % 60)}</span>
              <span className={styles.statLabel}>Live Pulse</span>
            </div>
          </div>

          {/* Controls */}
          <div className={styles.controls}>
            <input type="text" className={adminStyles.input} placeholder="Search by name or USN…" value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
            <div className={styles.filters}>
              {(["all", "active", "submitted", "not_started"] as const).map((f) => (
                <button key={f} className={`btn ${filter === f ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setFilter(f)} style={{ fontSize: 12, padding: "6px 14px" }}>
                  {f === "not_started" ? "Not Started" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
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
                    <th>Branch</th><th>Status</th><th>Progress</th><th>Warnings</th>
                    <th>Last Active</th><th>Submitted At</th>
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
                      <td style={{ fontSize: 12 }}>{s.status === "active" && s.current_question ? `Q${s.current_question}` : "—"}</td>
                      <td><WarningBadge count={s.warnings} /></td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{timeAgo(s.last_active)}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleTimeString() : "—"}
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
        <div className={adminStyles.orbGrid}>
          <AnimatePresence>
            {Object.entries(clusters).map(([name, clusterQs]) => (
              <React.Fragment key={name}>
                <motion.div
                  layout
                  className={`${adminStyles.orbNode} ${expandedClusters[name] ? adminStyles.orbActive : ""}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => toggleCluster(name)}
                >
                  <div className={adminStyles.orbCircle}>
                    <div className={adminStyles.orbCount}>{clusterQs.length}</div>
                    <span className={adminStyles.orbInsideIcon}>
                      {name.toLowerCase().includes("final") ? "🏆" : 
                       name.toLowerCase().includes("mid")   ? "🌓" : "🌌"}
                    </span>
                  </div>
                  <div className={adminStyles.orbDetails}>
                    <div className={adminStyles.orbTitle}>{name}</div>
                    <div className={adminStyles.orbSubtitle}>Isolation Node</div>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {expandedClusters[name] && (
                    <motion.div
                      className={adminStyles.isolationView}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <div className={adminStyles.nodeManagementHeader}>
                        <div className={adminStyles.nodeInfo}>
                          <h4 style={{ margin: 0, color: '#8b5cf6' }}>Isolation Node: {name}</h4>
                          <small style={{ color: '#7c3aed', opacity: 0.8 }}>{clusterQs.length} Questions Physically Isolated</small>
                        </div>
                        <div className={adminStyles.nodeActions}>
                          <button 
                            className="btn btn-outline" 
                            style={{ fontSize: 12, padding: '4px 12px' }} 
                            onClick={(e) => { e.stopPropagation(); console.log('Orbital Trigger: Rename', name); handleRenameFolder(name); }}
                          >
                            Rename Node
                          </button>
                          <button 
                            className="btn btn-outline btn-danger" 
                            style={{ fontSize: 12, padding: '4px 12px' }} 
                            onClick={(e) => { e.stopPropagation(); console.log('Orbital Trigger: Destroy', name); handleDeleteFolder(name); }}
                          >
                            Destroy Node
                          </button>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                        {clusterQs.map((q) => (
                          <div key={q.id} className={adminStyles.card} style={{ margin: 0 }}>
                            <div className={adminStyles.cardHeader}>
                              <div className={adminStyles.cardIndex} style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa" }}>
                                Q{q.order_index + 1}
                              </div>
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
                        <button className="btn btn-outline" onClick={() => toggleCluster(name)}>Close Node</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </React.Fragment>
            ))}
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
    if (!usnRegex.test(formData.usn)) return alert("Invalid USN format. Required: 1RM25XY000 (5 chars, 2 letters, 3 digits)");
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