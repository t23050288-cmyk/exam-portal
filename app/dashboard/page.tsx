"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { fetchPublicExamConfig } from "@/lib/api";
import styles from "./dashboard.module.css";

interface ExamNode {
  id: string; exam_name: string; branch: string; is_active: boolean;
  duration_minutes: number; scheduled_start: string | null;
  question_count?: number; category: string;
}
interface StudentInfo {
  id: string; name: string; email: string; branch: string;
  examStartTime: string | null; examDurationMinutes: number;
}
interface ProfileData {
  name: string; email: string; course: string; photo: string | null;
}

const NAV_ITEMS = [
  { id: "Home", icon: "⌂", label: "Home" },
  { id: "Aptitude", icon: "◈", label: "Aptitude Test" },
  { id: "Programming", icon: "</>", label: "Programming" },
  { id: "Profile", icon: "○", label: "Profile" },
  { id: "History", icon: "◷", label: "History" },
  { id: "Insights", icon: "↑", label: "Skills Insights" },
];

const CATEGORY_ICONS: Record<string, string> = {
  Aptitude: "🧬", Programming: "⌨️", Others: "📦",
};

function getTimeUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000);
  return `${d}D ${h}H`;
}

/* ── 3D Wireframe Mountain SVG — Cinematic Edition ── */
function MountainGraph({ percentile }: { percentile: number }) {
  const peaks = "M0,80 L40,60 L75,35 L95,15 L120,30 L150,50 L190,25 L225,45 L260,65 L300,40 L340,60 L390,45 L430,70 L480,80";
  const baseFill = `${peaks} L480,90 L0,90 Z`;
  return (
    <svg viewBox="0 0 480 90" className={styles.mountainSvg} preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="mtnGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,160,0,0.5)" />
          <stop offset="100%" stopColor="rgba(255,100,0,0.02)" />
        </linearGradient>
        <linearGradient id="mtnStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff8c00" />
          <stop offset="50%" stopColor="#ffcc00" />
          <stop offset="100%" stopColor="#ff8c00" />
        </linearGradient>
      </defs>
      {/* Dynamic Grid Background */}
      {[20, 40, 60, 80].map(y => (
        <line key={y} x1="0" y1={y} x2="480" y2={y} stroke="rgba(0,220,255,0.08)" strokeWidth="0.5" />
      ))}
      {/* Glow Fill */}
      <path d={baseFill} fill="url(#mtnGrad)" />
      {/* Wireframe Neon Line */}
      <path d={peaks} fill="none" stroke="url(#mtnStroke)" strokeWidth="2.5" strokeLinejoin="round" />
      {/* High-Contrast Interactive Nodes */}
      {[[95, 15], [190, 25], [300, 40], [390, 45]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="5" fill="rgba(255,160,0,0.2)" />
          <circle cx={x} cy={y} r="2.5" fill="#ffcc00" />
        </g>
      ))}
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [activeNav, setActiveNav] = useState("Home");
  const [allExams, setAllExams] = useState<ExamNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [warpActive, setWarpActive] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);

  const [profile, setProfile] = useState<ProfileData>({ name: "", email: "", course: "", photo: null });
  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft] = useState<ProfileData>({ name: "", email: "", course: "", photo: null });

  useEffect(() => {
    const raw = sessionStorage.getItem("exam_student");
    const token = sessionStorage.getItem("exam_token");
    if (!raw || !token) { router.replace("/login"); return; }
    const s: StudentInfo = JSON.parse(raw);
    setStudent(s);

    const saved = localStorage.getItem("nexus_profile");
    const p = saved ? JSON.parse(saved) : {};
    const prof: ProfileData = {
      name: p.name || s.name || "",
      email: p.email || s.email || "",
      course: p.course || "",
      photo: localStorage.getItem("nexus_profile_photo") || null,
    };
    setProfile(prof);
    setDraft(prof);
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
    if (["Profile", "History", "Insights"].includes(activeNav)) return false;
    return e.category === activeNav;
  });

  let completedCount = 0;
  let avgScore = 0;
  try {
    const results = JSON.parse(localStorage.getItem("nexus_exam_results") || "[]");
    completedCount = results.length;
    avgScore = completedCount > 0
      ? Math.round(results.reduce((a: number, r: any) => a + (r.score || 0), 0) / completedCount)
      : 0;
  } catch { /* empty */ }

  const handleLaunch = useCallback(async (exam: ExamNode) => {
    if (!exam.is_active) return;
    setWarpActive(true);
    sessionStorage.setItem("exam_selected_title", exam.exam_name);
    await new Promise(r => setTimeout(r, 800));
    router.push("/instructions");
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem("exam_token");
    sessionStorage.removeItem("exam_student");
    router.replace("/login");
  };

  const handleSaveProfile = () => {
    localStorage.setItem("nexus_profile", JSON.stringify({ name: draft.name, email: draft.email, course: draft.course }));
    if (draft.photo) localStorage.setItem("nexus_profile_photo", draft.photo);
    else localStorage.removeItem("nexus_profile_photo");
    setProfile({ ...draft });
    setEditingProfile(false);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const r = new FileReader();
      r.onloadend = () => setDraft(d => ({ ...d, photo: r.result as string }));
      r.readAsDataURL(f);
    }
  };

  const headerText = () => {
    switch (activeNav) {
      case "Home": return { title: "Upcoming Exams", sub: "View your scheduled assessments" };
      case "Profile": return { title: "My Profile", sub: "Manage your account details" };
      case "History": return { title: "Exam History", sub: "View your past exam attempts" };
      case "Insights": return { title: "Skills Insights", sub: "Track your performance" };
      default: return { title: `${activeNav} Exams`, sub: `Browse ${activeNav.toLowerCase()} assessments` };
    }
  };

  const hdr = headerText();

  return (
    <div className={styles.page}>
      {/* ── Hamburger (mobile) ── */}
      <button className={styles.hamburger} onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
        <span /><span /><span />
      </button>

      {/* ── Backdrop (mobile) ── */}
      {sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />}

      {/* ═══ SIDEBAR — Pointed Banner Shape ═══ */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>⚛</div>
          <div>
            <div className={styles.logoTitle}>NEXUS</div>
            <div className={styles.logoSub}>Candidate Portal</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`${styles.navBtn} ${activeNav === item.id ? styles.navBtnActive : ""}`}
              onClick={() => { setActiveNav(item.id); setSidebarOpen(false); setUserDropdown(false); }}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
              {activeNav === item.id && <span className={styles.navArrow}>›</span>}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarAtom}>
          <div className={styles.atomIcon}>⚛</div>
        </div>

        <button className={styles.signOut} onClick={handleLogout}>Sign Out</button>
      </aside>

      {/* ═══ MAIN AREA ═══ */}
      <div className={styles.main}>
        {/* Top Header Section */}
        <div className={styles.topSection}>
          <div className={styles.headerCard}>
            <h2 className={styles.headerTitle}>{hdr.title}</h2>
            <p className={styles.headerSub}>{hdr.sub}</p>
          </div>

          {/* User Profile Card */}
          <div className={styles.userCard} onClick={() => setUserDropdown(!userDropdown)}>
            <div className={styles.userAvatar}>
              {profile.photo
                ? <img src={profile.photo} alt="" />
                : <span>{profile.name?.[0] || "S"}</span>}
            </div>
            <div>
              <div className={styles.userName}>{profile.name || "Student"}</div>
              <div className={styles.userRole}>Candidate</div>
            </div>
            <span className={styles.userArrow}>▾</span>

            {userDropdown && (
              <div className={styles.dropdown} onClick={e => e.stopPropagation()}>
                <div className={styles.dropdownItem}>
                  {completedCount > 0 ? "✅" : "⬜"} Results: {completedCount > 0 ? "Ready" : "None"}
                </div>
                <div className={styles.dropdownItem} style={{ cursor: "pointer", color: "#00dcff" }}
                  onClick={() => { setActiveNav("Profile"); setUserDropdown(false); }}>
                  ⚙️ Settings
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className={styles.content}>
          {!["Profile", "History", "Insights"].includes(activeNav) && (
            <>
              {loading ? (
                <div className={styles.loadingWrap}><div className={styles.spinner} /></div>
              ) : (
                <div className={styles.examGrid}>
                  {filteredExams.map((exam, i) => {
                    const timeUntil = getTimeUntil(exam.scheduled_start);
                    const schedDate = exam.scheduled_start ? new Date(exam.scheduled_start) : null;
                    return (
                      <motion.div key={exam.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} className={styles.examCard}>
                        <div className={styles.examCardHeader}>
                          <h3 className={styles.examCardTitle}>{exam.exam_name}</h3>
                          <span className={`${styles.examBadge} ${!exam.scheduled_start ? styles.examBadgeActive : ""}`}>
                            {exam.scheduled_start ? "Scheduled" : "Active"}
                          </span>
                        </div>
                        <div className={styles.examMeta}>
                          {schedDate && <span>📅 {schedDate.toLocaleDateString()}</span>}
                          <span>⏱ {exam.duration_minutes} min</span>
                          <span>📦 {exam.category}</span>
                        </div>
                        <div className={styles.examFooter}>
                          <button className={styles.startBtn} onClick={() => handleLaunch(exam)}>Start Exam</button>
                          {timeUntil && <span className={styles.countdown}>Starts in {timeUntil}</span>}
                        </div>
                      </motion.div>
                    );
                  })}
                  {filteredExams.length === 0 && (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>📋</div>
                      <div className={styles.emptyTitle}>No Assessments Found</div>
                    </div>
                  )}
                </div>
              )}

              {/* ── High-Fidelity Insights Section ── */}
              {activeNav === "Home" && !loading && (
                <div className={styles.insightsSection}>
                  <h3 className={styles.insightsTitle}>Performance Matrix</h3>
                  <div className={styles.insightsRow}>
                    <div className={styles.insightCard}>
                      <div className={styles.insightLabel}>Completed</div>
                      <div className={styles.insightValue}>{completedCount}</div>
                    </div>
                    <div className={styles.insightCard}>
                      <div className={styles.insightLabel}>Available</div>
                      <div className={styles.insightValue}>{allExams.length}</div>
                    </div>
                    {/* Wireframe Mountain Graph */}
                    <div className={styles.mountainCard}>
                      <div className={styles.mountainLabel}>Skill Score</div>
                      <div className={styles.mountainValue}>
                        {completedCount > 0 ? `${avgScore}th Percentile` : "0th Percentile"}
                      </div>
                      <MountainGraph percentile={avgScore} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* === PROFILE SECTION === */}
          {activeNav === "Profile" && (
            <div className={styles.profileSection}>
              <div className={styles.profileCard}>
                <div className={styles.profilePhotoWrap}>
                  <div className={styles.profilePhoto}>
                    {(editingProfile ? draft.photo : profile.photo)
                      ? <img src={(editingProfile ? draft.photo : profile.photo)!} alt="" />
                      : <span>{profile.name?.[0]}</span>}
                  </div>
                  {editingProfile && (
                    <label className={styles.photoLabel}>📷 Change Photo<input type="file" onChange={handlePhotoChange} /></label>
                  )}
                </div>
                <div className={styles.profileInstitution}>RATHINAM INSTITUTE OF TECHNOLOGY</div>
                <div className={styles.profileFields}>
                  <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Name</label>
                    {editingProfile ? <input className={styles.fieldInput} value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} /> : <div className={styles.fieldValue}>{profile.name}</div>}
                  </div>
                  <div className={styles.fieldGroup}><label className={styles.fieldLabel}>USN</label><div className={`${styles.fieldValue} ${styles.fieldReadonly}`}>{student?.id}</div></div>
                  <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Email</label>
                    {editingProfile ? <input className={styles.fieldInput} value={draft.email} onChange={e => setDraft({...draft, email: e.target.value})} /> : <div className={styles.fieldValue}>{profile.email}</div>}
                  </div>
                </div>
                <div className={styles.profileActions}>
                  {editingProfile ? (
                    <> <button className={styles.btnPrimary} onClick={handleSaveProfile}>Save</button> <button className={styles.btnSecondary} onClick={() => setEditingProfile(false)}>Cancel</button> </>
                  ) : ( <button className={styles.btnPrimary} onClick={() => {setDraft(profile); setEditingProfile(true)}}>Edit Profile</button> )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {warpActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.warpOverlay}>
            <div className={styles.warpContent}><div className={styles.warpIcon}>🚀</div><div className={styles.warpText}>Entering Portal...</div></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
