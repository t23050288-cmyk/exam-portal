"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { fetchPublicExamConfig, type ExamConfig } from "@/lib/api";
import { BRANCHES } from "@/lib/constants";

// ── Types ──────────────────────────────────────────────────────
interface ExamNode {
  id: string;
  exam_name: string;
  branch: string;
  is_active: boolean;
  duration_minutes: number;
  scheduled_start: string | null;
  question_count?: number;
}

interface StudentInfo {
  id: string;
  name: string;
  branch: string;
  examStartTime: string | null;
  examDurationMinutes: number;
}

// ── Branch color map ───────────────────────────────────────────
const BRANCH_COLORS: Record<string, { primary: string; glow: string; accent: string }> = {
  CS:      { primary: "#06b6d4", glow: "rgba(6,182,212,0.25)",   accent: "#22d3ee" },
  CSE:     { primary: "#6366f1", glow: "rgba(99,102,241,0.25)",  accent: "#818cf8" },
  AI:      { primary: "#8b5cf6", glow: "rgba(139,92,246,0.25)",  accent: "#a78bfa" },
  DS:      { primary: "#10b981", glow: "rgba(16,185,129,0.25)",  accent: "#34d399" },
  ISC:     { primary: "#f59e0b", glow: "rgba(245,158,11,0.25)",  accent: "#fbbf24" },
  ECE:     { primary: "#ef4444", glow: "rgba(239,68,68,0.25)",   accent: "#f87171" },
  "BCA-1st": { primary: "#ec4899", glow: "rgba(236,72,153,0.25)", accent: "#f472b6" },
  "BCA-2nd": { primary: "#14b8a6", glow: "rgba(20,184,166,0.25)", accent: "#2dd4bf" },
};

const DEFAULT_COLOR = { primary: "#6366f1", glow: "rgba(99,102,241,0.25)", accent: "#818cf8" };

