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
  category: string;
}

interface StudentInfo {
  id: string;
  name: string;
  email: string;
  branch: string;
  examStartTime: string | null;
  examDurationMinutes: number;
}

// ── Categories ────────────────────────────────────────────────
const CATEGORIES = [
  { id: "Aptitude", icon: "🧠", color: "#6366f1" },
  { id: "Programming", icon: "💻", color: "#06b6d4" },
  { id: "Others", icon: "📦", color: "#8b5cf6" },
];

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

export default function DashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("Aptitude");
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [allExams, setAllExams] = useState<ExamNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [warpTarget, setWarpTarget] = useState<ExamNode | null>(null);
  const [warpActive, setWarpActive] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const orbAnimRef = useRef<number>(0);

  // Load profile photo from localStorage
  useEffect(() => {
    const photo = localStorage.getItem("nexus_profile_photo");
    if (photo) setProfilePhoto(photo);
  }, []);

  // Aurora orb animation
  useEffect(() => {
    let t = 0;
    const orbs = containerRef.current?.querySelectorAll("[data-dashboard-orb]");
    const animate = () => {
      t += 0.002;
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

  // Load exams
  const loadExams = useCallback(async () => {
    try {
      const configs = await fetchPublicExamConfig();
      const activeConfigs = configs.filter(c => c.is_active);

      const { data: qData } = await supabase
        .from("questions")
        .select("branch, exam_name, category");

      const nodes: ExamNode[] = [];
      const seen = new Set<string>();

      if (qData && activeConfigs.length > 0) {
        for (const config of activeConfigs) {
          const relevantQuestions = (qData || []).filter((q: any) => q.exam_name === config.exam_title);
          
          const branchGroups: Record<string, { count: number; category: string }> = {};
          relevantQuestions.forEach((q: any) => {
            const br = q.branch || "CS";
            const cat = q.category || "Others";
            if (!branchGroups[br]) {
              branchGroups[br] = { count: 0, category: cat };
            }
            branchGroups[br].count++;
          });

          Object.entries(branchGroups).forEach(([branch, data]) => {
            const nodeId = `${config.exam_title}-${branch}`;
            if (!seen.has(nodeId)) {
              nodes.push({
                id: nodeId,
                exam_name: config.exam_title,
                branch,
                is_active: config.is_active,
                duration_minutes: config.duration_minutes,
                scheduled_start: config.scheduled_start,
                question_count: data.count,
                category: data.category,
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
    const channel = supabase.channel("exam_changes").on("postgres_changes", { event: "*", schema: "public", table: "exam_config" }, () => loadExams()).subscribe();
    const qChannel = supabase.channel("question_changes").on("postgres_changes", { event: "*", schema: "public", table: "questions" }, () => loadExams()).subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(qChannel);
    };
  }, [loadExams]);

  const filteredExams = allExams.filter(e => {
    const matchCategory = e.category === selectedCategory;
    const matchBranch = selectedBranch === "ALL" || e.branch === selectedBranch;
    const studentMatch = !student || student.branch === "ALL" || e.branch === student.branch;
    return matchCategory && matchBranch && studentMatch;
  });

  const handleLaunchExam = useCallback(async (exam: ExamNode) => {
    if (!exam.is_active) return;
    setWarpTarget(exam);
    setWarpActive(true);
    sessionStorage.setItem("exam_selected_title", exam.exam_name);
    await new Promise(r => setTimeout(r, 1200));
    router.push("/exam");
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem("exam_token");
    sessionStorage.removeItem("exam_student");
    router.replace("/login");
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setProfilePhoto(base64);
        localStorage.setItem("nexus_profile_photo", base64);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div ref={containerRef} style={{ display: "flex", minHeight: "100vh", background: "#06080f", color: "#e2e8f0", fontFamily: "Inter, sans-serif", overflow: "hidden" }}>
      {/* ── Aurora Orbs ── */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <div data-dashboard-orb="" style={{ position: "absolute", top: "10%", left: "10%", width: 600, height: 600, background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)", borderRadius: "50%" }} />
        <div data-dashboard-orb="" style={{ position: "absolute", bottom: "10%", right: "10%", width: 500, height: 500, background: "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)", borderRadius: "50%" }} />
      </div>

      {/* ── SIDEBAR ── */}
      <aside style={{ width: 280, background: "rgba(13,17,23,0.7)", backdropFilter: "blur(20px)", borderRight: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", zIndex: 10 }}>
        <div style={{ padding: "32px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 40 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #6366f1, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(6,182,212,0.3)" }}>
              <span style={{ fontSize: 20, fontWeight: "bold" }}>N</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", background: "linear-gradient(135deg, #fff, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Nexus Portal</span>
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {CATEGORIES.map(cat => (
              <motion.button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12,
                  background: selectedCategory === cat.id ? "rgba(255,255,255,0.05)" : "transparent",
                  border: "none", cursor: "pointer", color: selectedCategory === cat.id ? "#fff" : "rgba(148,163,184,0.6)",
                  fontSize: 14, fontWeight: 600, transition: "all 0.2s"
                }}
              >
                <span style={{ fontSize: 18 }}>{cat.icon}</span>
                {cat.id}
                {selectedCategory === cat.id && (
                  <motion.div layoutId="activeCat" style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: cat.color, boxShadow: `0 0 10px ${cat.color}` }} />
                )}
              </motion.button>
            ))}
          </nav>
        </div>

        <div style={{ marginTop: "auto", padding: 24, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          {student && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div 
                onClick={() => setIsEditingProfile(true)}
                style={{ 
                  width: 44, height: 44, borderRadius: "50%", background: "#1e293b", overflow: "hidden", cursor: "pointer",
                  border: "2px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                {profilePhoto ? (
                  <img src={profilePhoto} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 18, fontWeight: "bold", color: "#6366f1" }}>{student.name[0]}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{student.name}</div>
                <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{student.email}</div>
              </div>
            </div>
          )}
          <button 
            onClick={handleLogout}
            style={{ width: "100%", padding: "10px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Disconnect Session
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, padding: "48px 64px", position: "relative", zIndex: 1, overflowY: "auto" }}>
        <header style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Hello, {student?.name.split(" ")[0]}!</h2>
          <p style={{ color: "rgba(148,163,184,0.6)" }}>Explore the {selectedCategory} modules and start your evaluation.</p>
        </header>

        {/* Branch Filter */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
          <button 
            onClick={() => setSelectedBranch("ALL")}
            style={{ 
              padding: "8px 20px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: selectedBranch === "ALL" ? "#6366f1" : "rgba(255,255,255,0.05)",
              border: "none", color: selectedBranch === "ALL" ? "#fff" : "rgba(148,163,184,0.6)"
            }}
          >
            All Branches
          </button>
          {BRANCHES.map(b => (
            <button 
              key={b.id}
              onClick={() => setSelectedBranch(b.id)}
              style={{ 
                padding: "8px 20px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: selectedBranch === b.id ? "#6366f1" : "rgba(255,255,255,0.05)",
                border: "none", color: selectedBranch === b.id ? "#fff" : "rgba(148,163,184,0.6)"
              }}
            >
              {b.id}
            </button>
          ))}
        </div>

        {/* Exam Grid */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 100 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#6366f1", borderRadius: "50%" }} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 24 }}>
            {filteredExams.map((exam, i) => (
              <motion.div
                key={exam.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 24, padding: 32,
                  position: "relative", overflow: "hidden", cursor: "pointer"
                }}
                onClick={() => handleLaunchExam(exam)}
              >
                <div style={{ position: "absolute", top: 0, right: 0, width: 100, height: 100, background: `radial-gradient(circle at top right, ${BRANCH_COLORS[exam.branch]?.glow || "rgba(99,102,241,0.1)"}, transparent 70%)` }} />
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: BRANCH_COLORS[exam.branch]?.accent || "#6366f1", background: BRANCH_COLORS[exam.branch]?.glow || "rgba(99,102,241,0.1)", padding: "4px 12px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {exam.branch}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px #10b981" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981" }}>LIVE</span>
                  </div>
                </div>

                <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, lineHeight: 1.2 }}>{exam.exam_name}</h3>
                
                <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                  <div style={{ fontSize: 13, color: "rgba(148,163,184,0.5)" }}>⏱ {exam.duration_minutes}m</div>
                  <div style={{ fontSize: 13, color: "rgba(148,163,184,0.5)" }}>📋 {exam.question_count} Questions</div>
                </div>

                <button 
                  style={{ width: "100%", padding: "14px", borderRadius: 16, background: "linear-gradient(135deg, #6366f1, #06b6d4)", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  Enter Exam Node
                  <span style={{ fontSize: 18 }}>→</span>
                </button>
              </motion.div>
            ))}

            {filteredExams.length === 0 && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "80px 0", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 24 }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🛰️</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(148,163,184,0.6)" }}>No nodes detected in this sector</h3>
                <p style={{ fontSize: 14, color: "rgba(148,163,184,0.4)" }}>Check different categories or wait for admin signals.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── PROFILE MODAL ── */}
      <AnimatePresence>
        {isEditingProfile && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              style={{ width: "100%", maxWidth: 400, background: "#0d1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: 32 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
                <h3 style={{ fontSize: 24, fontWeight: 800 }}>Profile Settings</h3>
                <button onClick={() => setIsEditingProfile(false)} style={{ background: "none", border: "none", color: "rgba(148,163,184,0.5)", fontSize: 24, cursor: "pointer" }}>×</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
                <div style={{ width: 100, height: 100, borderRadius: "50%", background: "#1e293b", overflow: "hidden", marginBottom: 16, border: "3px solid #6366f1", position: "relative" }}>
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: "bold", color: "#6366f1" }}>
                      {student?.name[0]}
                    </div>
                  )}
                  <label style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 30, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 }}>
                    Change
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
                  </label>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{student?.name}</div>
                  <div style={{ fontSize: 14, color: "rgba(148,163,184,0.5)" }}>{student?.email}</div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(148,163,184,0.5)", marginBottom: 8, display: "block" }}>Branch</label>
                  <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.05)", borderRadius: 12, fontSize: 14 }}>{student?.branch}</div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(148,163,184,0.5)", marginBottom: 8, display: "block" }}>Student ID</label>
                  <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.05)", borderRadius: 12, fontSize: 14 }}>{student?.id}</div>
                </div>
              </div>

              <button 
                onClick={() => setIsEditingProfile(false)}
                style={{ width: "100%", padding: "14px", borderRadius: 16, background: "#6366f1", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", marginTop: 32 }}
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── WARP TRANSITION OVERLAY ── */}
      <AnimatePresence>
        {warpActive && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "#06080f" }}
          >
             <motion.div
              initial={{ scale: 0.1, opacity: 0 }}
              animate={{ scale: [0.1, 1, 10], opacity: [0, 1, 0] }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
              style={{ width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, #6366f1 0%, transparent 70%)", filter: "blur(20px)" }}
            />
            <div style={{ position: "absolute", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
              <h2 style={{ fontSize: 24, fontWeight: 800 }}>Engaging Subspace...</h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
