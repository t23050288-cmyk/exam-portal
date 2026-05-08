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
  { id: "Home",        icon: "⌂",  label: "Home" },
  { id: "Aptitude",   icon: "◈",  label: "Aptitude Test" },
  { id: "Programming",icon: "</>", label: "Programming" },
  { id: "Profile",    icon: "○",  label: "Profile" },
  { id: "History",    icon: "◷",  label: "History" },
  { id: "Skills",     icon: "↑",  label: "Skills Insights" },
];

function getTimeUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000);
  return `${d}D ${h}H`;
}

/* ── Star field background ──────────────────────────────── */
function StarField() {
  const stars = Array.from({ length: 120 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 0.5,
    opacity: Math.random() * 0.7 + 0.2,
    delay: Math.random() * 4,
  }));
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      {stars.map(s => (
        <div key={s.id} style={{
          position: "absolute", left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size,
          borderRadius: "50%", background: "#fff",
          opacity: s.opacity,
          animation: `twinkle ${2 + s.delay}s ease-in-out infinite alternate`,
        }} />
      ))}
    </div>
  );
}

/* ── Notification dropdown ──────────────────────────────── */
function NotifDropdown({ exams, onClose }: { exams: ExamNode[]; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }}
      style={{
        position: "absolute", top: "calc(100% + 10px)", right: 0,
        width: 280, background: "rgba(12,20,40,0.95)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(100,140,255,0.25)",
        borderRadius: 14, overflow: "hidden", zIndex: 200,
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(100,140,255,0.15)" }}>
        <span style={{ color: "#a0b4d0", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Notifications</span>
      </div>
      {exams.slice(0, 3).map(e => (
        <div key={e.id} style={{
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
          borderBottom: "1px solid rgba(100,140,255,0.08)",
          transition: "background 0.2s", cursor: "default",
        }}
          onMouseEnter={el => (el.currentTarget.style.background = "rgba(100,140,255,0.08)")}
          onMouseLeave={el => (el.currentTarget.style.background = "transparent")}
        >
          <span style={{ fontSize: 16 }}>🔔</span>
          <span style={{ flex: 1, fontSize: 13, color: "#c8d8f0" }}>{e.exam_name} results ready</span>
          <span style={{
            width: 18, height: 18, borderRadius: 4,
            border: "1px solid rgba(100,200,255,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "#64c8ff",
          }}>✓</span>
        </div>
      ))}
      {exams.length === 0 && (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "#6080a0", fontSize: 13 }}>No new notifications</div>
      )}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#8090b0", fontSize: 13 }}
        onClick={onClose}>
        <span>⚙</span> Options
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [activeNav, setActiveNav] = useState("Home");
  const [allExams, setAllExams] = useState<ExamNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [warpActive, setWarpActive] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [completedCount] = useState(8);

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
      const active = configs.filter((c: any) => c.is_active);
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
                question_count: (data as any).count, category: (data as any).category });
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
    if (activeNav === "Profile" || activeNav === "History" || activeNav === "Skills") return false;
    return e.category === activeNav;
  });

  const upcomingExams = allExams.filter(e => e.scheduled_start && getTimeUntil(e.scheduled_start));

  const handleLaunch = useCallback(async (exam: ExamNode) => {
    if (!exam.is_active) return;
    setWarpActive(true);
    sessionStorage.setItem("exam_selected_title", exam.exam_name);
    await new Promise(r => setTimeout(r, 900));
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

  const skillScore = 85;

  /* ── SIDEBAR CONTENT ── */
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{ padding: "28px 24px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(100,160,255,0.3), rgba(60,100,200,0.15))",
          border: "1.5px solid rgba(100,160,255,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 16px rgba(80,140,255,0.3)",
        }}>
          <span style={{ fontSize: 18, filter: "drop-shadow(0 0 6px #64a0ff)" }}>⚛</span>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#d0e4ff", letterSpacing: 2, textTransform: "uppercase" }}>NEXUS</div>
          <div style={{ fontSize: 10, color: "#5a7090", letterSpacing: 1.5, textTransform: "uppercase" }}>Candidate Portal</div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(100,160,255,0.2), transparent)", margin: "0 16px 16px" }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: "0 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const active = activeNav === item.id;
          return (
            <motion.button key={item.id}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setActiveNav(item.id); setMobileMenuOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 16px", borderRadius: 10, border: "none",
                cursor: "pointer", fontSize: 14, fontWeight: active ? 600 : 400,
                background: active
                  ? "linear-gradient(135deg, rgba(80,140,255,0.25), rgba(60,100,200,0.15))"
                  : "transparent",
                color: active ? "#a0c8ff" : "#5a7090",
                borderLeft: active ? "2px solid rgba(100,180,255,0.8)" : "2px solid transparent",
                width: "100%", textAlign: "left",
                transition: "all 0.2s",
                backdropFilter: active ? "blur(8px)" : "none",
              }}>
              <span style={{ fontSize: 15, width: 20, textAlign: "center", opacity: active ? 1 : 0.6 }}>{item.icon}</span>
              {item.label}
              {active && <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(100,180,255,0.6)" }}>›</span>}
            </motion.button>
          );
        })}
      </nav>

      {/* Bottom atom icon */}
      <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
        <div style={{
          width: 48, height: 48,
          background: "radial-gradient(circle, rgba(80,120,200,0.2), transparent)",
          border: "1px solid rgba(80,120,200,0.2)",
          borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 24, opacity: 0.4, filter: "drop-shadow(0 0 8px rgba(80,140,255,0.5))" }}>⚛</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Global styles injected */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        @keyframes twinkle {
          from { opacity: 0.15; transform: scale(0.8); }
          to   { opacity: 0.9;  transform: scale(1.2); }
        }
        @keyframes warpIn {
          0%   { opacity:1; transform: scale(1);    filter: blur(0); }
          100% { opacity:0; transform: scale(4);    filter: blur(20px); }
        }
        @keyframes nebula {
          0%,100% { transform: scale(1)   rotate(0deg); }
          50%     { transform: scale(1.1) rotate(3deg); }
        }
        @keyframes shimmerBar {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        @keyframes fadeSlideUp {
          from { opacity:0; transform: translateY(18px); }
          to   { opacity:1; transform: translateY(0); }
        }
        .nexus-card {
          background: rgba(10,18,35,0.75);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(80,140,255,0.18);
          border-radius: 16px;
          transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s;
        }
        .nexus-card:hover {
          border-color: rgba(100,180,255,0.4);
          box-shadow: 0 0 28px rgba(60,120,255,0.18), 0 4px 24px rgba(0,0,0,0.5);
          transform: translateY(-2px);
        }
        .start-btn {
          padding: 9px 22px;
          border-radius: 8px; border: none;
          font-weight: 700; font-size: 13px; cursor: pointer;
          background: linear-gradient(135deg, rgba(80,140,255,0.9), rgba(60,100,220,0.9));
          color: #fff;
          box-shadow: 0 0 14px rgba(80,140,255,0.35);
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }
        .start-btn:hover { box-shadow: 0 0 22px rgba(80,140,255,0.6); transform: translateY(-1px); }
        .start-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .hamburger-btn { display: none; }
        .sidebar-overlay { display: none; }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          .nexus-sidebar { transform: translateX(-100%); transition: transform 0.3s ease; }
          .nexus-sidebar.open { transform: translateX(0) !important; }
          .hamburger-btn { display: flex !important; }
          .sidebar-overlay.open { display: block !important; }
          .nexus-topbar-title { display: none; }
          .nexus-content-area { padding: 16px !important; }
          .nexus-grid { grid-template-columns: 1fr !important; }
          .nexus-insights-row { flex-direction: column !important; }
          .upcoming-wide { grid-column: span 1 !important; }
        }
        @media (max-width: 480px) {
          .nexus-topbar { padding: 12px 16px !important; }
          .nexus-header-text h1 { font-size: 18px !important; }
        }
      `}</style>

      {/* Warp transition overlay */}
      <AnimatePresence>
        {warpActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "radial-gradient(circle, rgba(80,140,255,0.4) 0%, rgba(5,10,25,0.98) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.2, opacity: 1 }}
              style={{ color: "#a0c8ff", fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
              Entering Exam...
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Star Field */}
      <StarField />

      {/* Root */}
      <div style={{
        display: "flex", minHeight: "100vh",
        background: "linear-gradient(135deg, #050a19 0%, #0a1428 40%, #060d20 100%)",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        color: "#c8d8f0", position: "relative",
        overflowX: "hidden",
      }}>

        {/* Nebula bg blobs */}
        <div style={{
          position: "fixed", top: "10%", left: "20%", width: 500, height: 500,
          background: "radial-gradient(circle, rgba(40,80,180,0.12) 0%, transparent 70%)",
          borderRadius: "50%", pointerEvents: "none", zIndex: 0,
          animation: "nebula 12s ease-in-out infinite",
        }} />
        <div style={{
          position: "fixed", bottom: "5%", right: "15%", width: 400, height: 400,
          background: "radial-gradient(circle, rgba(80,40,160,0.1) 0%, transparent 70%)",
          borderRadius: "50%", pointerEvents: "none", zIndex: 0,
          animation: "nebula 16s ease-in-out infinite reverse",
        }} />

        {/* Mobile overlay */}
        <div className={`sidebar-overlay ${mobileMenuOpen ? "open" : ""}`}
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 149, backdropFilter: "blur(4px)",
          }} />

        {/* SIDEBAR */}
        <aside className={`nexus-sidebar ${mobileMenuOpen ? "open" : ""}`} style={{
          width: 220, flexShrink: 0,
          background: "rgba(8,15,30,0.92)",
          backdropFilter: "blur(24px)",
          borderRight: "1px solid rgba(80,120,200,0.18)",
          display: "flex", flexDirection: "column",
          position: "fixed", top: 0, left: 0, height: "100vh",
          zIndex: 150, overflowY: "auto",
          boxShadow: "4px 0 32px rgba(0,0,0,0.5)",
        }}>
          <SidebarContent />
        </aside>

        {/* Main area (offset for sidebar on desktop) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", marginLeft: 220, minHeight: "100vh", position: "relative", zIndex: 1 }}
          className="nexus-main">

          {/* TOP BAR */}
          <header className="nexus-topbar" style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "16px 32px",
            background: "rgba(8,14,28,0.85)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(80,120,200,0.18)",
            position: "sticky", top: 0, zIndex: 100,
            gap: 12,
          }}>
            {/* Left: hamburger + title */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button className="hamburger-btn" onClick={() => setMobileMenuOpen(o => !o)}
                style={{
                  background: "rgba(80,140,255,0.12)", border: "1px solid rgba(80,140,255,0.3)",
                  borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: "#a0c8ff",
                  display: "none", flexDirection: "column", gap: 4,
                }}>
                <span style={{ display: "block", width: 18, height: 2, background: "#a0c8ff", borderRadius: 2 }} />
                <span style={{ display: "block", width: 14, height: 2, background: "#a0c8ff", borderRadius: 2 }} />
                <span style={{ display: "block", width: 18, height: 2, background: "#a0c8ff", borderRadius: 2 }} />
              </button>
              <div className="nexus-header-text">
                <h1 style={{ fontSize: 20, fontWeight: 700, color: "#d0e4ff", margin: 0 }}>
                  {activeNav === "Home" ? "Dashboard" : activeNav}
                </h1>
                <p style={{ fontSize: 12, color: "#4a6080", margin: 0 }}>
                  {student ? `Welcome back, ${student.name.split(" ")[0]}` : "Candidate Portal"}
                </p>
              </div>
            </div>

            {/* Right: notif + user */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              {/* Notification bell */}
              <div style={{ position: "relative" }}>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  onClick={() => setShowNotif(o => !o)}
                  style={{
                    background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.25)",
                    borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "#a0c8ff", fontSize: 16, position: "relative",
                  }}>
                  🔔
                  {allExams.length > 0 && (
                    <span style={{
                      position: "absolute", top: -4, right: -4, width: 16, height: 16,
                      background: "#4080ff", borderRadius: "50%", fontSize: 9, fontWeight: 700,
                      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      border: "2px solid #050a19",
                    }}>{Math.min(allExams.length, 9)}</span>
                  )}
                </motion.button>
                <AnimatePresence>
                  {showNotif && <NotifDropdown exams={allExams} onClose={() => setShowNotif(false)} />}
                </AnimatePresence>
              </div>

              {/* User chip */}
              <motion.div whileHover={{ scale: 1.03 }}
                onClick={() => setShowProfileModal(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  background: "rgba(10,20,45,0.8)",
                  border: "1px solid rgba(80,140,255,0.25)",
                  borderRadius: 10, padding: "7px 12px",
                }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", overflow: "hidden",
                  border: "1.5px solid rgba(100,180,255,0.5)",
                  background: "rgba(40,80,160,0.4)", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {profilePhoto
                    ? <img src={profilePhoto} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 14, color: "#a0c8ff" }}>
                        {student?.name?.charAt(0)?.toUpperCase() || "S"}
                      </span>
                  }
                </div>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#c0d8f8" }}>
                    {student?.name?.split(" ")[0] || "Student"}
                  </div>
                  <div style={{ fontSize: 10, color: "#4a6080" }}>Candidate ▾</div>
                </div>
              </motion.div>
            </div>
          </header>

          {/* MAIN CONTENT */}
          <main className="nexus-content-area" style={{
            flex: 1, padding: "28px 32px", overflowY: "auto",
          }}>

            {/* Profile view */}
            <AnimatePresence mode="wait">
            {activeNav === "Profile" ? (
              <motion.div key="profile"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="nexus-card" style={{ maxWidth: 480, margin: "40px auto", padding: 40, textAlign: "center" }}>
                  <div style={{
                    width: 90, height: 90, borderRadius: "50%", overflow: "hidden",
                    border: "2px solid rgba(100,180,255,0.5)",
                    background: "rgba(40,80,160,0.3)", margin: "0 auto 20px",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, color: "#a0c8ff",
                  }}>
                    {profilePhoto
                      ? <img src={profilePhoto} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="avatar" />
                      : (student?.name?.charAt(0) || "S")}
                  </div>
                  <h2 style={{ color: "#d0e4ff", margin: "0 0 4px" }}>{student?.name}</h2>
                  <p style={{ color: "#4a6080", fontSize: 14, margin: "0 0 24px" }}>{student?.email}</p>
                  <p style={{ color: "#a0c8ff", fontSize: 13, margin: "0 0 20px" }}>Branch: <strong>{student?.branch}</strong></p>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    <label style={{
                      padding: "9px 20px", borderRadius: 8, cursor: "pointer",
                      background: "rgba(80,140,255,0.2)", border: "1px solid rgba(80,140,255,0.4)",
                      color: "#a0c8ff", fontSize: 13, fontWeight: 600,
                    }}>
                      Upload Photo
                      <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                    </label>
                    {profilePhoto && (
                      <button onClick={removePhoto} style={{
                        padding: "9px 20px", borderRadius: 8, cursor: "pointer",
                        background: "rgba(200,60,60,0.15)", border: "1px solid rgba(200,60,60,0.35)",
                        color: "#f08080", fontSize: 13, fontWeight: 600,
                      }}>Remove</button>
                    )}
                    <button onClick={handleLogout} style={{
                      padding: "9px 20px", borderRadius: 8, cursor: "pointer",
                      background: "rgba(200,60,60,0.15)", border: "1px solid rgba(200,60,60,0.35)",
                      color: "#f08080", fontSize: 13, fontWeight: 600,
                    }}>Logout</button>
                  </div>
                </div>
              </motion.div>

            ) : activeNav === "History" ? (
              <motion.div key="history"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="nexus-card" style={{ maxWidth: 600, margin: "40px auto", padding: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>◷</div>
                  <h2 style={{ color: "#d0e4ff", margin: "0 0 8px" }}>Exam History</h2>
                  <p style={{ color: "#4a6080" }}>Your past exam results will appear here.</p>
                </div>
              </motion.div>

            ) : activeNav === "Skills" ? (
              <motion.div key="skills"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="nexus-card" style={{ maxWidth: 600, margin: "40px auto", padding: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
                  <h2 style={{ color: "#d0e4ff", margin: "0 0 8px" }}>Skills Insights</h2>
                  <p style={{ color: "#4a6080", marginBottom: 20 }}>Your skill score breakdown</p>
                  <div style={{ background: "rgba(80,140,255,0.1)", borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 36, fontWeight: 800, color: "#a0c8ff" }}>{skillScore}th</div>
                    <div style={{ color: "#4a6080", fontSize: 14 }}>Percentile</div>
                  </div>
                </div>
              </motion.div>

            ) : (
              /* ── HOME / EXAM VIEWS ── */
              <motion.div key={activeNav}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}>

                {/* Upcoming Exams banner */}
                {activeNav === "Home" && (
                  <motion.div className="nexus-card upcoming-wide"
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                    style={{ padding: "24px 28px", marginBottom: 24, position: "relative", overflow: "hidden" }}>
                    {/* Constellation pattern SVG */}
                    <svg style={{ position: "absolute", right: 0, top: 0, width: 200, height: 120, opacity: 0.18 }}
                      viewBox="0 0 200 120">
                      {[
                        [40,20],[80,50],[120,30],[160,60],[100,80],[50,90],[140,100],
                        [180,20],[30,70],[70,100],
                      ].map(([x,y],i,arr) => i < arr.length-1
                        ? <line key={i} x1={x} y1={y} x2={arr[i+1][0]} y2={arr[i+1][1]}
                            stroke="#64a0ff" strokeWidth="1" />
                        : null
                      )}
                      {[
                        [40,20],[80,50],[120,30],[160,60],[100,80],[50,90],[140,100],[180,20],[30,70],[70,100],
                      ].map(([x,y],i) => (
                        <circle key={`d${i}`} cx={x} cy={y} r={2.5} fill="#64a0ff" />
                      ))}
                    </svg>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: "#d0e4ff", margin: "0 0 4px" }}>
                      Upcoming Exams
                    </h2>
                    <p style={{ color: "#4a6080", fontSize: 14, margin: 0 }}>
                      View your scheduled assessments
                    </p>
                  </motion.div>
                )}

                {/* Exam cards grid */}
                {loading ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }} className="nexus-grid">
                    {[1,2].map(i => (
                      <div key={i} className="nexus-card" style={{ padding: 28, animation: "fadeSlideUp 0.4s ease forwards" }}>
                        <div style={{ height: 20, width: "60%", background: "rgba(80,140,255,0.1)", borderRadius: 6, marginBottom: 16 }} />
                        <div style={{ height: 14, width: "40%", background: "rgba(80,140,255,0.07)", borderRadius: 6, marginBottom: 12 }} />
                        <div style={{ height: 6, width: "100%", background: "rgba(80,140,255,0.07)", borderRadius: 3, marginBottom: 20 }} />
                        <div style={{ height: 36, width: 120, background: "rgba(80,140,255,0.1)", borderRadius: 8 }} />
                      </div>
                    ))}
                  </div>
                ) : filteredExams.length === 0 ? (
                  <div className="nexus-card" style={{ padding: "52px 40px", textAlign: "center" }}>
                    <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.4 }}>⚡</div>
                    <h3 style={{ color: "#8090b0", fontWeight: 500 }}>No exams scheduled right now</h3>
                    <p style={{ color: "#4a6080", fontSize: 14, marginTop: 6 }}>Check back later or contact your administrator</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }} className="nexus-grid">
                    {filteredExams.map((exam, idx) => {
                      const timeLeft = getTimeUntil(exam.scheduled_start);
                      const pct = exam.question_count ? Math.min((exam.question_count / 50) * 100, 100) : 60;
                      const isApt = exam.category === "Aptitude";
                      const accentColor = isApt ? "#4080ff" : "#8060e0";
                      const scheduledDate = exam.scheduled_start
                        ? new Date(exam.scheduled_start).toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit" })
                        : "TBD";
                      const scheduledTime = exam.scheduled_start
                        ? new Date(exam.scheduled_start).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
                        : "--:--";

                      return (
                        <motion.div key={exam.id} className="nexus-card"
                          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.08 }}
                          style={{ padding: "24px 26px", position: "relative", overflow: "hidden" }}>

                          {/* Corner accent */}
                          <div style={{
                            position: "absolute", top: 0, right: 0,
                            width: 120, height: 100,
                            background: `radial-gradient(circle at top right, ${accentColor}22, transparent 70%)`,
                          }} />

                          {/* SVG mini network */}
                          <svg style={{ position: "absolute", right: 16, top: 16, opacity: 0.15, width: 80, height: 60 }}
                            viewBox="0 0 80 60">
                            {[[10,10],[40,30],[70,10],[50,50],[20,45]].map(([x,y],i,arr) =>
                              i < arr.length-1 ? <line key={i} x1={x} y1={y} x2={arr[i+1][0]} y2={arr[i+1][1]} stroke={accentColor} strokeWidth="1.5" /> : null
                            )}
                            {[[10,10],[40,30],[70,10],[50,50],[20,45]].map(([x,y],i) => (
                              <circle key={`n${i}`} cx={x} cy={y} r={3} fill={accentColor} />
                            ))}
                          </svg>

                          {/* Header row */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 8 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#d0e4ff", margin: 0, lineHeight: 1.2 }}>
                              {exam.exam_name}
                            </h3>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, flexShrink: 0,
                              background: exam.is_active ? "rgba(60,200,100,0.2)" : "rgba(80,140,255,0.2)",
                              color: exam.is_active ? "#60e090" : "#80b8ff",
                              border: `1px solid ${exam.is_active ? "rgba(60,200,100,0.3)" : "rgba(80,140,255,0.3)"}`,
                            }}>
                              {exam.is_active ? "Active" : "Scheduled"}
                            </span>
                          </div>

                          {/* Meta */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18, fontSize: 13, color: "#6080a0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12 }}>📅</span>
                              <span>{scheduledDate}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12 }}>⏱</span>
                              <span>{scheduledTime} • {exam.duration_minutes} min</span>
                            </div>
                            {exam.question_count && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 12 }}>📝</span>
                                <span>{exam.question_count} Questions</span>
                              </div>
                            )}
                          </div>

                          {/* Progress bar */}
                          <div style={{ width: "100%", height: 5, background: "rgba(80,120,200,0.15)", borderRadius: 3, marginBottom: 18, overflow: "hidden" }}>
                            <div style={{
                              height: "100%", width: `${pct}%`, borderRadius: 3,
                              background: `linear-gradient(90deg, ${accentColor}aa, ${accentColor})`,
                              backgroundSize: "200% 100%",
                              animation: "shimmerBar 2.5s linear infinite",
                            }} />
                          </div>

                          {/* Footer */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <button className="start-btn" disabled={!exam.is_active || warpActive}
                              onClick={() => handleLaunch(exam)}>
                              {warpActive ? "Loading..." : "Start Exam"}
                            </button>
                            {timeLeft && (
                              <span style={{ fontSize: 12, color: "#5070a0", fontWeight: 500 }}>
                                Starts in {timeLeft}
                              </span>
                            )}
                            {!timeLeft && exam.is_active && (
                              <span style={{ fontSize: 12, color: "#60e090", fontWeight: 600 }}>Available Now</span>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Quick Insights */}
                {activeNav === "Home" && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                    className="nexus-card"
                    style={{ marginTop: 24, padding: "24px 28px" }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "#a0b8d8", marginBottom: 20 }}>Quick Insights</h3>
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }} className="nexus-insights-row">
                      {/* Completed Exams */}
                      <div style={{
                        flex: 1, minWidth: 160,
                        background: "rgba(40,80,160,0.15)",
                        border: "1px solid rgba(80,140,255,0.2)",
                        borderRadius: 12, padding: "20px 24px",
                      }}>
                        <div style={{ fontSize: 12, color: "#4a6080", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                          Completed Exams
                        </div>
                        <div style={{ fontSize: 42, fontWeight: 800, color: "#a0c8ff", lineHeight: 1 }}>
                          {completedCount}
                        </div>
                      </div>

                      {/* Skill Score */}
                      <div style={{
                        flex: 2, minWidth: 220,
                        background: "rgba(40,80,160,0.15)",
                        border: "1px solid rgba(80,140,255,0.2)",
                        borderRadius: 12, padding: "20px 24px",
                      }}>
                        <div style={{ fontSize: 12, color: "#4a6080", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                          Skill Score
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: "#a0c8ff" }}>
                          {skillScore}th Percentile
                        </div>
                        <div style={{ marginTop: 12, height: 6, background: "rgba(80,120,200,0.15)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", width: `${skillScore}%`, borderRadius: 3,
                            background: "linear-gradient(90deg, #4080ff, #8060e0)",
                            backgroundSize: "200% 100%",
                            animation: "shimmerBar 2s linear infinite",
                          }} />
                        </div>
                      </div>

                      {/* Total exams */}
                      <div style={{
                        flex: 1, minWidth: 140,
                        background: "rgba(80,40,160,0.15)",
                        border: "1px solid rgba(140,80,255,0.2)",
                        borderRadius: 12, padding: "20px 24px",
                      }}>
                        <div style={{ fontSize: 12, color: "#4a6080", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                          Active Exams
                        </div>
                        <div style={{ fontSize: 42, fontWeight: 800, color: "#b090ff", lineHeight: 1 }}>
                          {allExams.length}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

              </motion.div>
            )}
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowProfileModal(false)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,5,15,0.75)",
              backdropFilter: "blur(10px)", zIndex: 300,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 400,
                background: "rgba(10,18,38,0.97)",
                border: "1px solid rgba(80,140,255,0.25)",
                borderRadius: 20, padding: 36,
                boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
              }}>
              <h3 style={{ color: "#d0e4ff", marginBottom: 20, fontSize: 18, fontWeight: 700 }}>Profile Settings</h3>
              <div style={{
                width: 72, height: 72, borderRadius: "50%", overflow: "hidden",
                border: "2px solid rgba(100,180,255,0.5)",
                background: "rgba(40,80,160,0.3)", margin: "0 auto 16px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, color: "#a0c8ff",
              }}>
                {profilePhoto
                  ? <img src={profilePhoto} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="avatar" />
                  : (student?.name?.charAt(0) || "S")}
              </div>
              <p style={{ textAlign: "center", color: "#a0c8ff", fontWeight: 600, marginBottom: 4 }}>{student?.name}</p>
              <p style={{ textAlign: "center", color: "#4a6080", fontSize: 13, marginBottom: 24 }}>{student?.email}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{
                  display: "block", textAlign: "center", padding: "11px 0", borderRadius: 8, cursor: "pointer",
                  background: "rgba(80,140,255,0.15)", border: "1px solid rgba(80,140,255,0.35)",
                  color: "#a0c8ff", fontSize: 13, fontWeight: 600,
                }}>
                  📷 Upload Photo
                  <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                </label>
                {profilePhoto && (
                  <button onClick={removePhoto} style={{
                    padding: "11px 0", borderRadius: 8, cursor: "pointer",
                    background: "rgba(200,60,60,0.1)", border: "1px solid rgba(200,60,60,0.3)",
                    color: "#f08080", fontSize: 13, fontWeight: 600, width: "100%",
                  }}>Remove Photo</button>
                )}
                <button onClick={handleLogout} style={{
                  padding: "11px 0", borderRadius: 8, cursor: "pointer",
                  background: "rgba(200,60,60,0.15)", border: "1px solid rgba(200,60,60,0.4)",
                  color: "#f08080", fontSize: 13, fontWeight: 700, width: "100%",
                }}>Sign Out</button>
                <button onClick={() => setShowProfileModal(false)} style={{
                  padding: "11px 0", borderRadius: 8, cursor: "pointer",
                  background: "rgba(80,140,255,0.1)", border: "1px solid rgba(80,140,255,0.25)",
                  color: "#a0c8ff", fontSize: 13, fontWeight: 600, width: "100%",
                }}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile sidebar offset fix */}
      <style>{`
        @media (max-width: 768px) {
          .nexus-main { margin-left: 0 !important; }
        }
      `}</style>
    </>
  );
}