// ── Breathing animation keyframes ─────────────────────────────
const breatheKeyframes = [
  { boxShadow: "0 0 20px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.1), inset 0 1px 0 rgba(255,255,255,0.1)" },
  { boxShadow: "0 0 35px rgba(6,182,212,0.5), 0 0 90px rgba(6,182,212,0.2), inset 0 1px 0 rgba(255,255,255,0.15)" },
  { boxShadow: "0 0 20px rgba(6,182,212,0.3), 0 0 60px rgba(6,182,212,0.1), inset 0 1px 0 rgba(255,255,255,0.1)" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [allExams, setAllExams] = useState<ExamNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [warpTarget, setWarpTarget] = useState<ExamNode | null>(null);
  const [warpActive, setWarpActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const orbAnimRef = useRef<number>(0);
  const [time, setTime] = useState(0);

  // Aurora orb animation
  useEffect(() => {
    let t = 0;
    const orbs = containerRef.current?.querySelectorAll("[data-dashboard-orb]");
    const animate = () => {
      t += 0.002;
      setTime(t);
      orbs?.forEach((orb, i) => {
        const el = orb as HTMLElement;
        const phase = i * (Math.PI * 2) / 3;
        el.style.transform = `translate(${Math.sin(t + phase) * 40}px, ${Math.cos(t * 0.8 + phase) * 25}px)`;
      });
      orbAnimRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(orbAnimRef.current);
  }, []);

  // Load student from session
  useEffect(() => {
    const isPreview = window.location.search.includes("preview=true");
    if (isPreview) {
      const mock: StudentInfo = { id: "PREVIEW", name: "Admin Preview", branch: "ALL", examStartTime: null, examDurationMinutes: 60 };
      sessionStorage.setItem("exam_student", JSON.stringify(mock));
      sessionStorage.setItem("exam_preview", "true");
      setStudent(mock);
      setSelectedBranch("ALL");
      return;
    }

    const raw = sessionStorage.getItem("exam_student");
    const token = sessionStorage.getItem("exam_token");
    if (!raw || !token) {
      router.replace("/login");
      return;
    }
    const info: StudentInfo = JSON.parse(raw);
    setStudent(info);
    setSelectedBranch(info.branch || "ALL");
  }, [router]);

  // ── Real-time exam config listener via Supabase ────────────
  const loadExams = useCallback(async () => {
    try {
      // Fetch all public configs
      const configs = await fetchPublicExamConfig();
      const activeConfigs = configs.filter(c => c.is_active);

      // Get question distribution
      const { data: qData } = await supabase
        .from("questions")
        .select("branch, exam_name");

      const nodes: ExamNode[] = [];
      const seen = new Set<string>();

      if (qData && activeConfigs.length > 0) {
        for (const config of activeConfigs) {
          // Find branches that have questions for this specific exam_title
          const relevantQuestions = qData.filter(q => q.exam_name === config.exam_title);
          
          // Group by branch for this exam
          const branchCounts: Record<string, number> = {};
          relevantQuestions.forEach(q => {
            const br = q.branch || "CS";
            branchCounts[br] = (branchCounts[br] || 0) + 1;
          });

          // Create a node for each branch/exam combo
          Object.entries(branchCounts).forEach(([branch, count]) => {
            const nodeId = `${config.exam_title}-${branch}`;
            if (!seen.has(nodeId)) {
              nodes.push({
                id: nodeId,
                exam_name: config.exam_title,
                branch,
                is_active: config.is_active,
                duration_minutes: config.duration_minutes,
                scheduled_start: config.scheduled_start,
                question_count: count,
              });
              seen.add(nodeId);
            }
          });
        }
      }

      setAllExams(nodes);
    } catch (e) {
      console.error("Failed to load exams:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExams();

    // ── Supabase Realtime: exam_config changes ──
    const channel = supabase
      .channel("exam_config_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_config" },
        () => {
          // Weightlessly re-sync exam state
          loadExams();
        }
      )
      .subscribe();

    // Also watch questions table for branch changes
    const qChannel = supabase
      .channel("questions_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions" },
        () => loadExams()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(qChannel);
    };
  }, [loadExams]);

  // ── Branch-Resonance filtered exams ──────────────────────
  const filteredExams = selectedBranch === "ALL"
    ? allExams
    : allExams.filter(e => e.branch === selectedBranch);

  const activeExams = filteredExams.filter(e => e.is_active);
  const inactiveExams = filteredExams.filter(e => !e.is_active);

  // ── Warp Transition: Launch into exam ─────────────────────
  const handleLaunchExam = useCallback(async (exam: ExamNode) => {
    if (!exam.is_active) return;
    
    // If preview, update the mock student to match the branch of the clicked node
    if (sessionStorage.getItem("exam_preview") === "true") {
      const infoStr = sessionStorage.getItem("exam_student");
      if (infoStr) {
        const info = JSON.parse(infoStr);
        info.branch = exam.branch;
        sessionStorage.setItem("exam_student", JSON.stringify(info));
      }
    }

    setWarpTarget(exam);
    setWarpActive(true);
    
    // Weightlessly persist exam metadata for the session horizon
    sessionStorage.setItem("exam_selected_title", exam.exam_name);
    
    await new Promise(r => setTimeout(r, 1200));
    router.push("/exam");
  }, [router]);

  // ── Logout ────────────────────────────────────────────────
  const handleLogout = () => {
    sessionStorage.removeItem("exam_token");
    sessionStorage.removeItem("exam_student");
    router.replace("/login");
  };

  const branchColors = student ? (BRANCH_COLORS[student.branch] || DEFAULT_COLOR) : DEFAULT_COLOR;

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #06080f 0%, #0d1117 50%, #080c18 100%)",
        position: "relative",
        overflow: "hidden",
        fontFamily: "Inter, -apple-system, sans-serif",
        color: "#e2e8f0",
      }}
    >
      {/* ── Aurora Orbs ── */}
      {[
        { top: "5%", left: "10%", color: "rgba(99,102,241,0.12)", size: 500 },
        { top: "50%", right: "5%", color: "rgba(6,182,212,0.1)", size: 400 },
        { bottom: "10%", left: "35%", color: "rgba(139,92,246,0.08)", size: 350 },
      ].map((orb, i) => (
        <div
          key={i}
          data-dashboard-orb=""
          style={{
            position: "fixed",
            ...orb,
            width: orb.size,
            height: orb.size,
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            borderRadius: "50%",
            pointerEvents: "none",
            willChange: "transform",
          }}
        />
      ))}

      {/* Grid overlay */}
      <div style={{
        position: "fixed", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "50px 50px",
        pointerEvents: "none",
      }} />

      {/* ── WARP TRANSITION OVERLAY ── */}
      <AnimatePresence>
        {warpActive && warpTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: "fixed", inset: 0, zIndex: 9999,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(6,8,15,0.3)",
              backdropFilter: "blur(4px)",
            }}
          >
            {/* Radial warp rings */}
            {[0, 1, 2, 3].map(i => (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0.8 }}
                animate={{ scale: [0, 3 + i * 1.5], opacity: [0.8, 0] }}
                transition={{ duration: 1, delay: i * 0.15, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  width: 200,
                  height: 200,
                  borderRadius: "50%",
                  border: `${2 - i * 0.3}px solid rgba(6,182,212,${0.6 - i * 0.12})`,
                  boxShadow: `0 0 30px rgba(6,182,212,${0.4 - i * 0.08})`,
                }}
              />
            ))}

            {/* Crystalline Pane expanding */}
            <motion.div
              initial={{ scale: 0.1, opacity: 0, borderRadius: "50%" }}
              animate={{ scale: 20, opacity: [0, 1, 0], borderRadius: "0%" }}
              transition={{ duration: 1.1, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                position: "absolute",
                width: 120,
                height: 120,
                background: "linear-gradient(135deg, rgba(6,182,212,0.3), rgba(99,102,241,0.4))",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(6,182,212,0.5)",
              }}
            />

            {/* Central text */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 1.5] }}
              transition={{ duration: 1.1, times: [0, 0.3, 0.7, 1] }}
              style={{
                zIndex: 1, textAlign: "center",
                position: "relative",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
              <div style={{
                fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em",
                background: "linear-gradient(135deg, #06b6d4, #6366f1)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                Entering Exam Space
              </div>
              <div style={{ fontSize: 13, color: "rgba(148,163,184,0.7)", marginTop: 6 }}>
                {warpTarget.exam_name}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
        style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(6,8,15,0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          padding: "16px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #6366f1, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 16px rgba(6,182,212,0.3)",
          }}>
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <path d="M8 12h16M8 16h10M8 20h12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>ExamGuard</div>
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Student Node
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {student && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 16px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 999,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: `linear-gradient(135deg, ${branchColors.primary}, ${branchColors.accent})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#fff",
                boxShadow: `0 0 12px ${branchColors.glow}`,
              }}>
                {(student.name || "S").charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{student.name || student.id.slice(0, 8)}</div>
                <div style={{ fontSize: 11, color: branchColors.primary }}>{student.branch}</div>
              </div>
            </div>
          )}
          <motion.button
            onClick={handleLogout}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              padding: "8px 16px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 999,
              color: "#f87171",
              fontSize: 12, fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.05em",
            }}
          >
            Disconnect
          </motion.button>
        </div>
      </motion.header>

      {/* ── MAIN CONTENT ── */}
      <main style={{ padding: "40px 32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Hero Section ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ marginBottom: 48, textAlign: "center" }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 150 }}
            style={{
              display: "inline-block",
              padding: "6px 18px",
              borderRadius: 999,
              background: "rgba(6,182,212,0.1)",
              border: "1px solid rgba(6,182,212,0.25)",
              fontSize: 12, fontWeight: 600,
              color: "#06b6d4",
              letterSpacing: "0.1em", textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
              style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#06b6d4", marginRight: 8, verticalAlign: "middle" }}
            />
            Exam Discovery Portal
          </motion.div>

          <h1 style={{
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            background: "linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            lineHeight: 1.1,
            marginBottom: 12,
          }}>
            Welcome back,{" "}
            <span style={{
              background: `linear-gradient(135deg, ${branchColors.primary}, ${branchColors.accent})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              {student?.name?.split(" ")[0] || "Student"}
            </span>
          </h1>
          <p style={{ fontSize: 16, color: "rgba(148,163,184,0.65)", maxWidth: 480, margin: "0 auto" }}>
            Select your branch to discover active exam nodes. Active exams will crystallize for launch.
          </p>
        </motion.div>

        {/* ── Branch Resonance Filter ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          style={{ marginBottom: 40 }}
        >
          <div style={{
            fontSize: 11, fontWeight: 600, color: "rgba(148,163,184,0.5)",
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16,
            textAlign: "center",
          }}>
            ⊕ Branch Resonance Filter
          </div>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 10,
            justifyContent: "center",
          }}>
            {/* ALL button */}
            <motion.button
              onClick={() => setSelectedBranch("ALL")}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.96 }}
              style={{
                padding: "10px 22px",
                borderRadius: 999,
                background: selectedBranch === "ALL" ? "linear-gradient(135deg, #6366f1, #06b6d4)" : "rgba(255,255,255,0.04)",
                border: selectedBranch === "ALL" ? "1px solid rgba(6,182,212,0.4)" : "1px solid rgba(255,255,255,0.08)",
                color: selectedBranch === "ALL" ? "#fff" : "rgba(148,163,184,0.7)",
                fontSize: 13, fontWeight: 600,
                cursor: "pointer",
                boxShadow: selectedBranch === "ALL" ? "0 0 20px rgba(6,182,212,0.25)" : "none",
                transition: "all 0.25s ease",
              }}
            >
              All Branches
            </motion.button>

            {BRANCHES.map(b => {
              const colors = BRANCH_COLORS[b.id] || DEFAULT_COLOR;
              const isSelected = selectedBranch === b.id;
              return (
                <motion.button
                  key={b.id}
                  onClick={() => setSelectedBranch(b.id)}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 999,
                    background: isSelected ? `${colors.primary}25` : "rgba(255,255,255,0.03)",
                    border: isSelected ? `1px solid ${colors.primary}60` : "1px solid rgba(255,255,255,0.07)",
                    color: isSelected ? colors.accent : "rgba(148,163,184,0.6)",
                    fontSize: 13, fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: isSelected ? `0 0 16px ${colors.glow}` : "none",
                    transition: "all 0.25s ease",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {isSelected && (
                    <motion.span
                      animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                      transition={{ repeat: Infinity, duration: 1.8 }}
                      style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: colors.primary,
                        boxShadow: `0 0 6px ${colors.primary}`,
                        display: "inline-block",
                      }}
                    />
                  )}
                  {b.id}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* ── Exam Nodes Grid ── */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              style={{
                width: 40, height: 40,
                border: "2px solid rgba(6,182,212,0.2)",
                borderTopColor: "#06b6d4",
                borderRadius: "50%",
              }}
            />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedBranch}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Active Exams — Luminous Floating Nodes */}
              {activeExams.length > 0 && (
                <div style={{ marginBottom: 40 }}>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      marginBottom: 24,
                    }}
                  >
                    <motion.div
                      animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "#06b6d4",
                        boxShadow: "0 0 12px #06b6d4",
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#06b6d4", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Active Exam Nodes — {activeExams.length} Live
                    </span>
                  </motion.div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                    gap: 20,
                  }}>
                    <AnimatePresence>
                      {activeExams.map((exam, i) => (
                        <LuminousExamNode
                          key={exam.id}
                          exam={exam}
                          index={i}
                          onLaunch={handleLaunchExam}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Inactive Exams — Dimmed */}
              {inactiveExams.length > 0 && (
                <div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    marginBottom: 24,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: "#475569",
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(148,163,184,0.4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Inactive Nodes — {inactiveExams.length} Dormant
                    </span>
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                    gap: 20,
                  }}>
                    {inactiveExams.map((exam, i) => (
                      <DormantExamNode key={exam.id} exam={exam} index={i} />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {activeExams.length === 0 && inactiveExams.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    textAlign: "center", padding: "80px 20px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    borderRadius: 24,
                  }}
                >
                  <div style={{ fontSize: 56, marginBottom: 16 }}>🌌</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(148,163,184,0.7)", marginBottom: 8 }}>
                    No Exam Nodes Detected
                  </div>
                  <div style={{ fontSize: 14, color: "rgba(100,116,139,0.5)" }}>
                    No exams found for branch «{selectedBranch === "ALL" ? "All Branches" : selectedBranch}». Check back later.
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

// ── Luminous Active Exam Node ──────────────────────────────────
function LuminousExamNode({
  exam, index, onLaunch,
}: {
  exam: ExamNode;
  index: number;
  onLaunch: (exam: ExamNode) => void;
}) {
  const colors = BRANCH_COLORS[exam.branch] || DEFAULT_COLOR;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, filter: "blur(8px)" }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: [0.34, 1.56, 0.64, 1] }}
      whileHover={{ y: -8, transition: { duration: 0.25, ease: "easeOut" } }}
      style={{ position: "relative" }}
    >
      <motion.div
        animate={{
          boxShadow: [
            `0 0 20px ${colors.glow}, 0 4px 40px rgba(0,0,0,0.4)`,
            `0 0 40px ${colors.glow.replace("0.25", "0.45")}, 0 4px 60px rgba(0,0,0,0.5)`,
            `0 0 20px ${colors.glow}, 0 4px 40px rgba(0,0,0,0.4)`,
          ],
        }}
        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${colors.primary}30`,
          borderRadius: 24,
          padding: "28px 28px",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          position: "relative",
          overflow: "hidden",
          cursor: "pointer",
        }}
        onClick={() => onLaunch(exam)}
      >
        {/* Atmospheric depth gradient */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: `radial-gradient(ellipse at top left, ${colors.glow} 0%, transparent 60%)`,
          pointerEvents: "none",
          borderRadius: "inherit",
        }} />

        {/* Top corner accent */}
        <div style={{
          position: "absolute", top: 0, right: 0,
          width: 80, height: 80,
          background: `radial-gradient(circle at top right, ${colors.glow}, transparent)`,
          borderRadius: "0 24px 0 0",
        }} />

        {/* LIVE pulse indicator */}
        <div style={{
          position: "absolute", top: 20, right: 20,
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 12px",
          borderRadius: 999,
          background: "rgba(6,182,212,0.1)",
          border: "1px solid rgba(6,182,212,0.25)",
        }}>
          <motion.div
            animate={{ scale: [1, 1.5, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#06b6d4",
              boxShadow: "0 0 8px #06b6d4",
            }}
          />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#06b6d4", letterSpacing: "0.1em" }}>LIVE</span>
        </div>

        {/* Branch badge */}
        <div style={{ marginBottom: 16, position: "relative", zIndex: 1 }}>
          <span style={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: 999,
            background: `${colors.primary}20`,
            border: `1px solid ${colors.primary}50`,
            fontSize: 11, fontWeight: 700,
            color: colors.accent,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            {exam.branch}
          </span>
        </div>

        {/* Exam name */}
        <h3 style={{
          fontSize: 20, fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "#e2e8f0",
          marginBottom: 6,
          position: "relative", zIndex: 1,
          lineHeight: 1.2,
        }}>
          {exam.exam_name}
        </h3>

        {/* Metadata strip */}
        <div style={{
          display: "flex", gap: 16, marginTop: 14, marginBottom: 20,
          position: "relative", zIndex: 1,
        }}>
          {[
            { icon: "⏱", label: `${exam.duration_minutes} min` },
            { icon: "📋", label: `${exam.question_count ?? "—"} questions` },
            { icon: "🎯", label: exam.branch },
          ].map(({ icon, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(148,163,184,0.6)" }}>
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Launch button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={e => { e.stopPropagation(); onLaunch(exam); }}
          style={{
            width: "100%",
            padding: "13px 20px",
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
            border: "none",
            borderRadius: 14,
            color: "#fff",
            fontSize: 14, fontWeight: 700,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: `0 4px 20px ${colors.glow}`,
            position: "relative", zIndex: 1,
          }}
        >
          <span>Enter Exam Node</span>
          <motion.span
            animate={{ x: [0, 4, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          >→</motion.span>
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ── Dormant (Inactive) Exam Node ─────────────────────────────
function DormantExamNode({ exam, index }: { exam: ExamNode; index: number }) {
  const colors = BRANCH_COLORS[exam.branch] || DEFAULT_COLOR;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 24,
        padding: "28px 28px",
        opacity: 0.5,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <span style={{
          display: "inline-block",
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(100,116,139,0.1)",
          border: "1px solid rgba(100,116,139,0.2)",
          fontSize: 11, fontWeight: 700,
          color: "rgba(100,116,139,0.6)",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {exam.branch}
        </span>
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(148,163,184,0.5)", marginBottom: 6 }}>
        {exam.exam_name}
      </h3>
      <div style={{ fontSize: 12, color: "rgba(100,116,139,0.5)", marginBottom: 16 }}>
        ⏱ {exam.duration_minutes} min · {exam.question_count ?? "—"} questions
      </div>
      <div style={{
        padding: "11px 20px",
        background: "rgba(239,68,68,0.06)",
        border: "1px solid rgba(239,68,68,0.12)",
        borderRadius: 12,
        color: "rgba(248,113,113,0.5)",
        fontSize: 13, fontWeight: 600,
        textAlign: "center",
      }}>
        🔒 Deactivated by Admin
      </div>
    </motion.div>
  );
}
