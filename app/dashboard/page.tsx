"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { fetchPublicExamConfig } from "@/lib/api";

interface ExamNode {
  id: string; exam_name: string; branch: string; is_active: boolean;
  duration_minutes: number; scheduled_start: string | null;
  question_count?: number; category: string;
}
interface StudentInfo {
  id: string; name: string; email: string; branch: string;
  examStartTime: string | null; examDurationMinutes: number;
}

const NAV_ITEMS = [
  { id: "Home", icon: "🏠", label: "Home" },
  { id: "Aptitude", icon: "📝", label: "Aptitude Test" },
  { id: "Programming", icon: "💻", label: "Programming" },
  { id: "Profile", icon: "👤", label: "Profile" },
  { id: "Others", icon: "📦", label: "Others" },
];

function getTimeUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000);
  return `${d}D ${h}H`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [activeNav, setActiveNav] = useState("Home");
  const [allExams, setAllExams] = useState<ExamNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [warpActive, setWarpActive] = useState(false);

  useEffect(() => {
    const p = localStorage.getItem("nexus_profile_photo");
    if (p) setProfilePhoto(p);
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem("exam_student");
    const token = sessionStorage.getItem("exam_token");
    if (!raw || !token) { router.replace("/login"); return; }
    setStudent(JSON.parse(raw));
  }, [router]);

  const loadExams = useCallback(async () => {
    try {
      const configs = await fetchPublicExamConfig();
      const active = configs.filter(c => c.is_active);
      const { data: qData } = await supabase.from("questions").select("branch, exam_name, category");
      const nodes: ExamNode[] = []; const seen = new Set<string>();
      if (qData && active.length > 0) {
        for (const cfg of active) {
          const qs = (qData || []).filter((q: any) => q.exam_name === cfg.exam_title);
          const groups: Record<string, { count: number; category: string }> = {};
          qs.forEach((q: any) => {
            const br = q.branch || "CS", cat = q.category || "Others";
            if (!groups[br]) groups[br] = { count: 0, category: cat };
            groups[br].count++;
          });
          Object.entries(groups).forEach(([branch, data]) => {
            const nid = `${cfg.exam_title}-${branch}`;
            if (!seen.has(nid)) {
              nodes.push({ id: nid, exam_name: cfg.exam_title, branch, is_active: cfg.is_active,
                duration_minutes: cfg.duration_minutes, scheduled_start: cfg.scheduled_start,
                question_count: data.count, category: data.category });
              seen.add(nid);
            }
          });
        }
      }
      setAllExams(nodes);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadExams();
    const ch1 = supabase.channel("ec").on("postgres_changes", { event: "*", schema: "public", table: "exam_config" }, () => loadExams()).subscribe();
    const ch2 = supabase.channel("qc").on("postgres_changes", { event: "*", schema: "public", table: "questions" }, () => loadExams()).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [loadExams]);

  const filteredExams = allExams.filter(e => {
    if (activeNav === "Home") return true;
    if (activeNav === "Profile") return false;
    return e.category === activeNav;
  });

  const handleLaunch = useCallback(async (exam: ExamNode) => {
    if (!exam.is_active) return;
    setWarpActive(true);
    sessionStorage.setItem("exam_selected_title", exam.exam_name);
    await new Promise(r => setTimeout(r, 1000));
    router.push("/instructions");
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem("exam_token");
    sessionStorage.removeItem("exam_student");
    router.replace("/login");
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const r = new FileReader();
      r.onloadend = () => { const b = r.result as string; setProfilePhoto(b); localStorage.setItem("nexus_profile_photo", b); };
      r.readAsDataURL(f);
    }
  };

  const removePhoto = () => { setProfilePhoto(null); localStorage.removeItem("nexus_profile_photo"); };

  // Styles
  const S = {
    page: { display: "flex", minHeight: "100vh", background: "#f0f2f5", fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#1a1a2e" } as React.CSSProperties,
    sidebar: { width: 240, background: "#fff", borderRight: "1px solid #e8e8ed", display: "flex", flexDirection: "column" as const, boxShadow: "2px 0 8px rgba(0,0,0,0.04)" } as React.CSSProperties,
    logo: { padding: "24px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #f0f0f5" } as React.CSSProperties,
    logoIcon: { width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #4f46e5, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 16 } as React.CSSProperties,
    logoText: { fontSize: 16, fontWeight: 700, color: "#4f46e5" } as React.CSSProperties,
    nav: { padding: "16px 12px", display: "flex", flexDirection: "column" as const, gap: 4, flex: 1 } as React.CSSProperties,
    navBtn: (active: boolean) => ({ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontWeight: active ? 600 : 500, background: active ? "linear-gradient(135deg, #f0edff, #e8e4ff)" : "transparent", color: active ? "#4f46e5" : "#64748b", transition: "all 0.2s", width: "100%" }) as React.CSSProperties,
    topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", background: "#fff", borderBottom: "1px solid #e8e8ed", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" } as React.CSSProperties,
    topLeft: { display: "flex", alignItems: "center", gap: 12 } as React.CSSProperties,
    topTitle: { fontSize: 16, fontWeight: 700, color: "#1a1a2e" } as React.CSSProperties,
    topSub: { fontSize: 12, color: "#94a3b8" } as React.CSSProperties,
    userArea: { display: "flex", alignItems: "center", gap: 12, cursor: "pointer" } as React.CSSProperties,
    avatar: (size: number) => ({ width: size, height: size, borderRadius: "50%", background: "#e2e8f0", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #e0e0e5", flexShrink: 0 }) as React.CSSProperties,
    main: { flex: 1, display: "flex", flexDirection: "column" as const } as React.CSSProperties,
    content: { flex: 1, padding: "32px 40px", overflowY: "auto" as const } as React.CSSProperties,
    sectionTitle: { fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#1a1a2e" } as React.CSSProperties,
    sectionSub: { fontSize: 14, color: "#94a3b8", marginBottom: 28 } as React.CSSProperties,
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 24 } as React.CSSProperties,
    card: { background: "#fff", borderRadius: 16, padding: 28, border: "1px solid #e8e8ed", position: "relative" as const, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" } as React.CSSProperties,
    cardBg: { position: "absolute" as const, top: 0, right: 0, width: 120, height: 120, background: "radial-gradient(circle at top right, rgba(79,70,229,0.06), transparent 70%)" } as React.CSSProperties,
    badge: (color: string) => ({ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: color, color: "#fff" }) as React.CSSProperties,
    cardTitle: { fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#1a1a2e" } as React.CSSProperties,
    cardMeta: { display: "flex", gap: 16, marginBottom: 20, fontSize: 13, color: "#64748b" } as React.CSSProperties,
    progressBar: { width: "100%", height: 6, background: "#e2e8f0", borderRadius: 3, marginBottom: 16, overflow: "hidden" } as React.CSSProperties,
    progressFill: (pct: number, color: string) => ({ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s" }) as React.CSSProperties,
    startBtn: { padding: "10px 28px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: "#4f46e5", color: "#fff", transition: "all 0.2s" } as React.CSSProperties,
    insightCard: { background: "#fff", borderRadius: 16, padding: 24, border: "1px solid #e8e8ed", textAlign: "center" as const } as React.CSSProperties,
    modal: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 } as React.CSSProperties,
    modalBox: { width: "100%", maxWidth: 420, background: "#fff", borderRadius: 20, padding: 32 } as React.CSSProperties,
  };

  const completedExams = allExams.filter(e => !e.is_active).length;
  const totalExams = allExams.length;

  return (
    <div style={S.page}>
      {/* SIDEBAR */}
      <aside style={S.sidebar}>
        <div style={S.logo}>
          <div style={S.logoIcon}>N</div>
          <div>
            <div style={S.logoText}>Nexus Portal</div>
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 500 }}>Assessment Platform</div>
          </div>
        </div>
        <nav style={S.nav}>
          {NAV_ITEMS.map(item => (
            <motion.button key={item.id} whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}
              style={S.navBtn(activeNav === item.id)}
              onClick={() => { setActiveNav(item.id); if (item.id === "Profile") setShowProfileModal(true); }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
              {activeNav === item.id && <div style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#4f46e5" }} />}
            </motion.button>
          ))}
        </nav>
        <div style={{ padding: "16px 12px", borderTop: "1px solid #f0f0f5" }}>
          <button onClick={handleLogout}
            style={{ width: "100%", padding: 10, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN AREA */}
      <div style={S.main}>
        {/* TOP BAR */}
        <div style={S.topBar}>
          <div style={S.topLeft}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f0edff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 18 }}>📊</span>
            </div>
            <div>
              <div style={S.topTitle}>Nexus Assessment</div>
              <div style={S.topSub}>Candidate Portal</div>
            </div>
          </div>
          <div style={S.userArea} onClick={() => setShowProfileModal(true)}>
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{student?.name || "Student"}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{student?.email || "Candidate"}</div>
            </div>
            <div style={S.avatar(40)}>
              {profilePhoto ? <img src={profilePhoto} alt="P" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 16, fontWeight: 700, color: "#4f46e5" }}>{student?.name?.[0] || "S"}</span>}
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div style={S.content}>
          {activeNav === "Profile" || showProfileModal ? null : (
            <>
              <h2 style={S.sectionTitle}>
                {activeNav === "Home" ? "Upcoming Exams" : `${activeNav} Exams`}
              </h2>
              <p style={S.sectionSub}>
                {activeNav === "Home" ? "View your scheduled assessments" : `Browse ${activeNav.toLowerCase()} assessments`}
              </p>

              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#4f46e5", borderRadius: "50%" }} />
                </div>
              ) : (
                <div style={S.grid}>
                  {filteredExams.map((exam, i) => {
                    const timeUntil = getTimeUntil(exam.scheduled_start);
                    const scheduled = !!exam.scheduled_start;
                    const schedDate = exam.scheduled_start ? new Date(exam.scheduled_start) : null;
                    return (
                      <motion.div key={exam.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08 }} whileHover={{ y: -3, boxShadow: "0 8px 30px rgba(0,0,0,0.08)" }} style={S.card}>
                        <div style={S.cardBg} />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, position: "relative" as const }}>
                          <h3 style={S.cardTitle}>{exam.exam_name}</h3>
                          <span style={S.badge(scheduled ? "#8b5cf6" : "#10b981")}>{scheduled ? "Scheduled" : "Active"}</span>
                        </div>
                        <div style={S.cardMeta}>
                          {schedDate && <span>📅 {schedDate.toISOString().split("T")[0]}</span>}
                          {schedDate && <span>🕐 {schedDate.toTimeString().slice(0, 5)}</span>}
                          <span>⏱ {exam.duration_minutes} min</span>
                        </div>
                        <div style={S.progressBar}>
                          <div style={S.progressFill(timeUntil ? 40 : 80, "#4f46e5")} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <button style={S.startBtn} onClick={() => handleLaunch(exam)}>Start Exam</button>
                          {timeUntil && <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>Starts in {timeUntil}</span>}
                        </div>
                      </motion.div>
                    );
                  })}
                  {filteredExams.length === 0 && (
                    <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 80, background: "#fff", border: "1px dashed #d4d4d8", borderRadius: 16 }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>No exams available</h3>
                      <p style={{ fontSize: 13, color: "#94a3b8" }}>Check back later for new assessments.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Insights */}
              {activeNav === "Home" && (
                <div style={{ marginTop: 40 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#1a1a2e" }}>Quick Insights</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                    <div style={S.insightCard}>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Available Exams</div>
                      <div style={{ fontSize: 32, fontWeight: 800, color: "#4f46e5" }}>{totalExams}</div>
                    </div>
                    <div style={S.insightCard}>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Your Branch</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>{student?.branch || "—"}</div>
                    </div>
                    <div style={S.insightCard}>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Categories</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>
                        {new Set(allExams.map(e => e.category)).size}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* PROFILE MODAL */}
      <AnimatePresence>
        {showProfileModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={S.modal}
            onClick={(e) => { if (e.target === e.currentTarget) setShowProfileModal(false); }}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} style={S.modalBox}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>My Profile</h3>
                <button onClick={() => setShowProfileModal(false)}
                  style={{ background: "none", border: "none", fontSize: 22, color: "#94a3b8", cursor: "pointer" }}>×</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
                <div style={{ ...S.avatar(100), border: "3px solid #4f46e5", marginBottom: 16, position: "relative" as const }}>
                  {profilePhoto ? <img src={profilePhoto} alt="P" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 36, fontWeight: 700, color: "#4f46e5" }}>{student?.name?.[0]}</span>}
                  <label style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, background: "rgba(0,0,0,0.6)",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 11, color: "#fff" }}>
                    📷 Change
                    <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                  </label>
                </div>
                {profilePhoto && (
                  <button onClick={removePhoto} style={{ fontSize: 12, color: "#ef4444", background: "none", border: "none", cursor: "pointer", marginBottom: 8 }}>
                    Remove Photo
                  </button>
                )}
                <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>{student?.name}</div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>{student?.email}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { label: "Student ID", value: student?.id },
                  { label: "Branch", value: student?.branch },
                  { label: "Email", value: student?.email },
                ].map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase" as const }}>{f.label}</div>
                    <div style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 10, fontSize: 14, color: "#1a1a2e", border: "1px solid #e8e8ed" }}>{f.value || "—"}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 16, textAlign: "center" as const }}>
                📱 Your photo is stored locally on this device only
              </div>
              <button onClick={() => setShowProfileModal(false)}
                style={{ width: "100%", padding: 14, borderRadius: 12, background: "#4f46e5", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", marginTop: 20, fontSize: 14 }}>
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WARP OVERLAY */}
      <AnimatePresence>
        {warpActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
            <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#4f46e5" }}>Loading Assessment...</h2>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
