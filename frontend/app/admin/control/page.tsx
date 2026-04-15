"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./control.module.css";
import Skeleton from "@/components/Skeleton";

const API = process.env.NEXT_PUBLIC_API_URL || "/api";
const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "admin@examguard2024";

type ExamState = "active" | "inactive";

interface ExamConfig {
  is_active: boolean;
  scheduled_start: string | null;
  duration_minutes: number;
  exam_title: string;
  marks_per_question: number;
  negative_marks: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  max_attempts: number;
  show_answers_after: boolean;
  enable_schedule: boolean;
  schedule_start_date: string;
  schedule_start_time: string;
  schedule_end_date: string;
  schedule_end_time: string;
  duration_hours: number;
  duration_seconds: number;
  exam_description: string;
  total_questions: number;
  total_marks: number;
}

const defaultConfig: ExamConfig = {
  is_active: false,
  scheduled_start: null,
  duration_minutes: 30,
  exam_title: "ExamGuard Assessment",
  marks_per_question: 4,
  negative_marks: -1,
  shuffle_questions: false,
  shuffle_options: false,
  max_attempts: 1,
  show_answers_after: true,
  enable_schedule: false,
  schedule_start_date: "",
  schedule_start_time: "",
  schedule_end_date: "",
  schedule_end_time: "",
  duration_hours: 0,
  duration_seconds: 0,
  exam_description: "",
  total_questions: 30,
  total_marks: 120,
};

function StatCard({
  icon,
  value,
  label,
  sublabel,
  color,
}: {
  icon: string;
  value: number | string;
  label: string;
  sublabel: string;
  color: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statCardTop}>
        <div className={styles.statCardLabel}>{label}</div>
        <div className={styles.statCardIcon} style={{ background: color }}>
          <span>{icon}</span>
        </div>
      </div>
      <div className={styles.statCardValue}>{value}</div>
      <div className={styles.statCardSublabel}>{sublabel}</div>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  desc,
  color,
  onClick,
}: {
  icon: string;
  title: string;
  desc: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button className={styles.actionCard} onClick={onClick}>
      <div className={styles.actionIcon} style={{ background: color }}>
        <span>{icon}</span>
      </div>
      <div>
        <div className={styles.actionTitle}>{title}</div>
        <div className={styles.actionDesc}>{desc}</div>
      </div>
    </button>
  );
}

