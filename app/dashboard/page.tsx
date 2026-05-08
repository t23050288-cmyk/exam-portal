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
  { id: "Home",        svgPath: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", label: "Home" },
  { id: "Aptitude",   svgPath: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Aptitude Test" },
  { id: "Programming",svgPath: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4", label: "Programming" },
  { id: "Profile",    svgPath: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", label: "Profile" },
  { id: "History",    svgPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", label: "History" },
  { id: "Skills",     svgPath: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", label: "Skills Insights" },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

function getTimeUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000);
  return `${d}D ${h}H`;
}

function Constellation({ color = "#6890ff", width = 160, height = 100 }: { color?: string; width?: number; height?: number }) {
  const pts: [number, number][] = [
    [0.1, 0.2], [0.3, 0.1], [0.5, 0.4], [0.7, 0.15], [0.9, 0.35],
    [0.8, 0.7], [0.55, 0.85], [0.25, 0.75], [0.05, 0.55],
  ];
  const lines = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[2,7],[3,5]];
  return (
    <svg width={width} height={height} viewBox="0 0 1 1" preserveAspectRatio="none" style={{ opacity: 0.22 }}>
      {lines.map(([a,b], i) => (
        <line key={i} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]}
          stroke={color} strokeWidth="0.016" />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.028" fill={color} />
      ))}
    </svg>
  );
}

function NotifDropdown({ exams, onClose }: { exams: ExamNode[]; onClose: () => void }) {
  const items = exams.length > 0
    ? exams.slice(0, 3).map(e => `${e.exam_name} results ready`)
    : ["No new notifications"];
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.17 }}
      className={styles.notifDropdown}
    >
      {items.map((txt, i) => (
        <div key={i} className={styles.notifItem}>
          <span className={styles.notifBell}>🔔</span>
          <span style={{ flex: 1 }}>{txt}</span>
          {exams.length > 0 && <span className={styles.notifCheck}>✓</span>}
        </div>
      ))}
      <div className={styles.notifOptions} onClick={onClose}>
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
  const [showNotif, setShowNotif] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [warpActive, setWarpActive] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [skillScore, setSkillScore] = useState(0);

  useEffect(() => {
    const p = localStorage.getItem("nexus_profile_photo");
    if (p) setProfilePhoto(p);
    try {
      const results = JSON.parse(localStorage.getItem("nexus_exam_results") || "[]");
      setCompletedCount(results.length);
      setSkillScore(results.length > 0
        ? Math.round(results.reduce((a: number, r: any) => a + (r.percentile || r.score || 0), 0) / results.length)
        : 0);
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
              nodes.push({
                id: nid, exam_name: cfg.exam_title, branch, is_active: cfg.is_active,
                duration_minutes: cfg.duration_minutes, scheduled_start: cfg.scheduled_start,
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
    if (["Profile", "History", "Skills"].includes(activeNav)) return false;
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

  return (
    <>
      <AnimatePresence>
        {warpActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{
              position: "fixed", inset: 0, zIndex: 9999,
              background: "radial-gradient(circle, rgba(108,92,231,0.5) 0%, rgba(7,8,20,0.98) 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.1, opacity: 1 }}
              style={{ color: "#c8c0ff", fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
              Entering Exam...
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.page}>
        <div className={styles.stars} aria-hidden="true" />
        <div className={styles.nebula1} aria-hidden="true" />
        <div className={styles.nebula2} aria-hidden="true" />

        <AnimatePresence>
          {sidebarOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={styles.backdrop} onClick={() => setSidebarOpen(false)} />
          )}
        </AnimatePresence>

        <button className={styles.hamburger} onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
          <span /><span /><span />
        </button>

        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
          <div className={styles.logoWrap}>
            <div className={styles.logoOrb}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(160,200,255,0.9)" strokeWidth="1.4">
                <circle cx="12" cy="12" r="2.8"/>
                <ellipse cx="12" cy="12" rx="10" ry="3.8"/>
                <ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(60 12 12)"/>
                <ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(120 12 12)"/>
              </svg>
            </div>
            <div>
              <div className={styles.logoTitle}>NEXUS</div>
              <div className={styles.logoSub}>Candidate Portal</div>
            </div>
          </div>

          <nav className={styles.nav}>
            {NAV_ITEMS.map(item => (
              <button key={item.id}
                className={`${styles.navBtn} ${activeNav === item.id ? styles.navBtnActive : ""}`}
                onClick={() => { setActiveNav(item.id); setSidebarOpen(false); }}>
                <span className={styles.navIcon}><NavIcon path={item.svgPath} /></span>
                <span className={styles.navLabel}>{item.label}</span>
                {activeNav === item.id && <span className={styles.navArrow}>›</span>}
              </button>
            ))}
          </nav>

          <div className={styles.sidebarBottom}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(100,140,220,0.28)" strokeWidth="1.1">
              <circle cx="12" cy="12" r="2.5"/>
              <ellipse cx="12" cy="12" rx="10" ry="3.5"/>
              <ellipse cx="12" cy="12" rx="10" ry="3.5" transform="rotate(60 12 12)"/>
              <ellipse cx="12" cy="12" rx="10" ry="3.5" transform="rotate(120 12 12)"/>
            </svg>
          </div>
        </aside>

        <div className={styles.main}>
          <header className={styles.topBar}>
            <div className={styles.headerCard}>
              <div className={styles.constellationBg}>
                <Constellation />
              </div>
              <h2 className={styles.headerTitle}>
                {activeNav === "Home" ? "Upcoming Exams"
                  : activeNav === "Skills" ? "Skills Insights"
                  : activeNav}
              </h2>
              <p className={styles.headerSub}>
                {activeNav === "Home" ? "View your scheduled assessments"
                  : activeNav === "Profile" ? "Manage your account details"
                  : activeNav === "History" ? "View your past exam attempts"
                  : activeNav === "Skills" ? "Track your performance and percentile"
                  : `Browse ${activeNav.toLowerCase()} assessments`}
              </p>
            </div>

            <div className={styles.topRight}>
              <div className={styles.notifWrap}>
                <button className={styles.bellBtn} onClick={() => setShowNotif(o => !o)}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {allExams.length > 0 && (
                    <span className={styles.bellBadge}>{Math.min(allExams.length, 9)}</span>
                  )}
                </button>
                <AnimatePresence>
                  {showNotif && <NotifDropdown exams={allExams} onClose={() => setShowNotif(false)} />}
                </AnimatePresence>
              </div>

              <div className={styles.userChip} onClick={() => setShowProfileModal(true)}>
                <div className={styles.userAvatar}>
                  {profilePhoto
                    ? <img src={profilePhoto} alt="avatar" />
                    : <span>{student?.name?.[0]?.toUpperCase() || "S"}</span>}
                </div>
                <div>
                  <div className={styles.userName}>{student?.name?.split(" ")[0] || "Candidate"}</div>
                  <div className={styles.userRole}>Candidate ▾</div>
                </div>
              </div>
            </div>
          </header>

          <main className={styles.content}>
            <AnimatePresence mode="wait">

              {activeNav === "Profile" && (
                <motion.div key="profile"
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className={styles.infoCard} style={{ maxWidth: 460, textAlign: "center" }}>
                    <div className={styles.bigAvatar}>
                      {profilePhoto ? <img src={profilePhoto} alt="avatar" /> : <span>{student?.name?.[0] || "S"}</span>}
                    </div>
                    <h3 className={styles.profileName}>{student?.name}</h3>
                    <p className={styles.profileEmail}>{student?.email}</p>
                    <p className={styles.profileBranch}>Branch: <strong>{student?.branch}</strong></p>
                    <div className={styles.profileActions}>
                      <label className={styles.uploadBtn}>
                        Upload Photo
                        <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                      </label>
                      {profilePhoto && <button className={styles.dangerBtn} onClick={removePhoto}>Remove</button>}
                      <button className={styles.dangerBtn} onClick={handleLogout}>Sign Out</button>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeNav === "History" && (
                <motion.div key="history" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className={styles.infoCard} style={{ maxWidth: 540, textAlign: "center", padding: "52px 40px" }}>
                    <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.45 }}>🕰</div>
                    <h3 className={styles.emptyTitle}>Exam History</h3>
                    <p className={styles.emptySub}>Your past exam results will appear here once you complete an exam.</p>
                  </div>
                </motion.div>
              )}

              {activeNav === "Skills" && (
                <motion.div key="skills" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className={styles.insightsSection}>
                    <h3 className={styles.insightsTitle}>Quick Insights</h3>
                    <div className={styles.insightsRow}>
                      <div className={styles.insightCard}>
                        <div className={styles.insightLabel}>Completed Exams</div>
                        <div className={styles.insightBigNum}>{completedCount}</div>
                      </div>
                      <div className={`${styles.insightCard} ${styles.insightWide}`}>
                        <div className={styles.insightLabel}>Skill Score:</div>
                        <div className={styles.insightPercentile}>
                          {completedCount > 0 ? `${skillScore}th Percentile` : "Complete an exam to unlock"}
                        </div>
                        {completedCount > 0 && (
                          <div className={styles.skillBar}>
                            <div className={styles.skillBarFill} style={{ width: `${skillScore}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {!["Profile","History","Skills"].includes(activeNav) && (
                <motion.div key={activeNav}
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}>

                  {loading ? (
                    <div className={styles.examGrid}>
                      {[1,2].map(i => (
                        <div key={i} className={`${styles.examCard} ${styles.skeletonCard}`}>
                          <div className={styles.skLine} style={{ width: "55%", height: 20, marginBottom: 16 }} />
                          <div className={styles.skLine} style={{ width: "35%", height: 13, marginBottom: 10 }} />
                          <div className={styles.skLine} style={{ width: "100%", height: 5, marginBottom: 22 }} />
                          <div className={styles.skLine} style={{ width: 110, height: 36 }} />
                        </div>
                      ))}
                    </div>
                  ) : filteredExams.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>📋</div>
                      <div className={styles.emptyTitle}>No exams available</div>
                      <div className={styles.emptySub}>Check back later for new assessments.</div>
                    </div>
                  ) : (
                    <div className={styles.examGrid}>
                      {filteredExams.map((exam, idx) => {
                        const timeLeft = getTimeUntil(exam.scheduled_start);
                        const isApt = exam.category === "Aptitude";
                        const accentHue = isApt ? "#4a80ff" : "#9060e0";
                        const scheduledDate = exam.scheduled_start
                          ? new Date(exam.scheduled_start).toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit" })
                          : "TBD";
                        const scheduledTime = exam.scheduled_start
                          ? new Date(exam.scheduled_start).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
                          : "--:--";
                        return (
                          <motion.div key={exam.id} className={styles.examCard}
                            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.07 }}>
                            <div className={styles.cardConst}>
                              <Constellation color={accentHue} width={130} height={90} />
                            </div>
                            <div className={styles.examCardHeader}>
                              <h3 className={styles.examCardTitle}>{exam.exam_name}</h3>
                              <span className={`${styles.examBadge} ${exam.is_active ? styles.examBadgeActive : ""}`}>
                                {exam.is_active ? "Active" : "Scheduled"}
                              </span>
                            </div>
                            <div className={styles.examMeta}>
                              <span>📅 {scheduledDate}</span>
                              <span>⏱ {scheduledTime} · {exam.duration_minutes} min</span>
                              {exam.question_count && <span>📝 {exam.question_count} Qs</span>}
                            </div>
                            <div className={styles.progressTrack}>
                              <div className={styles.progressFill}
                                style={{
                                  width: `${Math.min((exam.question_count || 0) / 50 * 100, 100)}%`,
                                  background: `linear-gradient(90deg, ${accentHue}88, ${accentHue})`,
                                }} />
                            </div>
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

                  {activeNav === "Home" && (
                    <motion.div className={styles.insightsSection}
                      initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                      <h3 className={styles.insightsTitle}>Quick Insights</h3>
                      <div className={styles.insightsRow}>
                        <div className={styles.insightCard}>
                          <div className={styles.insightLabel}>Completed Exams</div>
                          <div className={styles.insightBigNum}>{completedCount}</div>
                        </div>
                        <div className={`${styles.insightCard} ${styles.insightWide}`}>
                          <div className={styles.insightLabel}>Skill Score:</div>
                          <div className={styles.insightPercentile}>
                            {completedCount > 0 ? `${skillScore}th Percentile` : "Complete an exam to unlock"}
                          </div>
                          {completedCount > 0 && (
                            <div className={styles.skillBar}>
                              <div className={styles.skillBarFill} style={{ width: `${skillScore}%` }} />
                            </div>
                          )}
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

      <AnimatePresence>
        {showProfileModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={styles.modalOverlay} onClick={() => setShowProfileModal(false)}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className={styles.modalBox} onClick={e => e.stopPropagation()}>
              <h3 className={styles.modalTitle}>Profile Settings</h3>
              <div className={styles.bigAvatar} style={{ margin: "0 auto 16px" }}>
                {profilePhoto ? <img src={profilePhoto} alt="avatar" /> : <span>{student?.name?.[0] || "S"}</span>}
              </div>
              <p style={{ textAlign: "center", color: "#c8d0f0", fontWeight: 600, marginBottom: 4 }}>{student?.name}</p>
              <p style={{ textAlign: "center", color: "#5a6880", fontSize: 13, marginBottom: 24 }}>{student?.email}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label className={styles.uploadBtn} style={{ textAlign: "center", display: "block", cursor: "pointer" }}>
                  Upload Photo
                  <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                </label>
                {profilePhoto && <button className={styles.dangerBtn} onClick={removePhoto}>Remove Photo</button>}
                <button className={styles.dangerBtn} onClick={handleLogout}>Sign Out</button>
                <button className={styles.closeBtn} onClick={() => setShowProfileModal(false)}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
