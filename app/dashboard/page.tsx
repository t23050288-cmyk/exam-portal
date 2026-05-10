"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { fetchPublicExamConfig } from "@/lib/api";

// Styles
import "./theme.css";
import styles from "./dashboard.module.css";

// Components
import Background from "@/components/dashboard/Background";
import Sidebar from "@/components/dashboard/Sidebar";
import ExamCard from "@/components/dashboard/ExamCard";
import ProfileChip from "@/components/dashboard/ProfileChip";
import FloatingDiamond from "@/components/dashboard/FloatingDiamond";

const Mountain = dynamic(() => import("@/components/dashboard/Mountain"), { 
  ssr: false,
  loading: () => <div style={{ height: '150px' }} />
});

interface ExamNode {
  id: string; exam_name: string; branch: string; is_active: boolean;
  duration_minutes: number; scheduled_start: string | null;
  question_count?: number; category: string;
  submitted?: boolean; score?: number; total_marks?: number;
}
interface StudentInfo {
  id: string; name: string; email: string; branch: string;
}
interface ProfileData {
  name: string; email: string; course: string; photo: string | null;
}

const NAV_ITEMS = [
  { id: "Home", icon: "⌂", label: "Home" },
  { id: "Aptitude", icon: "◎", label: "Aptitude Test" },
  { id: "Programming", icon: "◇", label: "Programming" },
  { id: "Others", icon: "◉", label: "Other Quiz" },
  { id: "PyHunt", icon: "🐍", label: "PyHunt" },
  { id: "Profile", icon: "👤", label: "Profile" },
  { id: "History", icon: "⌛", label: "History" },
  { id: "Insights", icon: "⫏", label: "Skills Insights" },
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
  const [warpActive, setWarpActive] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({ name: "", email: "", course: "", photo: null });
  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft] = useState<ProfileData>({ name: "", email: "", course: "", photo: null });
  const [theme, setTheme] = useState<'galaxy' | 'classic'>('galaxy');
  const [localHistory, setLocalHistory] = useState<any[]>([]);

  // Load History from Local Storage
  useEffect(() => {
    const saved = localStorage.getItem("nexus_exam_results");
    if (saved) {
      setLocalHistory(JSON.parse(saved));
    }
  }, []);

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
    setWarpActive(false); 
  }, [router]);

  const loadExams = useCallback(async () => {
    try {
      const configs = await fetchPublicExamConfig();
      const active = configs.filter((c: any) => c.is_active);
      const { data: qData } = await supabase.from("questions").select("branch, exam_name, category");

      const studentRaw = sessionStorage.getItem("exam_student");
      const studentId = studentRaw ? JSON.parse(studentRaw).id : null;
      let submittedMap: Record<string, { score: number; total_marks: number }> = {};
      if (studentId) {
        const { data: statusData } = await supabase.from("exam_status").select("status, exam_title").eq("student_id", studentId);
        const { data: resultsData } = await supabase.from("exam_results").select("score, total_marks, exam_title").eq("student_id", studentId);
        if (statusData) {
          statusData.forEach((s: any) => {
            if (s.status === "submitted") {
              const r: any = resultsData?.find((rd: any) => rd.exam_title === s.exam_title) || {};
              submittedMap[s.exam_title || ""] = { score: r.score || 0, total_marks: r.total_marks || 0 };
            }
          });
        }
      }

      const nodes: ExamNode[] = []; const seen = new Set<string>();
      if (qData && active.length > 0) {
        for (const cfg of active) {
          const qs = (qData || []).filter((q: any) => q.exam_name === cfg.exam_title);
          const groups: Record<string, { count: number; category: string }> = {};
          qs.forEach((q: any) => {
            const br = q.branch || "CS";
            let cat = q.category || "";
            if (cat !== "Aptitude" && cat !== "Programming") cat = "Others";
            if (!groups[br]) groups[br] = { count: 0, category: cat };
            groups[br].count++;
          });
          Object.entries(groups).forEach(([branch, data]) => {
            const nid = `${cfg.exam_title}-${branch}`;
            if (!seen.has(nid)) {
              const sub = submittedMap[cfg.exam_title];
              nodes.push({ id: nid, exam_name: cfg.exam_title, branch, is_active: cfg.is_active,
                duration_minutes: cfg.duration_minutes, scheduled_start: cfg.scheduled_start,
                question_count: data.count, category: data.category,
                submitted: !!sub, score: sub?.score, total_marks: sub?.total_marks,
              });
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

  const filteredExams = useMemo(() => allExams.filter(e => {
    // Exclude exams already in local history from Home/Upcoming
    const isCompletedLocally = localHistory.some(h => h.examName === e.exam_name);
    if (isCompletedLocally) return false;

    if (activeNav === "Home") return true;
    if (["Profile", "History", "Insights", "PyHunt"].includes(activeNav)) return false;
    return e.category === activeNav;
  }), [allExams, activeNav, localHistory]);

  const activeExams = useMemo(() => filteredExams.filter(e => !e.scheduled_start || new Date(e.scheduled_start).getTime() <= Date.now()), [filteredExams]);
  const upcomingExams = useMemo(() => filteredExams.filter(e => e.scheduled_start && new Date(e.scheduled_start).getTime() > Date.now()), [filteredExams]);

  const { completedCount, avgScore, performanceLocked, lastFive } = useMemo(() => {
    const history = localHistory;
    const count = history.length;
    
    let avg = 0;
    if (count > 0) {
      const totalScore = history.reduce((a, r) => a + (r.score || 0), 0);
      const totalPossible = history.reduce((a, r) => a + (r.totalMarks || 1), 0);
      avg = Math.round((totalScore / totalPossible) * 100);
    }

    return {
      completedCount: count,
      avgScore: avg,
      performanceLocked: count < 3,
      lastFive: history.slice(-5).map(h => ({
        name: h.examName,
        percentage: Math.round((h.score / h.totalMarks) * 100)
      }))
    };
  }, [localHistory]);

  const [enteredPyHuntCode, setEnteredPyHuntCode] = useState("");
  const [pyHuntError, setPyHuntError] = useState(false);
  const VALID_PYHUNT_CODE = "NEXUS24"; // The code to enter

  const handleLaunch = useCallback(async (exam: ExamNode) => {
    if (!exam.is_active) return;
    setWarpActive(true);
    sessionStorage.setItem("exam_selected_title", exam.exam_name);
    await new Promise((r: any) => setTimeout(r, 1200));
    router.push("/instructions");
  }, [router]);

  const handleLogout = () => { 
    sessionStorage.removeItem("exam_token"); 
    sessionStorage.removeItem("exam_student"); 
    localStorage.removeItem("nexus_exam_results"); // Clear local history cache
    router.replace("/login"); 
  };

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
      case "Home": return { title: "Upcoming Exams", sub: "View your scheduled assessments" };
      case "Profile": return { title: "Profile", sub: "View your candidate information" };
      case "PyHunt": return { title: "PyHunt", sub: "System ready for authorization" };
      case "History": return { title: "History", sub: "Review your previous assessments" };
      case "Insights": return { title: "Skills Insights", sub: "Track your performance" };
      default: return { title: activeNav, sub: "System ready for authorization" };
    }
  };
  const hdr = headerText();

  return (
    <div className={styles.page} data-theme={theme}>
      <Background />
      
      <div className={styles.layout}>
        <Sidebar 
          items={NAV_ITEMS} 
          activeItem={activeNav} 
          onItemClick={setActiveNav}
          onLogout={handleLogout}
        />

        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerInfo}>
              <h1 className={styles.pageTitle}>{hdr.title}</h1>
              <p className={styles.pageSub}>{hdr.sub}</p>
            </div>
            <div className={styles.headerActions}>
              <ProfileChip 
                user={{ id: student?.id || "", name: profile.name, photo: profile.photo }}
                onProfileClick={() => setActiveNav("Profile")}
                onLogout={handleLogout}
              />
            </div>
          </header>

          <div className={styles.content}>
            {activeNav === "Home" && (
              <div className={styles.homeGrid}>
                <section className={styles.examSection}>
                  <div className={styles.cardsGrid}>
                    {activeExams.map((exam) => (
                      <ExamCard 
                        key={exam.id} 
                        exam={exam} 
                        onLaunch={() => handleLaunch(exam)} 
                      />
                    ))}
                    {upcomingExams.map((exam) => (
                      <ExamCard 
                        key={exam.id} 
                        exam={exam} 
                        isUpcoming={true}
                        timeUntil={getTimeUntil(exam.scheduled_start)}
                        onLaunch={() => {}} 
                      />
                    ))}
                  </div>
                </section>

                <section className={styles.insightsSection}>
                   <div className={styles.insightsGrid}>
                      <div className={styles.insightCard}>
                        <h3>Quick Insights</h3>
                        <div className={styles.stat}>
                          <span className={styles.label}>Completed Exams</span>
                          <span className={styles.value}>{completedCount}</span>
                        </div>
                      </div>
                      <div className={`${styles.mountainCard} ${performanceLocked ? styles.locked : ""}`}>
                        <div className={styles.mountainHeader}>
                           <span className={styles.label}>Performance:</span>
                           <span className={styles.value}>{!performanceLocked ? `${avgScore}% Rank` : "—"}</span>
                        </div>
                        {!performanceLocked ? (
                          <div className={styles.barGraphContainer}>
                            {lastFive.map((data, i) => (
                              <div key={i} className={styles.barWrapper}>
                                <div className={styles.barValue}>{data.percentage}%</div>
                                <motion.div 
                                  initial={{ height: 0 }}
                                  animate={{ height: `${data.percentage}%` }}
                                  className={styles.bar}
                                />
                                <div className={styles.barLabel}>{data.name.slice(0, 8)}..</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div className={styles.mountainContainer}>
                              <div className={styles.nebulaStar}>
                                <div className={styles.starCore} />
                                <div className={styles.starGlow} />
                                <div className={styles.starRays} />
                              </div>
                            </div>
                            <div className={styles.pedestal}>
                              <div className={styles.pedestalTop} />
                              <div className={styles.pedestalBase} />
                            </div>
                          </>
                        )}
                        {performanceLocked && (
                          <div className={styles.lockOverlay}>
                            <div className={styles.lockIcon}>📊</div>
                            <div className={styles.lockMsg}>You get performance after 3 exams</div>
                          </div>
                        )}
                      </div>
                   </div>
                </section>
              </div>
            )}

            {activeNav !== "Home" && !["Profile", "Learning", "Insights", "PyHunt"].includes(activeNav) && (
              <div className={styles.cardsGrid}>
                 {filteredExams.length > 0 ? (
                   filteredExams.map((exam: any) => (
                      <ExamCard key={exam.id} exam={exam} onLaunch={() => handleLaunch(exam)} />
                   ))
                 ) : (
                   <div className={styles.comingSoonCard}>
                     <div className={styles.comingSoonIcon}>🚀</div>
                     <h3>Coming Soon</h3>
                     <p>Stay tuned! New challenges in {activeNav} are being prepared for your node.</p>
                   </div>
                 )}
              </div>
            )}

            {/* PYHUNT */}
            {activeNav === "PyHunt" && (
              <div className={styles.pyhuntSection}>
                <div className={styles.pyhuntCard}>
                  <div className={styles.pyhuntEmoji}>🐍</div>
                  <h2 className={styles.pyhuntTitle}>PyHunt</h2>
                  <p className={styles.pyhuntDesc}>Python Treasure Hunt — Solve 5 rounds of challenges to find hidden clues!</p>
                  
                  <div className={styles.pyhuntAuth}>
                    <input 
                      type="text" 
                      placeholder="Enter Access Code..." 
                      className={`${styles.pyhuntInput} ${pyHuntError ? styles.pyhuntInputError : ""}`}
                      value={enteredPyHuntCode}
                      onChange={(e) => {
                        setEnteredPyHuntCode(e.target.value.toUpperCase());
                        setPyHuntError(false);
                      }}
                    />
                    <button className={styles.startBtn} onClick={() => {
                      if (enteredPyHuntCode === VALID_PYHUNT_CODE) {
                        router.push("/pyhunt");
                      } else {
                        setPyHuntError(true);
                      }
                    }}>🚀 Start PyHunt</button>
                  </div>
                  {pyHuntError && <p className={styles.authError}>Invalid access code. Contact facilitator.</p>}
                </div>
              </div>
            )}

            {/* PROFILE */}
            {activeNav === "Profile" && (
              <div className={styles.profileStack}>
                {!editingProfile ? (
                  <>
                    <div className={styles.profileBanner}>
                      <div className={styles.profileLeft}>
                        <div className={styles.profileAvatarLarge}>
                          {profile.photo ? <img src={profile.photo} alt="" /> : (profile.name?.[0] || "S")}
                        </div>
                        <div className={styles.profileMeta}>
                          <h2 className={styles.profileName}>{profile.name || "Student"}</h2>
                          <p className={styles.profileEmail}>✉ {profile.email || "—"}</p>
                        </div>
                      </div>
                      <button className={styles.editBtn} onClick={() => setEditingProfile(true)}>
                        <span className={styles.editIcon}>✏️</span> Edit Profile
                      </button>
                    </div>

                    <div className={styles.profileDetailsCard}>
                      <h3 className={styles.detailsTitle}>Personal Information</h3>
                      <div className={styles.detailsGrid}>
                        <div className={styles.detailItem}>
                          <span className={styles.detailIcon}>👤</span>
                          <div className={styles.detailContent}>
                            <label>Full Name</label>
                            <p>{profile.name || "—"}</p>
                          </div>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailIcon}>✉</span>
                          <div className={styles.detailContent}>
                            <label>Email</label>
                            <p>{profile.email || "—"}</p>
                          </div>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailIcon}>📂</span>
                          <div className={styles.detailContent}>
                            <label>Branch</label>
                            <p>{student?.branch || "DS"}</p>
                          </div>
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailIcon}>💳</span>
                          <div className={styles.detailContent}>
                            <label>USN</label>
                            <p>{student?.id || "—"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className={styles.editForm}>
                    <div className={styles.field}>
                      <label>Name</label>
                      <input value={draft.name} onChange={(e: any) => setDraft((d: any) => ({ ...d, name: e.target.value }))} />
                    </div>
                    <div className={styles.field}>
                      <label>Email</label>
                      <input value={draft.email} onChange={(e: any) => setDraft((d: any) => ({ ...d, email: e.target.value }))} />
                    </div>
                    <div className={styles.field}>
                      <label>Profile Photo</label>
                      <input type="file" accept="image/*" onChange={handlePhotoChange} />
                      <p style={{fontSize:'10px', opacity:0.5, marginTop: '4px'}}>Stored locally in your secure environment.</p>
                    </div>
                    <div className={styles.actions}>
                      <button className={styles.saveBtn} onClick={handleSaveProfile}>Save Changes</button>
                      <button className={styles.cancelBtn} onClick={() => setEditingProfile(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* HISTORY */}
            {activeNav === "History" && (
              <div className={styles.historyContainer}>
                <div className={styles.historyCard}>
                  <div className={styles.historyHeader}>
                    <h3>Assessment History</h3>
                    <p>Review your completed exams and scores</p>
                  </div>
                  <div className={styles.historyList}>
                    {localHistory.length === 0 ? (
                      <p className={styles.emptyMsg}>No assessment history found.</p>
                    ) : (
                      localHistory.map((r: any, i: number) => (
                        <div key={i} className={styles.historyItem}>
                          <div className={styles.historyLeft}>
                            <span className={styles.historyIcon}>📋</span>
                            <div className={styles.historyInfo}>
                              <div className={styles.historyName}>{r.examName || "Nexus Assessment"}</div>
                              <div className={styles.historyDate}>{new Date(r.timestamp).toLocaleDateString()}</div>
                            </div>
                          </div>
                          <div className={styles.historyRight}>
                            <div className={styles.historyScore}>
                              <span className={styles.scoreLabel}>Final Score</span>
                              <div className={styles.scoreValue}>{r.score} / {r.totalMarks}</div>
                            </div>
                            <div className={styles.historyStatus}>COMPLETED</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* INSIGHTS */}
            {activeNav === "Insights" && (
              <div className={styles.insightsSection}>
                <div className={styles.insightsGrid}>
                  <div className={styles.insightCard}>
                    <h3>Full Performance</h3>
                    <div className={styles.stat}>
                      <span className={styles.label}>Average Score</span>
                      <span className={styles.value}>{avgScore}%</span>
                    </div>
                  </div>
                  <div className={styles.mountainCard}>
                     <div className={styles.mountainHeader}>
                        <span className={styles.label}>Exam History (Last 5)</span>
                        <span className={styles.value}>{completedCount} Completed</span>
                     </div>
                     <div className={styles.barGraphContainer} style={{ marginTop: '2rem', height: '200px' }}>
                        {lastFive.length > 0 ? lastFive.map((data, i) => (
                          <div key={i} className={styles.barWrapper}>
                            <div className={styles.barValue}>{data.percentage}%</div>
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: `${data.percentage}%` }}
                              className={styles.bar}
                              style={{ background: i % 2 === 0 ? 'var(--nexus-cyan-grad)' : 'var(--accent-warm-grad)' }}
                            />
                            <div className={styles.barLabel}>{data.name}</div>
                          </div>
                        )) : (
                          <div className={styles.emptyMsg}>Take your first exam to see insights!</div>
                        )}
                     </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <button className={styles.themeToggle} onClick={() => setTheme(t => t === 'galaxy' ? 'classic' : 'galaxy')}>
        {theme === 'galaxy' ? '✨' : '🏢'}
      </button>

      <AnimatePresence>
        {warpActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.warpOverlay}>
            <div className={styles.warpContent}>
              <div className={styles.warpIcon}>✨</div>
              <div className={styles.warpText}>ENGAGING WARP DRIVE</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
