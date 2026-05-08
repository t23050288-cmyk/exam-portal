"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { fetchPublicExamConfig } from "@/lib/api";
import styles from "./dashboard.module.css";
import dynamic from "next/dynamic";

const WireframeMountain = dynamic(() => import("@/components/WireframeMountain"), { ssr: false });

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

/* ── Wireframe Mountain SVG ── */
function MountainGraph({ percentile }: { percentile: number }) {
  const peaks = "M0,80 L30,55 L55,30 L70,12 L85,25 L110,40 L140,20 L165,35 L190,50 L220,30 L250,45 L280,60 L310,40 L340,55 L360,80";
  const baseFill = `M0,80 L30,55 L55,30 L70,12 L85,25 L110,40 L140,20 L165,35 L190,50 L220,30 L250,45 L280,60 L310,40 L340,55 L360,80 Z`;
  return (
    <svg viewBox="0 0 360 90" className={styles.mountainSvg} preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="mtnGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,180,60,0.4)" />
          <stop offset="100%" stopColor="rgba(255,140,0,0.02)" />
        </linearGradient>
        <linearGradient id="mtnStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff8c00" />
          <stop offset="50%" stopColor="#ffb860" />
          <stop offset="100%" stopColor="#ff8c00" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[20,40,60].map(y => (
        <line key={y} x1="0" y1={y} x2="360" y2={y} stroke="rgba(0,220,255,0.06)" strokeWidth="0.5" />
      ))}
      {/* Fill */}
      <path d={baseFill} fill="url(#mtnGrad)" />
      {/* Wireframe line */}
      <path d={peaks} fill="none" stroke="url(#mtnStroke)" strokeWidth="2" strokeLinejoin="round" />
      {/* Glowing dots at peaks */}
      {[[70,12],[140,20],[220,30],[310,40]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#ffb060" opacity="0.8" />
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

  // Profile
  const [profile, setProfile] = useState<ProfileData>({ name: "", email: "", course: "", photo: null });
  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft] = useState<ProfileData>({ name: "", email: "", course: "", photo: null });

  // ── Auth + Profile Load ──
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

  // ── Load Exams ──
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

  // ── Filters ──
  const filteredExams = allExams.filter(e => {
    if (activeNav === "Home") return true;
    if (["Profile", "History", "Insights"].includes(activeNav)) return false;
    return e.category === activeNav;
  });

  // ── Stats (start at 0) ──
  let completedCount = 0;
  let avgScore = 0;
  try {
    const results = JSON.parse(localStorage.getItem("nexus_exam_results") || "[]");
    completedCount = results.length;
    avgScore = completedCount > 0
      ? Math.round(results.reduce((a: number, r: any) => a + (r.score || 0), 0) / completedCount)
      : 0;
  } catch { /* empty */ }

  // ── Actions ──
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

  // ── Profile Handlers ──
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

  const startEditing = () => { setDraft({ ...profile }); setEditingProfile(true); };
  const cancelEditing = () => { setDraft({ ...profile }); setEditingProfile(false); };

  // ── Header text ──
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
      <div className={styles.stars} />

      {/* ── Hamburger (mobile) ── */}
      <button className={styles.hamburger} onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
        <span /><span /><span />
      </button>

      {/* ── Backdrop (mobile) ── */}
      {sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />}

      {/* ═══ SIDEBAR — Banner Shape ═══ */}
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

        {/* Atom decoration */}
        <div className={styles.sidebarAtom}>
          <div className={styles.atomIcon}>⚛</div>
        </div>
      </aside>

      {/* ═══ MAIN AREA ═══ */}
      <div className={styles.main}>
        {/* Top Section */}
        <div className={styles.topSection}>
          <div className={styles.headerCard}>
            <h2 className={styles.headerTitle}>{hdr.title}</h2>
            <p className={styles.headerSub}>{hdr.sub}</p>
          </div>

          {/* User Card */}
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
                  {completedCount > 0 ? "✅" : "⬜"} Aptitude results {completedCount > 0 ? "ready" : "pending"}
                </div>
                <div className={styles.dropdownItem}>
                  {completedCount > 0 ? "✅" : "⬜"} Programming results {completedCount > 0 ? "ready" : "pending"}
                </div>
                <div className={styles.dropdownItem} style={{ cursor: "pointer", color: "#80e0ff" }}
                  onClick={() => { setActiveNav("Profile"); setUserDropdown(false); }}>
                  ⚙️ Options
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Content ── */}
        <div className={styles.content}>

          {/* === HOME / CATEGORY VIEW === */}
          {!["Profile", "History", "Insights"].includes(activeNav) && (
            <>
              {loading ? (
                <div className={styles.loadingWrap}>
                  <div className={styles.spinner} />
                </div>
              ) : (
                <div className={styles.examGrid}>
                  {filteredExams.map((exam, i) => {
                    const timeUntil = getTimeUntil(exam.scheduled_start);
                    const scheduled = !!exam.scheduled_start;
                    const schedDate = exam.scheduled_start ? new Date(exam.scheduled_start) : null;
                    const catIcon = CATEGORY_ICONS[exam.category] || "📋";

                    return (
                      <motion.div key={exam.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        className={styles.examCard}
                      >
                        <div className={styles.examCategoryIcon}>{catIcon}</div>

                        <div className={styles.examCardHeader}>
                          <h3 className={styles.examCardTitle}>{exam.exam_name}</h3>
                          <span className={`${styles.examBadge} ${!scheduled ? styles.examBadgeActive : ""}`}>
                            {scheduled ? "Scheduled" : "Active"}
                          </span>
                        </div>

                        <div className={styles.examMeta}>
                          {schedDate && <span>📅 {schedDate.toISOString().split("T")[0]}</span>}
                          {schedDate && <span>🕐 {schedDate.toTimeString().slice(0, 5)}</span>}
                          <span>⏱ {exam.duration_minutes} min</span>
                        </div>

                        <div className={styles.examFooter}>
                          <button className={styles.startBtn} onClick={() => handleLaunch(exam)}>
                            Start Exam
                          </button>
                          {timeUntil && <span className={styles.countdownText}>Starts in {timeUntil}</span>}
                        </div>
                      </motion.div>
                    );
                  })}

                  {filteredExams.length === 0 && (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>📋</div>
                      <div className={styles.emptyTitle}>No exams available</div>
                      <div className={styles.emptySub}>Check back later for new assessments.</div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Quick Insights with Mountain Graph (Home only) ── */}
              {activeNav === "Home" && !loading && (
                <div className={styles.insightsSection}>
                  <h3 className={styles.insightsTitle}>Quick Insights</h3>
                  <div className={styles.insightsRow}>
                    {/* Stats */}
                    <div className={styles.insightsStats}>
                      <div className={styles.insightCard}>
                        <div className={styles.insightLabel}>Completed Exams</div>
                        <div className={styles.insightValue}>{completedCount}</div>
                      </div>
                      <div className={styles.insightCard}>
                        <div className={styles.insightLabel}>Available</div>
                        <div className={styles.insightValue}>{allExams.length}</div>
                      </div>
                    </div>

                    {/* Mountain Graph Card */}
                    <div className={styles.mountainCard}>
                      <div className={styles.mountainLabel}>Skill Score</div>
                      <div className={styles.mountainValue}>
                        {completedCount > 0 ? `${avgScore}th Percentile` : "0th Percentile"}
                      </div>
                      <WireframeMountain />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}


              {/* ── PyHunt Banner (Home only) ── */}
              {activeNav === "Home" && (
                <div
                  onClick={() => router.push("/pyhunt")}
                  style={{
                    marginTop: 18,
                    background: "linear-gradient(135deg, rgba(60,40,120,0.45), rgba(30,70,180,0.35))",
                    border: "1px solid rgba(120,80,240,0.35)",
                    borderRadius: 14,
                    padding: "20px 26px",
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    cursor: "pointer",
                    backdropFilter: "blur(14px)",
                    transition: "all 0.22s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(160,100,255,0.6)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(120,80,240,0.35)"; }}
                >
                  <div style={{ fontSize: 42, flexShrink: 0 }}>🐍</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#d0c0ff", marginBottom: 4 }}>
                      PyHunt — Python Treasure Hunt
                    </div>
                    <div style={{ fontSize: 13, color: "#7060a8" }}>
                      5 rounds · MCQ → Code Jumble → Coding → Coding → Turtle
                    </div>
                  </div>
                  <div style={{
                    padding: "9px 20px", borderRadius: 8,
                    background: "linear-gradient(135deg, #5040c0, #9040c0)",
                    color: "#fff", fontWeight: 700, fontSize: 13,
                    flexShrink: 0,
                    boxShadow: "0 0 18px rgba(100,60,220,0.4)",
                  }}>
                    Enter Hunt →
                  </div>
                </div>
              )}
          {/* === PROFILE === */}
          {activeNav === "Profile" && (
            <div className={styles.profileSection}>
              <div className={styles.profileCard}>
                <div className={styles.profilePhotoWrap}>
                  <div className={styles.profilePhoto}>
                    {(editingProfile ? draft.photo : profile.photo)
                      ? <img src={(editingProfile ? draft.photo : profile.photo)!} alt="" />
                      : <span>{(editingProfile ? draft.name : profile.name)?.[0] || "S"}</span>}
                  </div>
                  {editingProfile && (
                    <>
                      <label className={styles.photoLabel}>
                        📷 Change Photo
                        <input type="file" accept="image/*" onChange={handlePhotoChange} />
                      </label>
                      {draft.photo && (
                        <button className={styles.removePhotoBtn} onClick={() => setDraft(d => ({ ...d, photo: null }))}>
                          Remove Photo
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className={styles.profileInstitution}>RATHINAM INSTITUTE OF TECHNOLOGY</div>

                <div className={styles.profileFields}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Name</label>
                    {editingProfile ? (
                      <input className={styles.fieldInput} value={draft.name}
                        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Your name" />
                    ) : (
                      <div className={styles.fieldValue}>{profile.name || "—"}</div>
                    )}
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>USN</label>
                    <div className={`${styles.fieldValue} ${styles.fieldReadonly}`}>{student?.id || "—"}</div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Gmail</label>
                    {editingProfile ? (
                      <input className={styles.fieldInput} type="email" value={draft.email}
                        onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} placeholder="Email address" />
                    ) : (
                      <div className={styles.fieldValue}>{profile.email || "—"}</div>
                    )}
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Course</label>
                    {editingProfile ? (
                      <input className={styles.fieldInput} value={draft.course}
                        onChange={e => setDraft(d => ({ ...d, course: e.target.value }))} placeholder="e.g. B.Tech CSE" />
                    ) : (
                      <div className={styles.fieldValue}>{profile.course || "—"}</div>
                    )}
                  </div>
                </div>

                <div className={styles.profileActions}>
                  {editingProfile ? (
                    <>
                      <button className={styles.btnPrimary} onClick={handleSaveProfile}>Save Changes</button>
                      <button className={styles.btnSecondary} onClick={cancelEditing}>Cancel</button>
                    </>
                  ) : (
                    <button className={styles.btnPrimary} onClick={startEditing}>Edit Profile</button>
                  )}
                </div>

                <div style={{ fontSize: 10, color: "#405570", marginTop: 14, textAlign: "center" }}>
                  📱 Profile data is stored locally on this device
                </div>
              </div>
            </div>
          )}

          {/* === HISTORY === */}
          {activeNav === "History" && (
            <div className={styles.historyEmpty}>
              <div className={styles.emptyIcon}>📜</div>
              <div className={styles.emptyTitle}>No exam history yet</div>
              <div className={styles.emptySub}>Your completed exams will appear here.</div>
            </div>
          )}

          {/* === SKILLS INSIGHTS === */}
          {activeNav === "Insights" && (
            <div>
              <div className={styles.insightsRow}>
                <div className={styles.insightsStats}>
                  <div className={styles.insightCard}>
                    <div className={styles.insightLabel}>Completed Exams</div>
                    <div className={styles.insightValue}>{completedCount}</div>
                  </div>
                  <div className={styles.insightCard}>
                    <div className={styles.insightLabel}>Branch</div>
                    <div className={styles.insightValueSmall}>{student?.branch || "—"}</div>
                  </div>
                </div>
                <div className={styles.mountainCard}>
                  <div className={styles.mountainLabel}>Skill Score</div>
                  <div className={styles.mountainValue}>
                    {completedCount > 0 ? `${avgScore}th Percentile` : "0th Percentile"}
                  </div>
                  <WireframeMountain />
                </div>
              </div>
              {completedCount === 0 && (
                <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#5a80a0" }}>
                  Complete exams to see your skill insights and percentile ranking.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Warp Overlay ── */}
      <AnimatePresence>
        {warpActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.warpOverlay}>
            <div className={styles.warpContent}>
              <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 1.4 }}>
                <div className={styles.warpIcon}>📝</div>
                <div className={styles.warpText}>Entering Exam...</div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