export default function OrbitalControlPage() {
  const [config, setConfig] = useState<ExamConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"dashboard" | "settings">("dashboard");
  const [questionCount, setQuestionCount] = useState(0);
  const [studentCount, setStudentCount] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [availableExams, setAvailableExams] = useState<string[]>([]);

  const fetchConfig = useCallback(async (targetTitle?: string) => {
    try {
      const titleParam = targetTitle || config.exam_title;
      const res = await fetch(`${API}/admin/exam/config?title=${encodeURIComponent(titleParam)}`, {
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      if (res.ok) {
        const data = await res.json();
        const mappedData = { ...data };
        if (data.scheduled_start) {
          const d = new Date(data.scheduled_start);
          mappedData.schedule_start_date = d.toISOString().split("T")[0];
          mappedData.schedule_start_time = d.toTimeString().slice(0, 5);
          mappedData.enable_schedule = true;
        } else {
          mappedData.schedule_start_date = "";
          mappedData.schedule_start_time = "";
          mappedData.enable_schedule = false;
        }
        if (data.scheduled_end) {
          const d = new Date(data.scheduled_end);
          mappedData.schedule_end_date = d.toISOString().split("T")[0];
          mappedData.schedule_end_time = d.toTimeString().slice(0, 5);
        } else {
          mappedData.schedule_end_date = "";
          mappedData.schedule_end_time = "";
        }
        setConfig((prev) => ({ ...defaultConfig, ...mappedData, exam_title: titleParam }));
      }
    } catch {
      // ignore — backend may not have config endpoint yet
    } finally {
      setLoading(false);
    }
  }, [config.exam_title]);

  const fetchStats = useCallback(async () => {
    try {
      const [qRes, sRes] = await Promise.all([
        fetch(`${API}/admin/questions`, { headers: { "x-admin-secret": ADMIN_SECRET } }),
        fetch(`${API}/admin/students`, { headers: { "x-admin-secret": ADMIN_SECRET } }),
      ]);
      if (qRes.ok) {
        const qData = await qRes.json();
        const questionsArray = Array.isArray(qData) ? qData : (qData.questions || []);
        setQuestionCount(questionsArray.length);
        const nameSet = new Set<string>();
        questionsArray.forEach((q: any) => {
          if (q.exam_name) nameSet.add(q.exam_name);
        });
        setAvailableExams(nameSet.size > 0 ? Array.from(nameSet) : ["ExamGuard Assessment"]);
      }
      if (sRes.ok) {
        const sData = await sRes.json();
        const students = Array.isArray(sData) ? sData : [];
        setStudentCount(students.length);
        const violations = students.reduce((sum: number, s: any) => sum + (s.warnings || 0), 0);
        setViolationCount(violations);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchStats();
  }, [fetchConfig, fetchStats]);

  const save = async () => {
    setSaving(true);
    try {
      let startIso = null;
      let endIso = null;
      if (config.enable_schedule && config.schedule_start_date && config.schedule_start_time) {
        startIso = new Date(`${config.schedule_start_date}T${config.schedule_start_time}`).toISOString();
      }
      if (config.enable_schedule && config.schedule_end_date && config.schedule_end_time) {
        endIso = new Date(`${config.schedule_end_date}T${config.schedule_end_time}`).toISOString();
      }

      const payload = {
        ...config,
        scheduled_start: startIso,
        scheduled_end: endIso,
      };

      const res = await fetch(`${API}/admin/exam/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Save failed" }));
        throw new Error(err.detail || "Save failed");
      }
      const data = await res.json();
      
      const mappedData = { ...data };
      if (data.scheduled_start) {
        const d = new Date(data.scheduled_start);
        mappedData.schedule_start_date = d.toISOString().split("T")[0];
        mappedData.schedule_start_time = d.toTimeString().slice(0, 5);
        mappedData.enable_schedule = true;
      }
      if (data.scheduled_end) {
        const d = new Date(data.scheduled_end);
        mappedData.schedule_end_date = d.toISOString().split("T")[0];
        mappedData.schedule_end_time = d.toTimeString().slice(0, 5);
      }

      setConfig((prev) => ({ ...prev, ...mappedData }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e: any) {
      alert(e.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const examState: ExamState = config.is_active ? "active" : "inactive";

  // ── Derived display values ──────────────────────────────────
  const totalDurationSeconds =
    config.duration_hours * 3600 + config.duration_minutes * 60 + config.duration_seconds;
  const hh = Math.floor(totalDurationSeconds / 3600).toString().padStart(1, "0");
  const mm = Math.floor((totalDurationSeconds % 3600) / 60).toString().padStart(2, "0");
  const ss = (totalDurationSeconds % 60).toString().padStart(2, "0");
  const durationDisplay = `${hh}:${mm}:${ss}`;

  const marksOptions = [1, 2, 3, 4, 5, 6, 10];
  const negativeOptions = [0, -0.25, -0.5, -1, -2];
  const attemptOptions = [1, 2, 3, 5, 10];

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 64, maxWidth: 600, margin: "0 auto" }}>
        <Skeleton height={200} borderRadius={100} width={200} className="mx-auto" />
        <Skeleton height={40} width="60%" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Skeleton height={120} borderRadius={20} />
          <Skeleton height={120} borderRadius={20} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Page Header ── */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Admin Dashboard</h2>
          <p className={styles.pageSubtitle}>Manage questions, configure quizzes, and monitor activity</p>
        </div>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewTab} ${activeView === "dashboard" ? styles.viewTabActive : ""}`}
            onClick={() => setActiveView("dashboard")}
          >
            🏠 Dashboard
          </button>
          <button
            className={`${styles.viewTab} ${activeView === "settings" ? styles.viewTabActive : ""}`}
            onClick={() => setActiveView("settings")}
          >
            ⚙️ Quiz Settings
          </button>
        </div>
      </div>

      {/* ── DASHBOARD VIEW ── */}
      {activeView === "dashboard" && (
        <>
          {/* Stats Row */}
          <div className={styles.statsGrid}>
            <StatCard
              icon="📋"
              value={questionCount}
              label="Total Questions"
              sublabel="Questions in bank"
              color="rgba(59,130,246,0.25)"
            />
            <StatCard
              icon="🎯"
              value={config.is_active ? 1 : 0}
              label="Active Quizzes"
              sublabel={config.is_active ? `Live: ${config.exam_title}` : `Standby: ${config.exam_title}`}
              color="rgba(16,185,129,0.25)"
            />
            <StatCard
              icon="👥"
              value={studentCount}
              label="Candidates Registered"
              sublabel="Total registered"
              color="rgba(139,92,246,0.25)"
            />
            <StatCard
              icon="⚠️"
              value={violationCount}
              label="Violations"
              sublabel={violationCount === 0 ? "No violations detected" : `${violationCount} alerts`}
              color="rgba(239,68,68,0.25)"
            />
          </div>

          {/* Main Content: Question Management + Quiz Controls */}
          <div className={styles.mainGrid}>
            {/* ── Question Management ── */}
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelIcon}>📋</span>
                <h3 className={styles.panelTitle}>Question Management</h3>
              </div>

              {/* ── Quiz Link & Selection ── */}
              <div className={styles.quizContextBar}>
                <div className={styles.quizDropdownGroup}>
                  <label className={styles.quizContextLabel}>Target Quiz</label>
                  <select 
                    className={styles.quizContextSelect}
                    value={config.exam_title}
                    onChange={(e) => {
                      const newTitle = e.target.value;
                      setConfig(c => ({ ...c, exam_title: newTitle }));
                      fetchConfig(newTitle); // Weightlessly shift horizons
                    }}
                  >
                    <option value="" disabled>Select quiz...</option>
                    {availableExams.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div className={styles.quizLinkGroup}>
                  <label className={styles.quizContextLabel}>Shareable Link</label>
                  <div className={styles.quizLinkInputWrapper}>
                    <input 
                      readOnly 
                      className={styles.quizLinkInput} 
                      value={typeof window !== 'undefined' ? `${window.location.origin}/login?exam=${encodeURIComponent(config.exam_title)}` : ''} 
                    />
                    <button 
                      className={styles.quizCopyBtn}
                      onClick={(e) => {
                        const link = `${window.location.origin}/login?exam=${encodeURIComponent(config.exam_title)}`;
                        navigator.clipboard.writeText(link);
                        e.currentTarget.textContent = "✓";
                        setTimeout(() => e.currentTarget.textContent = "📋", 2000);
                      }}
                      title="Copy Link"
                    >
                      📋
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.actionGrid}>
                <ActionCard
                  icon="➕"
                  title="Add Question"
                  desc="Create new"
                  color="rgba(59,130,246,0.2)"
                  onClick={() => {
                    const tabs = Array.from(document.querySelectorAll('button'));
                    const targetTab = tabs.find(t => t.textContent?.includes('Questions'));
                    if (targetTab) targetTab.click();
                  }}
                />
                <ActionCard
                  icon="📤"
                  title="Upload CSV/Excel"
                  desc="Bulk import"
                  color="rgba(16,185,129,0.2)"
                  onClick={() => {
                    const tabs = Array.from(document.querySelectorAll('button'));
                    const targetTab = tabs.find(t => t.textContent?.includes('Harvester'));
                    if (targetTab) targetTab.click();
                  }}
                />
                <ActionCard
                  icon="🔖"
                  title="Question Bank"
                  desc={`${questionCount} Questions`}
                  color="rgba(139,92,246,0.2)"
                  onClick={() => {
                    const tabs = Array.from(document.querySelectorAll('button'));
                    const targetTab = tabs.find(t => t.textContent?.includes('Questions'));
                    if (targetTab) targetTab.click();
                  }}
                />
                <ActionCard
                  icon="⚙️"
                  title="Quiz Settings"
                  desc="Status & Schedule"
                  color="rgba(245,158,11,0.2)"
                  onClick={() => setActiveView("settings")}
                />
              </div>
              <div className={styles.mediaTypes}>
                <span className={styles.mediaLabel}>SUPPORTED MEDIA TYPES</span>
                <div className={styles.mediaIcons}>
                  <span>🖼️ Image</span>
                  <span>🎵 Audio</span>
                  <span>▶️ Video</span>
                </div>
              </div>
            </div>

            {/* ── Quiz Controls ── */}
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelIcon}>⚙️</span>
                <h3 className={styles.panelTitle}>Quiz Controls</h3>
              </div>

              {/* Active/Inactive Luminous Toggle */}
              <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "24px" }}>
                <div
                  style={{
                    width: "60px",
                    height: "32px",
                    borderRadius: "999px",
                    background: config.is_active ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${config.is_active ? "rgba(6,182,212,0.3)" : "rgba(255,255,255,0.1)"}`,
                    position: "relative",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: "4px",
                    boxShadow: config.is_active ? "0 0 15px rgba(6,182,212,0.2)" : "none",
                    transition: "all 0.3s ease",
                  }}
                  onClick={() => setConfig(c => ({ ...c, is_active: !c.is_active }))}
                >
                  <motion.div
                    animate={{ 
                      x: config.is_active ? 28 : 0,
                      boxShadow: config.is_active ? "0 0 12px #06b6d4, inset 0 0 4px #fff" : "0 0 0px transparent",
                      backgroundColor: config.is_active ? "#06b6d4" : "#475569"
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: config.is_active ? "#06b6d4" : "rgba(148,163,184,0.7)", letterSpacing: "0.02em" }}>
                    {config.is_active ? "Luminous (Active)" : "Latent (Deactivated)"}
                  </span>
                  <span style={{ fontSize: "11px", color: "rgba(148,163,184,0.5)" }}>
                    {config.is_active ? "Students can discover this exam." : "Exam is invisible to students."}
                  </span>
                </div>
              </div>

              {/* Preview Quiz */}
              <button className={styles.previewBtn} onClick={() => window.open('/dashboard?preview=true', '_blank')}>
                👁️ Preview Quiz
              </button>

              {/* Shuffle Controls */}
              <div className={styles.shuffleRow}>
                <button
                  className={`${styles.shuffleBtn} ${config.shuffle_questions ? styles.shuffleBtnActive : ""}`}
                  onClick={() => setConfig((c) => ({ ...c, shuffle_questions: !c.shuffle_questions }))}
                >
                  🔀 Shuffle Questions
                </button>
                <button
                  className={`${styles.shuffleBtn} ${config.shuffle_options ? styles.shuffleBtnActive : ""}`}
                  onClick={() => setConfig((c) => ({ ...c, shuffle_options: !c.shuffle_options }))}
                >
                  🔁 Shuffle Options
                </button>
              </div>

              {/* Marks Config */}
              <div className={styles.marksRow}>
                <div className={styles.markField}>
                  <label className={styles.markLabel}>Marks per Question</label>
                  <select
                    className={styles.markSelect}
                    value={config.marks_per_question}
                    onChange={(e) => setConfig((c) => ({ ...c, marks_per_question: Number(e.target.value) }))}
                  >
                    {marksOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.markField}>
                  <label className={styles.markLabel}>Negative Marks</label>
                  <select
                    className={styles.markSelect}
                    value={config.negative_marks}
                    onChange={(e) => setConfig((c) => ({ ...c, negative_marks: Number(e.target.value) }))}
                  >
                    {negativeOptions.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quiz Status Indicator */}
              <div className={styles.quizStatusRow}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span className={styles.quizStatusLabel}>Quiz Status</span>
                  <span style={{ fontSize: "11px", color: "rgba(148,163,184,0.6)" }}>{config.exam_title}</span>
                </div>
                <span className={`${styles.quizStatusBadge} ${config.is_active ? styles.quizStatusActive : styles.quizStatusInactive}`}>
                  {config.is_active ? "● Active" : "○ Inactive"}
                </span>
              </div>

              {/* Save Button */}
              <button
                className={`${styles.saveBtn} ${saveSuccess ? styles.saveBtnSuccess : ""}`}
                onClick={save}
                disabled={saving}
              >
                {saving ? (
                  <><div className="spinner" style={{ width: 16, height: 16, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> Saving…</>
                ) : saveSuccess ? (
                  "✓ Saved!"
                ) : (
                  "⚡ Deploy Config"
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SETTINGS VIEW ── */}
      {activeView === "settings" && (
        <div className={styles.settingsLayout}>
          <div className={styles.settingsMain}>
            {/* Exam Info */}
            <div className={styles.settingsCard}>
              <label className={styles.settingsLabel}>Exam Title</label>
              <select
                className={styles.settingsSelect}
                value={config.exam_title}
                onChange={(e) => setConfig((c) => ({ ...c, exam_title: e.target.value }))}
              >
                <option value="" disabled>Select exam...</option>
                {availableExams.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>

            <div className={styles.settingsCard}>
              <label className={styles.settingsLabel}>Description</label>
              <textarea
                className={styles.settingsInput}
                rows={3}
                value={config.exam_description}
                onChange={(e) => setConfig((c) => ({ ...c, exam_description: e.target.value }))}
                placeholder="Enter quiz description..."
              />
            </div>

            <div className={styles.settingsRow}>
              <div className={styles.settingsCard}>
                <label className={styles.settingsLabel}>Total Questions</label>
                <input
                  type="number"
                  className={styles.settingsInput}
                  value={config.total_questions}
                  onChange={(e) => setConfig((c) => ({ ...c, total_questions: Number(e.target.value) }))}
                  min={1}
                />
              </div>
              <div className={styles.settingsCard}>
                <label className={styles.settingsLabel}>Total Marks</label>
                <input
                  type="number"
                  className={styles.settingsInput}
                  value={config.total_marks}
                  onChange={(e) => setConfig((c) => ({ ...c, total_marks: Number(e.target.value) }))}
                  min={1}
                />
              </div>
            </div>

            {/* Scoring Configuration */}
            <div className={styles.settingsSectionCard}>
              <div className={styles.sectionCardHeader}>
                <span>🏆</span>
                <h4 className={styles.sectionCardTitle}>Scoring Configuration</h4>
              </div>
              <div className={styles.settingsRow}>
                <div className={styles.settingsCard} style={{ flex: 1 }}>
                  <label className={styles.settingsLabel}>Marks per Correct Answer</label>
                  <select
                    className={styles.settingsSelect}
                    value={config.marks_per_question}
                    onChange={(e) => setConfig((c) => ({ ...c, marks_per_question: Number(e.target.value) }))}
                  >
                    {[1, 2, 3, 4, 5, 6, 10].map((m) => (
                      <option key={m} value={m}>{m} Mark{m > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.settingsCard} style={{ flex: 1 }}>
                  <label className={styles.settingsLabel}>Negative Marks (Wrong)</label>
                  <select
                    className={styles.settingsSelect}
                    value={config.negative_marks}
                    onChange={(e) => setConfig((c) => ({ ...c, negative_marks: Number(e.target.value) }))}
                  >
                    {[0, -0.25, -0.5, -1, -2].map((m) => (
                      <option key={m} value={m}>{m === 0 ? "No Penalty" : `${m} per Wrong`}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.formulaBox}>
                <span className={styles.formulaLabel}>Score Calculation Formula:</span>
                <code className={styles.formulaCode}>
                  Score = (Correct × {config.marks_per_question}) - (Wrong × {Math.abs(config.negative_marks)})
                </code>
              </div>
            </div>

            {/* Timer Settings */}
            <div className={styles.settingsSectionCard}>
              <div className={styles.sectionCardHeader}>
                <span>⏱️</span>
                <h4 className={styles.sectionCardTitle}>Timer Settings</h4>
              </div>
              <div className={styles.timerRow}>
                <div className={styles.timerField}>
                  <label className={styles.settingsLabel}>Hours</label>
                  <select
                    className={styles.settingsSelect}
                    value={config.duration_hours}
                    onChange={(e) => setConfig((c) => ({ ...c, duration_hours: Number(e.target.value) }))}
                  >
                    {Array.from({ length: 13 }, (_, i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.timerField}>
                  <label className={styles.settingsLabel}>Minutes</label>
                  <select
                    className={styles.settingsSelect}
                    value={config.duration_minutes}
                    onChange={(e) => setConfig((c) => ({ ...c, duration_minutes: Number(e.target.value) }))}
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.timerField}>
                  <label className={styles.settingsLabel}>Seconds</label>
                  <select
                    className={styles.settingsSelect}
                    value={config.duration_seconds}
                    onChange={(e) => setConfig((c) => ({ ...c, duration_seconds: Number(e.target.value) }))}
                  >
                    {[0, 15, 30, 45].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.durationDisplay}>
                <span className={styles.durationLabel}>Total Duration:</span>
                <span className={styles.durationTime}>{durationDisplay}</span>
              </div>
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className={styles.settingsSidebar}>
            {/* Current Status */}
            <div className={styles.settingsSectionCard}>
              {/* Luminous Status Toggle */}
              <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "16px" }}>
                <div
                  style={{
                    width: "60px",
                    height: "32px",
                    borderRadius: "999px",
                    background: config.is_active ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${config.is_active ? "rgba(6,182,212,0.3)" : "rgba(255,255,255,0.1)"}`,
                    position: "relative",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: "4px",
                    boxShadow: config.is_active ? "0 0 15px rgba(6,182,212,0.2)" : "none",
                    transition: "all 0.3s ease",
                  }}
                  onClick={() => setConfig(c => ({ ...c, is_active: !c.is_active }))}
                >
                  <motion.div
                    animate={{ 
                      x: config.is_active ? 28 : 0,
                      boxShadow: config.is_active ? "0 0 12px #06b6d4, inset 0 0 4px #fff" : "0 0 0px transparent",
                      backgroundColor: config.is_active ? "#06b6d4" : "#475569"
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: config.is_active ? "#06b6d4" : "rgba(148,163,184,0.7)", letterSpacing: "0.02em" }}>
                    {config.is_active ? "Luminous (Active)" : "Latent (Deactivated)"}
                  </span>
                </div>
              </div>
              <div className={styles.currentStatusRow}>
                <span className={`${styles.quizStatusBadge} ${config.is_active ? styles.quizStatusActive : styles.quizStatusInactive}`}>
                  {config.is_active ? "● Active" : "○ Inactive"}
                </span>
                <span className={styles.currentStatusLabel}>Current Status</span>
              </div>
            </div>

            {/* Auto Schedule */}
            <div className={styles.settingsSectionCard}>
              <div className={styles.sectionCardHeader}>
                <span>📅</span>
                <h4 className={styles.sectionCardTitle}>Auto Schedule</h4>
              </div>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={config.enable_schedule}
                  onChange={(e) => setConfig((c) => ({ ...c, enable_schedule: e.target.checked }))}
                />
                <span className={styles.checkboxLabel}>Enable Automatic Activation</span>
              </label>

              {config.enable_schedule && (
                <>
                  <div className={styles.scheduleRow}>
                    <div className={styles.scheduleField}>
                      <label className={styles.settingsLabel}>Start Date</label>
                      <input
                        type="date"
                        className={styles.settingsInput}
                        value={config.schedule_start_date}
                        onChange={(e) => setConfig((c) => ({ ...c, schedule_start_date: e.target.value }))}
                        placeholder="dd-mm-yyyy"
                      />
                    </div>
                    <div className={styles.scheduleField}>
                      <label className={styles.settingsLabel}>Start Time</label>
                      <input
                        type="time"
                        className={styles.settingsInput}
                        value={config.schedule_start_time}
                        onChange={(e) => setConfig((c) => ({ ...c, schedule_start_time: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className={styles.scheduleRow}>
                    <div className={styles.scheduleField}>
                      <label className={styles.settingsLabel}>End Date</label>
                      <input
                        type="date"
                        className={styles.settingsInput}
                        value={config.schedule_end_date}
                        onChange={(e) => setConfig((c) => ({ ...c, schedule_end_date: e.target.value }))}
                        placeholder="dd-mm-yyyy"
                      />
                    </div>
                    <div className={styles.scheduleField}>
                      <label className={styles.settingsLabel}>End Time</label>
                      <input
                        type="time"
                        className={styles.settingsInput}
                        value={config.schedule_end_time}
                        onChange={(e) => setConfig((c) => ({ ...c, schedule_end_time: e.target.value }))}
                      />
                    </div>
                  </div>
                  <button className={styles.confirmScheduleBtn}>
                    Confirm Schedule
                  </button>
                </>
              )}
              {!config.enable_schedule && (
                <p className={styles.scheduleDisabledNote}>Scheduling disabled</p>
              )}
            </div>

            {/* Attempt Settings */}
            <div className={styles.settingsSectionCard}>
              <div className={styles.sectionCardHeader}>
                <span>🔄</span>
                <h4 className={styles.sectionCardTitle}>Attempt Settings</h4>
              </div>
              <div className={styles.settingsCard}>
                <label className={styles.settingsLabel}>Maximum Attempts</label>
                <select
                  className={styles.settingsSelect}
                  value={config.max_attempts}
                  onChange={(e) => setConfig((c) => ({ ...c, max_attempts: Number(e.target.value) }))}
                >
                  {[1, 2, 3, 5, 10].map((a) => (
                    <option key={a} value={a}>{a} Attempt{a > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={config.show_answers_after}
                  onChange={(e) => setConfig((c) => ({ ...c, show_answers_after: e.target.checked }))}
                />
                <span className={styles.checkboxLabel}>Show Answers After Submission</span>
              </label>
            </div>

            {/* Save Button */}
            <button
              className={`${styles.saveBtn} ${saveSuccess ? styles.saveBtnSuccess : ""}`}
              onClick={save}
              disabled={saving}
            >
              {saving ? (
                <><div className="spinner" style={{ width: 16, height: 16, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> Saving…</>
              ) : saveSuccess ? (
                "✓ Configuration Saved"
              ) : (
                "⚡ Deploy Configuration"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
