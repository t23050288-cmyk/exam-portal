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
  { id: "Aptitude", icon: "◎", label: "Aptitude Test" },
  { id: "Programming", icon: "◇", label: "Programming" },
  { id: "Others", icon: "◉", label: "Other Quiz" },
  { id: "Profile", icon: "♟", label: "Profile" },
  { id: "Learning", icon: "◐", label: "Learning Path" },
  { id: "Insights", icon: "⫏", label: "Skills Insights" },
];

function getTimeUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000);
  return `${d}D ${h}H`;
}

function MountainGraph() {
  const peaks = "M0,70 L40,50 L70,25 L95,40 L130,15 L160,35 L195,45 L230,20 L265,38 L300,55 L340,35 L370,50 L400,70";
  const fill = peaks + " L400,70 Z";
  return (
    <svg viewBox="0 0 400 75" className={styles.mountainSvg} preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,220,255,0.25)" />
          <stop offset="100%" stopColor="rgba(0,220,255,0.02)" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#mg)" />
      <path d={peaks} fill="none" stroke="#00dcff" strokeWidth="2" strokeLinejoin="round" />
      {[[70,25],[130,15],[230,20],[340,35]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#00dcff" opacity="0.8" />
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
      name: p.name || s.name || "", email: p.email || s.email || "",
      course: p.course || "", photo: localStorage.getItem("nexus_profile_photo") || null,
    };
    setProfile(prof); setDraft(prof);
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
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadExams();
    const ch1 = supabase.channel("ec").on("postgres_changes", { event: "*", schema: "public", table: "exam_config" }, () => loadExams()).subscribe();
    const ch2 = supabase.channel("qc").on("postgres_changes", { event: "*", schema: "public", table: "questions" }, () => loadExams()).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [loadExams]);

  const filteredExams = allExams.filter(e => {
    if (activeNav === "Home") return true;
    if (["Profile", "Learning", "Insights"].includes(activeNav)) return false;
    return e.category === activeNav;
  });
  const activeExams = filteredExams.filter(e => !e.scheduled_start || new Date(e.scheduled_start).getTime() <= Date.now());
  const inactiveExams = filteredExams.filter(e => e.scheduled_start && new Date(e.scheduled_start).getTime() > Date.now());

  let completedCount = 0, avgScore = 0;
  try {
    const results = JSON.parse(localStorage.getItem("nexus_exam_results") || "[]");
    completedCount = results.length;
    avgScore = completedCount > 0 ? Math.round(results.reduce((a: number, r: any) => a + (r.score || 0), 0) / completedCount) : 0;
  } catch { /* empty */ }

  const handleLaunch = useCallback(async (exam: ExamNode) => {
    if (!exam.is_active) return;
    setWarpActive(true);
    sessionStorage.setItem("exam_selected_title", exam.exam_name);
    await new Promise(r => setTimeout(r, 800));
    router.push("/instructions");
  }, [router]);

  const handleLogout = () => { sessionStorage.removeItem("exam_token"); sessionStorage.removeItem("exam_student"); router.replace("/login"); };

  const handleSaveProfile = () => {
    localStorage.setItem("nexus_profile", JSON.stringify({ name: draft.name, email: draft.email, course: draft.course }));
    if (draft.photo) localStorage.setItem("nexus_profile_photo", draft.photo); else localStorage.removeItem("nexus_profile_photo");
    setProfile({ ...draft }); setEditingProfile(false);
  };
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { const r = new FileReader(); r.onloadend = () => setDraft(d => ({ ...d, photo: r.result as string })); r.readAsDataURL(f); }
  };

  const headerText = () => {
    switch (activeNav) {
      case "Home": return { title: "Active Exams", sub: "Live assessments available right now" };
      case "Profile": return { title: "Profile", sub: "View your candidate information" };
      case "Learning": return { title: "Learning Path", sub: "Coming Soon!!" };
      case "Insights": return { title: "Skills Insights", sub: "Track your performance" };
      default: return { title: activeNav === "Others" ? "Other Quiz" : activeNav, sub: "System ready for authorization" };
    }
  };
  const hdr = headerText();

  const renderExamCard = (exam: ExamNode, i: number) => {
    const timeUntil = getTimeUntil(exam.scheduled_start);
    const schedDate = exam.scheduled_start ? new Date(exam.scheduled_start) : null;
    return (
      <motion.div key={exam.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.06, duration: 0.3 }} className={styles.examCard}>
        <div className={styles.examCardHeader}>
          <h3 className={styles.examCardTitle}>{exam.exam_name}</h3>
          <span className={styles.examLiveBadge}>LIVE</span>
        </div>
        <div className={styles.examMeta}>
          <span>📅 {schedDate ? schedDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]}</span>
          <span>🕐 {schedDate ? schedDate.toTimeString().slice(0, 5) : "14:00"} • {exam.duration_minutes} min</span>
          <span className={styles.examScore}>✅ Score: +4 / -1</span>
        </div>
        <div className={styles.examProgress}><div className={styles.examProgressBar} /></div>
        <div className={styles.examFooter}>
          <button className={styles.startBtn} onClick={() => handleLaunch(exam)}>START EXAM</button>
          {timeUntil ? <span className={styles.countdown}>Starts in {timeUntil}</span> : <span className={styles.readyText}>Ready</span>}
        </div>
      </motion.div>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.stars} />

      {/* ═══ TOP NAVBAR ═══ */}
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <div className={styles.topbarLogoIcon}>⚛</div>
          <span className={styles.topbarTitle}>NEXUS</span>
          <span className={styles.topbarSub}>Candidate Portal</span>
        </div>
        <div className={styles.topbarRight}>
          <div className={styles.userChip} onClick={() => setUserDropdown(!userDropdown)}>
            <div className={styles.userChipAvatar}>
              {profile.photo ? <img src={profile.photo} alt="" /> : <span>{profile.name?.[0] || "S"}</span>}
            </div>
            <div>
              <div className={styles.userChipName}>{student?.id || "Student"}</div>
              <div className={styles.userChipRole}>Candidate</div>
            </div>
            <span className={styles.userChipArrow}>▾</span>
            {userDropdown && (
              <div className={styles.dropdown} onClick={e => e.stopPropagation()}>
                <div className={styles.dropdownItem}>{completedCount > 0 ? "✅" : "⬜"} Aptitude results {completedCount > 0 ? "ready" : "pending"}</div>
                <div className={styles.dropdownItem}>{completedCount > 0 ? "✅" : "⬜"} Programming results {completedCount > 0 ? "ready" : "pending"}</div>
                <div className={styles.dropdownItem} style={{ cursor: "pointer", color: "#00dcff" }}
                  onClick={() => { setActiveNav("Profile"); setUserDropdown(false); }}>⚙️ Options</div>
              </div>
            )}
          </div>
          <div className={styles.notifBell}>🔔<div className={styles.notifBadge}>3</div></div>
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div className={styles.body}>
        {/* Hamburger */}
        <button className={styles.hamburger} onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu"><span /><span /><span /></button>
        {sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />}

        {/* ═══ SIDEBAR ═══ */}
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
          <nav className={styles.nav}>
            {NAV_ITEMS.map(item => (
              <button key={item.id}
                className={`${styles.navBtn} ${activeNav === item.id ? styles.navBtnActive : ""}`}
                onClick={() => { setActiveNav(item.id); setSidebarOpen(false); setUserDropdown(false); }}>
                <span className={styles.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
                {activeNav === item.id && <span className={styles.navArrow}>›</span>}
              </button>
            ))}
          </nav>
          <div className={styles.sidebarAtom}><div className={styles.atomIcon}>⚛</div></div>
          <button className={styles.signOut} onClick={handleLogout}>Sign Out</button>
        </aside>

        {/* ═══ MAIN ═══ */}
        <div className={styles.main}>
          <div className={styles.contentHeader}>
            <div>
              <div className={styles.contentTitle}>{hdr.title}</div>
              <div className={styles.contentSub}>{hdr.sub}</div>
            </div>
            {activeNav === "Home" && <div className={styles.systemBadge}>SYSTEM LIVE</div>}
          </div>

          <div className={styles.content}>
            {/* HOME / CATEGORY */}
            {!["Profile", "Learning", "Insights"].includes(activeNav) && (
              <>
                {loading ? (
                  <div className={styles.loadingWrap}><div className={styles.spinner} /></div>
                ) : (
                  <>
                    {/* Active Exams */}
                    {activeExams.length > 0 && (
                      <div className={styles.examGrid}>
                        {activeExams.map((exam, i) => renderExamCard(exam, i))}
                      </div>
                    )}

                    {/* Inactive Exams */}
                    {activeNav === "Home" && inactiveExams.length > 0 && (
                      <>
                        <div className={styles.sectionTitle}>Inactive Exams</div>
                        <div className={styles.sectionSub}>Scheduled, expired, or deactivated assessments</div>
                        <div className={styles.examGrid}>
                          {inactiveExams.map((exam, i) => renderExamCard(exam, i))}
                        </div>
                      </>
                    )}

                    {filteredExams.length === 0 && (
                      <div className={styles.emptyState}>Coming Soon!!.</div>
                    )}
                  </>
                )}

                {/* Quick Insights (Home only) */}
                {activeNav === "Home" && !loading && (
                  <div className={styles.insightsSection}>
                    <h3 className={styles.insightsTitle}>Quick Insights</h3>
                    <div className={styles.insightsRow}>
                      <div className={styles.insightsStats}>
                        <div className={styles.insightCard}>
                          <div className={styles.insightLabel}>Completed Exams</div>
                          <div className={styles.insightValue}>{completedCount}</div>
                        </div>
                      </div>
                      <div className={styles.mountainCard}>
                        <div className={styles.mountainLabel}>Skill Score:</div>
                        <div className={styles.mountainValue}>{completedCount > 0 ? `${avgScore}th Percentile` : "0th Percentile"}</div>
                        <MountainGraph />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* PROFILE (View Mode) */}
            {activeNav === "Profile" && !editingProfile && (
              <div className={styles.profileSection}>
                <div className={styles.profileTopCard}>
                  <div className={styles.profileAvatar}>
                    {profile.photo ? <img src={profile.photo} alt="" /> : "👤"}
                  </div>
                  <div className={styles.profileInfo}>
                    <div className={styles.profileName}>{profile.name || "Student"}</div>
                    <div className={styles.profileEmail}>✉ {profile.email || "—"}</div>
                  </div>
                  <button className={styles.editProfileBtn} onClick={() => { setDraft({ ...profile }); setEditingProfile(true); }}>
                    ✏️ Edit Profile
                  </button>
                </div>
                <div className={styles.profileInfoCard}>
                  <div className={styles.profileInfoTitle}>Personal Information</div>
                  <div className={styles.profileInfoGrid}>
                    <div className={styles.profileInfoItem}>
                      <div className={`${styles.profileInfoIcon} ${styles.iconName}`}>👤</div>
                      <div><div className={styles.profileInfoLabel}>Full Name</div><div className={styles.profileInfoValue}>{profile.name || "—"}</div></div>
                    </div>
                    <div className={styles.profileInfoItem}>
                      <div className={`${styles.profileInfoIcon} ${styles.iconEmail}`}>✉</div>
                      <div><div className={styles.profileInfoLabel}>Email</div><div className={styles.profileInfoValue}>{profile.email || "—"}</div></div>
                    </div>
                    <div className={styles.profileInfoItem}>
                      <div className={`${styles.profileInfoIcon} ${styles.iconBranch}`}>📁</div>
                      <div><div className={styles.profileInfoLabel}>Branch</div><div className={styles.profileInfoValue}>{student?.branch || "—"}</div></div>
                    </div>
                    <div className={styles.profileInfoItem}>
                      <div className={`${styles.profileInfoIcon} ${styles.iconUsn}`}>📋</div>
                      <div><div className={styles.profileInfoLabel}>USN</div><div className={styles.profileInfoValue}>{student?.id || "—"}</div></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PROFILE (Edit Mode) */}
            {activeNav === "Profile" && editingProfile && (
              <div className={styles.profileEditSection}>
                <div className={styles.profileEditCard}>
                  <div className={styles.profilePhotoWrap}>
                    <div className={styles.profilePhoto}>
                      {draft.photo ? <img src={draft.photo} alt="" /> : <span>{draft.name?.[0] || "S"}</span>}
                    </div>
                    <label className={styles.photoLabel}>📷 Change Photo<input type="file" accept="image/*" onChange={handlePhotoChange} /></label>
                    {draft.photo && <button className={styles.removePhotoBtn} onClick={() => setDraft(d => ({ ...d, photo: null }))}>Remove Photo</button>}
                  </div>
                  <div className={styles.profileInstitution}>RATHINAM INSTITUTE OF TECHNOLOGY</div>
                  <div className={styles.profileFields}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Name</label>
                      <input className={styles.fieldInput} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Your name" />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>USN</label>
                      <div className={`${styles.fieldValue} ${styles.fieldReadonly}`}>{student?.id || "—"}</div>
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Gmail</label>
                      <input className={styles.fieldInput} type="email" value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} placeholder="Email" />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Course</label>
                      <input className={styles.fieldInput} value={draft.course} onChange={e => setDraft(d => ({ ...d, course: e.target.value }))} placeholder="e.g. B.Tech CSE" />
                    </div>
                  </div>
                  <div className={styles.profileActions}>
                    <button className={styles.btnPrimary} onClick={handleSaveProfile}>Save Changes</button>
                    <button className={styles.btnSecondary} onClick={() => { setDraft({ ...profile }); setEditingProfile(false); }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* LEARNING PATH */}
            {activeNav === "Learning" && <div className={styles.emptyState}>Coming Soon!!.</div>}

            {/* INSIGHTS */}
            {activeNav === "Insights" && (
              <div className={styles.insightsRow}>
                <div className={styles.insightsStats}>
                  <div className={styles.insightCard}><div className={styles.insightLabel}>Completed Exams</div><div className={styles.insightValue}>{completedCount}</div></div>
                  <div className={styles.insightCard}><div className={styles.insightLabel}>Branch</div><div className={styles.insightValueSmall}>{student?.branch || "—"}</div></div>
                </div>
                <div className={styles.mountainCard}>
                  <div className={styles.mountainLabel}>Skill Score:</div>
                  <div className={styles.mountainValue}>{completedCount > 0 ? `${avgScore}th Percentile` : "0th Percentile"}</div>
                  <MountainGraph />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Warp Overlay */}
      <AnimatePresence>
        {warpActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.warpOverlay}>
            <div className={styles.warpContent}>
              <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 1.4 }}>
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
