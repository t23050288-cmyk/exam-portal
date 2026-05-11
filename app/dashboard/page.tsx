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
  max_attempts?: number; attempt_count?: number;
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


/* ══ Inline 3D Tree of Life Orb ══ */
function TreeOfLifeOrb({ size = 120, label = "Loading…", sublabel = "" }: { size?: number; label?: string; sublabel?: string }) {
  const s = size;
  const ring1 = s * 1.22;
  const ring2 = s * 1.48;
  return (
    <>
      <style>{`
        @keyframes tol-spin { from { transform: rotateY(0deg) rotateX(8deg); } to { transform: rotateY(360deg) rotateX(8deg); } }
        @keyframes tol-ring1 { from { transform: rotateZ(0deg) rotateX(72deg); } to { transform: rotateZ(360deg) rotateX(72deg); } }
        @keyframes tol-ring2 { from { transform: rotateZ(0deg) rotateX(55deg); } to { transform: rotateZ(-360deg) rotateX(55deg); } }
        @keyframes tol-glow { 0%,100% { opacity:0.55; transform:scale(1); } 50% { opacity:0.85; transform:scale(1.12); } }
        @keyframes tol-float { 0%,100% { transform:translateY(0px); } 50% { transform:translateY(-8px); } }
      `}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:20, userSelect:"none" }}>
        <div style={{ animation:"tol-float 3.5s ease-in-out infinite", position:"relative", width:ring2, height:ring2, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ position:"absolute", width:s*1.6, height:s*1.6, borderRadius:"50%", background:"radial-gradient(circle, rgba(30,220,160,0.18) 0%, rgba(60,120,255,0.08) 50%, transparent 75%)", animation:"tol-glow 2.8s ease-in-out infinite", pointerEvents:"none" }} />
          <div style={{ position:"absolute", width:ring2, height:ring2, borderRadius:"50%", border:"1.5px solid rgba(100,220,180,0.28)", animation:"tol-ring2 8s linear infinite", transformStyle:"preserve-3d" as React.CSSProperties["transformStyle"] }} />
          <div style={{ position:"absolute", width:ring1, height:ring1, borderRadius:"50%", border:"1.5px solid rgba(180,140,80,0.4)", animation:"tol-ring1 5s linear infinite", transformStyle:"preserve-3d" as React.CSSProperties["transformStyle"] }} />
          <div style={{ width:s, height:s, borderRadius:"50%", perspective:s*3, perspectiveOrigin:"50% 50%", transformStyle:"preserve-3d" as React.CSSProperties["transformStyle"] }}>
            <div style={{ width:"100%", height:"100%", borderRadius:"50%", backgroundImage:`url(https://media.base44.com/images/public/69fd11b7a90f528525fa294d/4c5cd2498_image.png)`, backgroundSize:"cover", backgroundPosition:"center", animation:`tol-spin 6s linear infinite`, willChange:"transform", boxShadow:`0 0 ${s*0.25}px rgba(30,220,160,0.35), 0 0 ${s*0.5}px rgba(30,220,160,0.12), inset 0 0 ${s*0.18}px rgba(255,200,80,0.25)` }} />
          </div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ color:"#c0e8d8", fontSize:15, fontWeight:700, letterSpacing:"0.08em", textShadow:"0 0 12px rgba(60,200,140,0.5)" }}>{label}</div>
          {sublabel && <div style={{ color:"#4a8878", fontSize:12, marginTop:4 }}>{sublabel}</div>}
        </div>
      </div>
    </>
  );
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

  useEffect(() => {
    const raw = sessionStorage.getItem("exam_student");
    const token = sessionStorage.getItem("exam_token");
    console.log("[DASHBOARD] Session check:", { hasStudent: !!raw, hasToken: !!token });
    
    if (!raw || !token) { 
      console.warn("[DASHBOARD] Auth missing, redirecting to login.");
      router.replace("/login"); 
      return; 
    }
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

    // ── Auto-switch to History tab if redirected from exam submit ──
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (tabParam === "History") {
      setActiveNav("History");
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Load exam history from Supabase DB (centralized — works across all devices)
    const loadHistory = async () => {
      const token2 = sessionStorage.getItem("exam_token") || "";
      const histResp = await fetch("/api/exam/history", {
        headers: { "Authorization": `Bearer ${token2}` }
      }).then(r => r.ok ? r.json() : null).catch(() => null);
      const data = histResp?.results || null;

      if (data && data.length > 0) {
        const dbHistory = data.map((r: any) => ({
          examName: r.exam_title,
          score: r.score || 0,
          totalMarks: r.total_marks || 0,
          category: r.category || "Others",
          timestamp: r.submitted_at,
        }));
        setLocalHistory(dbHistory);
      }
    };
    loadHistory();

    // Check for direct tab deep-linking (e.g. ?tab=History)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab && NAV_ITEMS.find(n => n.id === tab)) {
        setActiveNav(tab);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    // Reload history from DB when student returns from exam (window focus)
    const onFocus = async () => {
      const token2 = sessionStorage.getItem("exam_token") || "";
      const histResp = await fetch("/api/exam/history", {
        headers: { "Authorization": `Bearer ${token2}` }
      }).then(r => r.ok ? r.json() : null).catch(() => null);
      const data = histResp?.results || null;
      if (data && data.length > 0) {
        setLocalHistory(data.map((r: any) => ({
          examName: r.exam_title,
          score: r.score || 0,
          totalMarks: r.total_marks || 0,
          category: r.category || "Others",
          timestamp: r.submitted_at,
        })));
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  const loadExams = useCallback(async () => {
    try {
      const configs = await fetchPublicExamConfig();
      const active = configs.filter((c: any) => c.is_active);
      const { data: qData, error: qError } = await supabase.from("questions").select("branch, exam_name, category");
      
      if (qError) console.error("[DASHBOARD] Questions fetch error:", qError.message);

      const studentRaw = sessionStorage.getItem("exam_student");
      const studentObj = studentRaw ? JSON.parse(studentRaw) : null;
      const studentId = studentObj?.id;
      const studentBranch = studentObj?.branch?.trim().toUpperCase() || "";
      
      let submittedMap: Record<string, { score: number; total_marks: number; attempt_count: number }> = {};
      
      if (studentId) {
        try {
          const token = sessionStorage.getItem("exam_token") || "";
          
          // Fetch status from our proxy API (handles JWT auth)
          const statusResp = await fetch("/api/exam/status", {
            headers: { "Authorization": `Bearer ${token}` }
          }).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }));
          
          const statusData: any[] = statusResp.data || [];
          
          // Fetch results (using studentId for history)
          const { data: resultsData } = await supabase
            .from("exam_results")
            .select("score, total_marks, exam_title")
            .eq("student_id", studentId);
          
          if (resultsData) {
            resultsData.forEach((r: any) => {
              if (r.exam_title) {
                if (!submittedMap[r.exam_title]) {
                  submittedMap[r.exam_title] = { score: r.score || 0, total_marks: r.total_marks || 0, attempt_count: 0 };
                }
                submittedMap[r.exam_title].attempt_count++;
                submittedMap[r.exam_title].score = r.score;
                submittedMap[r.exam_title].total_marks = r.total_marks;
              }
            });
          }
          if (statusData) {
            statusData.forEach((s: any) => {
              if (s.status === "submitted" && s.exam_title) {
                if (!submittedMap[s.exam_title]) {
                  submittedMap[s.exam_title] = { score: 0, total_marks: 0, attempt_count: 1 };
                }
              }
            });
          }
        } catch (dbErr) {
          console.error("[DASHBOARD] DB fetch failed:", dbErr);
        }
      }



      const nodes: ExamNode[] = []; const seen = new Set<string>();
      
      console.log(`[DASHBOARD] Processing ${active.length} active configs against ${qData?.length || 0} questions.`);

      if (active.length > 0) {
        for (const cfg of active) {
          const cfgTitle = (cfg.exam_title || "").trim().toLowerCase();
          const qs = (qData || []).filter((q: any) => (q.exam_name || "").trim().toLowerCase() === cfgTitle);
          
          // Show the exam even if 0 questions are found (so they can see the error in instructions page)
          // if (qs.length === 0) continue; 

          // ── Branch-aware counting ──
          let matchCount = 0;
          let cat = "Others";
          qs.forEach((q: any) => {
            const branchStr = (q.branch || "").toUpperCase();
            const qCat = q.category || "";
            if (qCat === "Aptitude" || qCat === "Programming") cat = qCat;
            // Match if the branch string contains the student's branch
            if (!studentBranch || branchStr.toUpperCase().includes(studentBranch) || branchStr === "" || branchStr === "GLOBAL" || branchStr === "ALL") {
              matchCount++;
            }
          });

          // Show exam if there are ANY matching questions, or if exam has questions at all
          // Don't hide exam just because branch doesn't match — show all active exams
          const finalMatchCount = matchCount === 0 ? qs.length : matchCount;

          const nid = cfg.exam_title;
          if (!seen.has(nid)) {
            const sub = submittedMap[cfg.exam_title];
            nodes.push({ id: nid, exam_name: cfg.exam_title, branch: studentBranch || "ALL", is_active: cfg.is_active,
              duration_minutes: cfg.duration_minutes, scheduled_start: cfg.scheduled_start,
              question_count: finalMatchCount, category: cat,
              submitted: !!sub, score: sub?.score, total_marks: sub?.total_marks,
              max_attempts: cfg.max_attempts || 1, attempt_count: sub?.attempt_count || 0,
            });
            seen.add(nid);
          }
        }
      }
      setAllExams(nodes);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => {
    loadExams();
    const ch1 = supabase.channel("ec").on("postgres_changes", { event: "*", schema: "public", table: "exam_config" }, () => loadExams()).subscribe();
    const ch2 = supabase.channel("qc").on("postgres_changes", { event: "*", schema: "public", table: "questions" }, () => loadExams()).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [loadExams]);

  const filteredExams = useMemo(() => allExams.filter(e => {
    // ── Branch Filter ──
    if (student) {
      const sb = student.branch.trim().toUpperCase();
      const eb = e.branch.trim().toUpperCase();
      const branchMatch = eb === sb || eb === "GLOBAL" || eb === "" || eb === "ALL" || eb.includes(sb);
      if (!branchMatch) return false;
    }

    // Exclude exams based on attempt limits
    const maxA = e.max_attempts || 1;
    const currentA = e.attempt_count || 0;
    
    if (currentA >= maxA) return false;
    if (e.submitted && maxA <= 1) return false;

    const isCompletedInHistory = localHistory.some(h => 
      (h.examName || "").trim().toLowerCase() === (e.exam_name || "").trim().toLowerCase()
    );
    if (isCompletedInHistory) return false;

    if (activeNav === "Home") return true;
    if (["Profile", "History", "Insights", "PyHunt"].includes(activeNav)) return false;
    if (activeNav === "Others") return e.category !== "Aptitude" && e.category !== "Programming";
    return e.category === activeNav;
  }), [allExams, activeNav, localHistory, student]);

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
        percentage: Math.round((h.score / (h.totalMarks || 1)) * 100)
      }))
    };
  }, [localHistory]);

  const [enteredPyHuntCode, setEnteredPyHuntCode] = useState("");
  const [pyHuntError, setPyHuntError] = useState(false);
  const VALID_PYHUNT_CODE = "NEXUS24"; // The code to enter

  const handleLaunch = useCallback(async (exam: ExamNode) => {
    if (!exam.is_active) return;
    if ((exam.attempt_count || 0) >= (exam.max_attempts || 1)) {
      setActiveNav("History");
      return;
    }

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err: any) {
      console.warn("[Dashboard] Fullscreen blocked:", err.message);
    }

    setWarpActive(true);
    sessionStorage.setItem("exam_selected_title", exam.exam_name);
    await new Promise((r: any) => setTimeout(r, 1200));
    router.push("/instructions");
  }, [router]);

  const handleLogout = () => { 
    sessionStorage.removeItem("exam_token"); 
    sessionStorage.removeItem("exam_student"); 
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
      case "Others": return { title: "Other Quiz", sub: "Explore additional assessments" };
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
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {activeNav !== "Home" && (
                  <button className={styles.backBtnSmall} onClick={() => setActiveNav("Home")}>
                    ←
                  </button>
                )}
                <h1 className={styles.pageTitle}>{hdr.title}</h1>
              </div>
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
                    {activeExams.length === 0 && upcomingExams.length === 0 && (
                      <div className={styles.noExamsMsg}>
                         <div style={{fontSize: "40px", marginBottom: "16px"}}>✨</div>
                         <h3>All Clear!</h3>
                         <p>No active or upcoming exams found for your branch ({student?.branch || "General"}).</p>
                         <button onClick={loadExams} className={styles.refreshBtn}>Check Again</button>
                      </div>
                    )}
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

            {activeNav !== "Home" && !["Profile", "Insights", "PyHunt", "History"].includes(activeNav) && (
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
                      <div style={{ display:"flex", justifyContent:"center", padding:"32px 0" }}>
                        <TreeOfLifeOrb size={100} label="Coming Soon" sublabel="Complete an exam to see your history here" />
                      </div>
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
                  <div className={`${styles.mountainCard} ${performanceLocked ? styles.locked : ""}`}>
                     {performanceLocked && (
                       <div className={styles.lockOverlay}>
                         <div className={styles.lockIcon}>🔒</div>
                         <div className={styles.lockMsg}>Data Unlocks after 3 Exams</div>
                         <p style={{ fontSize: '11px', opacity: 0.6, marginTop: '8px', textAlign: 'center' }}>
                           Complete {3 - completedCount} more assessment{3 - completedCount === 1 ? "" : "s"} to view insights
                         </p>
                       </div>
                     )}
                     <div className={styles.mountainHeader}>
                        <span className={styles.label}>Performance Analytics (Last 5)</span>
                        <span className={styles.value}>{completedCount} Completed</span>
                     </div>
                     <div className={styles.barGraphContainer} style={{ marginTop: '2.5rem', height: '180px' }}>
                        {lastFive.length > 0 ? lastFive.map((data, i) => (
                          <div key={i} className={styles.barWrapper}>
                            <div className={styles.barValue}>{data.percentage}%</div>
                            <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: `${data.percentage}%` }}
                              className={styles.bar}
                              style={{ 
                                background: i % 2 === 0 ? 'var(--nexus-cyan-grad)' : 'var(--accent-warm-grad)',
                                boxShadow: i % 2 === 0 ? '0 0 15px rgba(40, 215, 214, 0.3)' : '0 0 15px rgba(255, 154, 76, 0.3)'
                              }}
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

      {warpActive && (
        <div style={{
          position:"fixed", inset:0, zIndex:9999,
          background:"radial-gradient(ellipse at 50% 40%, #0d1530 0%, #060912 100%)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:["radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.45), transparent)","radial-gradient(1px 1px at 25% 60%, rgba(255,255,255,0.3), transparent)","radial-gradient(1px 1px at 45% 25%, rgba(255,255,255,0.5), transparent)","radial-gradient(1px 1px at 65% 75%, rgba(255,255,255,0.35), transparent)","radial-gradient(1px 1px at 80% 40%, rgba(255,255,255,0.4), transparent)"].join(",") }} />
          <TreeOfLifeOrb size={130} label="Entering Exam…" sublabel="Calibrating your node" />
        </div>
      )}
    </div>
  );
}

