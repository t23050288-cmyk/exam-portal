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

const NAV_ITEMS = [
  {
    id: "Home",
    label: "Home",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: "Aptitude",
    label: "Aptitude Test",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17 14h.01M14 17h.01M17 20h.01M20 17h.01"/>
      </svg>
    ),
  },
  {
    id: "Programming",
    label: "Programming",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
  {
    id: "Profile",
    label: "Profile",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    id: "History",
    label: "History",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    id: "Skills",
    label: "Skills Insights",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
];

function getTimeUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  return `${d}D ${h}H`;
}

/* Constellation dots + lines SVG */
function ConstellationSVG({ color = "#c8a060" }: { color?: string }) {
  const pts: [number,number][] = [
    [120,30],[160,55],[200,35],[240,60],[190,90],
    [150,110],[110,85],[80,60],[100,45],
  ];
  const lines = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,0],[1,4],[6,3]];
  return (
    <svg width="100%" height="100%" viewBox="0 0 300 140" style={{ opacity: 0.35 }}>
      {lines.map(([a,b],i) => (
        <line key={i} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]}
          stroke={color} strokeWidth="1" />
      ))}
      {pts.map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={color} />
      ))}
    </svg>
  );
}

/* Small code icon for programming card */
function CodeIcon() {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 8,
      border: "1px solid rgba(100,160,255,0.3)",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(60,100,200,0.15)",
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(100,180,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [activeNav, setActiveNav] = useState("Home");
  const [allExams, setAllExams] = useState<ExamNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [showNotif, setShowNotif] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [warpActive, setWarpActive] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [skillPercentile, setSkillPercentile] = useState(0);

  useEffect(() => {
    const p = localStorage.getItem("nexus_profile_photo");
    if (p) setProfilePhoto(p);
    try {
      const results = JSON.parse(localStorage.getItem("nexus_exam_results") || "[]");
      setCompletedCount(results.length);
      setSkillPercentile(
        results.length > 0
          ? Math.round(results.reduce((a: number, r: any) => a + (r.percentile || r.score || 0), 0) / results.length)
          : 0
      );
    } catch { /* empty */ }
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
      const nodes: ExamNode[] = [];
      const seen = new Set<string>();
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
              nodes.push({
                id: nid, exam_name: cfg.exam_title, branch,
                is_active: cfg.is_active, duration_minutes: cfg.duration_minutes,
                scheduled_start: cfg.scheduled_start,
                question_count: data.count, category: data.category,
              });
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
    if (["Profile","History","Skills"].includes(activeNav)) return false;
    return e.category === activeNav;
  });

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

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const r = new FileReader();
      r.onloadend = () => {
        const b = r.result as string;
        setProfilePhoto(b);
        localStorage.setItem("nexus_profile_photo", b);
      };
      r.readAsDataURL(f);
    }
  };
  const removePhoto = () => { setProfilePhoto(null); localStorage.removeItem("nexus_profile_photo"); };

  /* Notification items based on real exams */
  const notifItems = allExams.length > 0
    ? allExams.slice(0, 3).map(e => `${e.exam_name} results ready`)
    : ["No new notifications"];

  return (
    <>
      {/* Warp overlay */}
      <AnimatePresence>
        {warpActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{
              position: "fixed", inset: 0, zIndex: 9999,
              background: "radial-gradient(circle, rgba(80,120,255,0.5) 0%, rgba(5,8,20,0.98) 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.1, opacity: 1 }}
              style={{ color: "#c0d4ff", fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
              Entering Exam...
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.page}>
        {/* Star field */}
        <div className={styles.stars} />
        <div className={styles.nebula1} />
        <div className={styles.nebula2} />

        {/* Mobile backdrop */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={styles.backdrop} onClick={() => setSidebarOpen(false)} />
          )}
        </AnimatePresence>

        {/* Hamburger */}
        <button className={styles.hamburger} onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
          <span /><span /><span />
        </button>

        {/* ══════════ SIDEBAR ══════════ */}
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>

          {/* Logo */}
          <div className={styles.logoWrap}>
            <div className={styles.logoOrb}>
              {/* Atom SVG */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(180,210,255,0.9)" strokeWidth="1.3">
                <circle cx="12" cy="12" r="2.5" fill="rgba(180,210,255,0.4)"/>
                <ellipse cx="12" cy="12" rx="9.5" ry="3.5"/>
                <ellipse cx="12" cy="12" rx="9.5" ry="3.5" transform="rotate(60 12 12)"/>
                <ellipse cx="12" cy="12" rx="9.5" ry="3.5" transform="rotate(120 12 12)"/>
              </svg>
            </div>
            <div>
              <div className={styles.logoTitle}>NEXUS</div>
              <div className={styles.logoSub}>Candidate Portal</div>
            </div>
          </div>

          {/* Nav items */}
          <nav className={styles.nav}>
            {NAV_ITEMS.map(item => (
              <button key={item.id}
                className={`${styles.navBtn} ${activeNav === item.id ? styles.navActive : ""}`}
                onClick={() => { setActiveNav(item.id); setSidebarOpen(false); }}>
                <span className={styles.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
                {activeNav === item.id && <span className={styles.navChevron}>›</span>}
              </button>
            ))}
          </nav>

          {/* Bottom atom decoration */}
          <div className={styles.sidebarAtom}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(100,140,220,0.22)" strokeWidth="0.9">
              <circle cx="12" cy="12" r="2.5"/>
              <ellipse cx="12" cy="12" rx="9.5" ry="3.5"/>
              <ellipse cx="12" cy="12" rx="9.5" ry="3.5" transform="rotate(60 12 12)"/>
              <ellipse cx="12" cy="12" rx="9.5" ry="3.5" transform="rotate(120 12 12)"/>
            </svg>
          </div>
        </aside>

        {/* ══════════ MAIN ══════════ */}
        <div className={styles.main}>

          {/* Top section: header banner + user card */}
          <div className={styles.topSection}>

            {/* "Upcoming Exams" header card */}
            <div className={styles.headerBanner}>
              <div className={styles.headerConstellation}>
                <ConstellationSVG />
              </div>
              <h2 className={styles.headerTitle}>
                {activeNav === "Home" ? "Upcoming Exams"
                  : activeNav === "Skills" ? "Skills Insights"
                  : activeNav === "Profile" ? "My Profile"
                  : activeNav === "History" ? "Exam History"
                  : `${activeNav} Exams`}
              </h2>
              <p className={styles.headerSub}>
                {activeNav === "Home" ? "View your scheduled assessments"
                  : activeNav === "Skills" ? "Track your performance & percentile"
                  : activeNav === "Profile" ? "Manage your account details"
                  : activeNav === "History" ? "View your past exam attempts"
                  : `Browse ${activeNav.toLowerCase()} assessments`}
              </p>
            </div>

            {/* User card — top right exactly like the image */}
            <div className={styles.userCard}>
              {/* Avatar + name row */}
              <div className={styles.userCardTop} onClick={() => setShowProfileModal(true)}>
                <div className={styles.userAvatar}>
                  {profilePhoto
                    ? <img src={profilePhoto} alt="avatar" />
                    : <span>{student?.name?.[0]?.toUpperCase() || "S"}</span>}
                </div>
                <div>
                  <div className={styles.userName}>{student?.name?.split(" ")[0] || "Candidate"} ▾</div>
                  <div className={styles.userRole}>Candidate</div>
                </div>
                {/* Bell */}
                <button className={styles.bellBtn} onClick={e => { e.stopPropagation(); setShowNotif(o => !o); }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
                  </svg>
                  {allExams.length > 0 && <span className={styles.bellDot} />}
                </button>
              </div>

              {/* Notification list inside user card (always visible, matching image) */}
              <div className={styles.notifList}>
                {notifItems.map((txt, i) => (
                  <div key={i} className={styles.notifRow}>
                    <span className={styles.notifBell}>🔔</span>
                    <span className={styles.notifText}>{txt}</span>
                    {allExams.length > 0 && (
                      <span className={styles.notifCheck}>✓</span>
                    )}
                  </div>
                ))}
                <div className={styles.notifOptions}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  Options
                </div>
              </div>
            </div>
          </div>

          {/* ── Content area ── */}
          <div className={styles.content}>
            <AnimatePresence mode="wait">

              {/* Profile */}
              {activeNav === "Profile" && (
                <motion.div key="profile" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className={styles.glassCard} style={{ maxWidth: 440, textAlign: "center", padding: "36px 30px" }}>
                    <div className={styles.bigAvatar}>
                      {profilePhoto ? <img src={profilePhoto} alt="" /> : <span>{student?.name?.[0] || "S"}</span>}
                    </div>
                    <div className={styles.profileName}>{student?.name}</div>
                    <div className={styles.profileEmail}>{student?.email}</div>
                    <div className={styles.profileBranch}>Branch: <strong>{student?.branch}</strong></div>
                    <div className={styles.profileActions}>
                      <label className={styles.btnSecondary}>
                        Upload Photo
                        <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                      </label>
                      {profilePhoto && <button className={styles.btnDanger} onClick={removePhoto}>Remove</button>}
                      <button className={styles.btnDanger} onClick={handleLogout}>Sign Out</button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* History */}
              {activeNav === "History" && (
                <motion.div key="history" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className={styles.glassCard} style={{ maxWidth: 520, textAlign: "center", padding: "52px 32px" }}>
                    <div style={{ fontSize: 34, marginBottom: 12, opacity: 0.4 }}>🕰</div>
                    <div className={styles.emptyTitle}>Exam History</div>
                    <div className={styles.emptySub}>Your past exam results will appear here once you complete an exam.</div>
                  </div>
                </motion.div>
              )}

              {/* Skills */}
              {activeNav === "Skills" && (
                <motion.div key="skills" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className={styles.insightsPanel}>
                    <div className={styles.insightCompleted}>
                      <div className={styles.insightSmLabel}>Completed Exams</div>
                      <div className={styles.insightBigNum}>{completedCount}</div>
                    </div>
                    <div className={styles.insightScore}>
                      <div className={styles.insightSmLabel}>Skill Score:</div>
                      <div className={styles.insightPercentile}>
                        {completedCount > 0 ? `${skillPercentile}th Percentile` : "Complete an exam to unlock"}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Home / Aptitude / Programming */}
              {!["Profile","History","Skills"].includes(activeNav) && (
                <motion.div key={activeNav} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>

                  {/* Exam cards grid */}
                  {loading ? (
                    <div className={styles.examGrid}>
                      {[1,2].map(i => (
                        <div key={i} className={`${styles.glassCard} ${styles.skeleton}`} style={{ height: 180 }} />
                      ))}
                    </div>
                  ) : filteredExams.length === 0 ? (
                    <div className={styles.emptyBox}>
                      <div className={styles.emptyTitle}>No exams available right now</div>
                      <div className={styles.emptySub}>Check back later or contact your administrator.</div>
                    </div>
                  ) : (
                    <div className={styles.examGrid}>
                      {filteredExams.map((exam, idx) => {
                        const timeLeft = getTimeUntil(exam.scheduled_start);
                        const isApt = exam.category !== "Programming";
                        const scheduledDate = exam.scheduled_start
                          ? new Date(exam.scheduled_start).toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit" })
                          : "TBD";
                        const scheduledTime = exam.scheduled_start
                          ? new Date(exam.scheduled_start).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
                          : "--:--";

                        return (
                          <motion.div key={exam.id} className={styles.examCard}
                            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.07 }}>

                            {/* Constellation or code icon in top-right */}
                            <div className={styles.examCardDeco}>
                              {isApt
                                ? <ConstellationSVG color="#c8a060" />
                                : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}><CodeIcon /></div>
                              }
                            </div>

                            {/* Header */}
                            <div className={styles.examCardHeader}>
                              <h3 className={styles.examCardTitle}>{exam.exam_name}</h3>
                              <span className={`${styles.examBadge} ${exam.is_active ? styles.badgeActive : styles.badgeScheduled}`}>
                                {exam.is_active ? "Active" : "Scheduled"}
                              </span>
                            </div>

                            {/* Meta */}
                            <div className={styles.examMeta}>
                              <span>📅 {scheduledDate}</span>
                              <span>⏱ {scheduledTime} · {exam.duration_minutes} min</span>
                              {exam.question_count && <span>📝 {exam.question_count} Qs</span>}
                            </div>

                            {/* Progress bar */}
                            <div className={styles.progressTrack}>
                              <div className={styles.progressFill}
                                style={{ width: `${Math.min((exam.question_count || 20) / 50 * 100, 100)}%` }} />
                            </div>

                            {/* Footer */}
                            <div className={styles.examFooter}>
                              <button className={styles.startBtn}
                                disabled={!exam.is_active || warpActive}
                                onClick={() => handleLaunch(exam)}>
                                {warpActive ? "Loading..." : "Start Exam"}
                              </button>
                              {timeLeft
                                ? <span className={styles.countdown}>Starts in {timeLeft}</span>
                                : exam.is_active && <span className={styles.liveTag}>Available Now</span>}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick Insights — Home only */}
                  {activeNav === "Home" && (
                    <motion.div className={styles.insightsPanel}
                      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
                      <div className={styles.insightCompleted}>
                        <div className={styles.insightSmLabel}>Completed Exams</div>
                        <div className={styles.insightBigNum}>{completedCount}</div>
                      </div>
                      <div className={styles.insightScore}>
                        <div className={styles.insightSmLabel}>Skill Score:</div>
                        <div className={styles.insightPercentile}>
                          {completedCount > 0 ? `${skillPercentile}th Percentile` : "Complete an exam to unlock"}
                        </div>
                      </div>
                    </motion.div>
                  )}

                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={styles.modalOverlay} onClick={() => setShowProfileModal(false)}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className={styles.modalBox} onClick={e => e.stopPropagation()}>
              <h3 className={styles.modalTitle}>Profile Settings</h3>
              <div className={styles.bigAvatar} style={{ margin: "0 auto 14px" }}>
                {profilePhoto ? <img src={profilePhoto} alt="" /> : <span>{student?.name?.[0] || "S"}</span>}
              </div>
              <p style={{ textAlign: "center", color: "#c0d0f0", fontWeight: 600, marginBottom: 2 }}>{student?.name}</p>
              <p style={{ textAlign: "center", color: "#4a6080", fontSize: 13, marginBottom: 22 }}>{student?.email}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label className={styles.btnSecondary} style={{ textAlign: "center", cursor: "pointer" }}>
                  Upload Photo
                  <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                </label>
                {profilePhoto && <button className={styles.btnDanger} onClick={removePhoto}>Remove Photo</button>}
                <button className={styles.btnDanger} onClick={handleLogout}>Sign Out</button>
                <button className={styles.btnClose} onClick={() => setShowProfileModal(false)}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
