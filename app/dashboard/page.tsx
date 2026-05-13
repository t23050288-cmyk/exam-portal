"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
export const dynamic = 'force-dynamic';
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import nextDynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { fetchPublicExamConfig, apiFetch } from "@/lib/api";

// Styles
import "./theme.css";
import styles from "./dashboard.module.css";

// Components
import Background from "@/components/dashboard/Background";
import Sidebar from "@/components/dashboard/Sidebar";
import ExamCard from "@/components/dashboard/ExamCard";
import ProfileChip from "@/components/dashboard/ProfileChip";
import FloatingDiamond from "@/components/dashboard/FloatingDiamond";

const Mountain = nextDynamic(() => import("@/components/dashboard/Mountain"), { 
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
  id: string; name: string; email: string; branch: string; usn?: string;
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
    
    // Identity Hardening: NEVER fallback to localStorage for student identity in a multi-user environment.
    // Stale data in localStorage causes identity leakage between different students.
    const prof: ProfileData = {
      name: s.name || "Student", 
      email: s.email || "",
      course: s.branch || "", 
      photo: null, // Photos should be session-bound or fetched from DB
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
          score: r.correct_count ?? r.score ?? 0,
          totalMarks: r.total_questions ?? r.total_marks ?? 0,
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

    // Reload history + exam list when student returns (e.g. after exam submission)
    const onFocus = async () => {
      const token2 = sessionStorage.getItem("exam_token") || "";
      const histResp = await fetch("/api/exam/history", {
        headers: { "Authorization": `Bearer ${token2}` },
        cache: "no-store",
      }).then(r => r.ok ? r.json() : null).catch(() => null);
      const data = histResp?.results || null;
      if (data && data.length > 0) {
        setLocalHistory(data.map((r: any) => ({
          examName: r.exam_title,
          score: r.correct_count ?? r.score ?? 0,
          totalMarks: r.total_questions ?? r.total_marks ?? 0,
          category: r.category || "Others",
          timestamp: r.submitted_at,
        })));
      }
      // Also refresh exam list so completed exams disappear from Home immediately
      try {
        const { fetchPublicExamConfig } = await import("@/lib/api");
        const configs = await fetchPublicExamConfig();
        const active = configs.filter((c: any) => c.is_active);
        // Trigger loadExams side-effect by dispatching a custom event
        window.dispatchEvent(new CustomEvent("exam-history-updated"));
      } catch {}
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  const deleteHistoryItem = useCallback(async (r: any, i: number) => {
    if (!confirm(`Delete "${r.examName || "this result"}" from your history? This cannot be undone.`)) return;
    try {
      const token = sessionStorage.getItem("exam_token") || "";
      if (r.id) {
        // Delete from backend
        await fetch(`/api/exam/history/${r.id}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}` }
        });
      }
      // Remove from local state
      setLocalHistory(prev => prev.filter((_: any, idx: number) => idx !== i));
    } catch (err) {
      console.warn("Delete failed:", err);
      setLocalHistory(prev => prev.filter((_: any, idx: number) => idx !== i));
    }
  }, []);

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
          
          // Fetch status from our hardened proxy API (handles JWT auth + no-cache)
          const statusResp = await apiFetch<{ data: any[] }>("/exam/status").catch(() => ({ data: [] }));
          const statusData: any[] = statusResp.data || [];
          

          // Fetch results (using studentId for history)
          const { data: resultsData } = await supabase
            .from("exam_results")
            .select("score, total_marks, exam_title, correct_count, total_questions, submitted_at")
            .eq("student_id", studentId);
          
          if (resultsData) {
            const histRecords: any[] = [];
            resultsData.forEach((r: any) => {
              if (r.exam_title) {
                const title = r.exam_title.trim().toLowerCase();
                
                // Calculate question count as a fallback
                const qs = (qData || []).filter((q: any) => (q.exam_name || "").trim().toLowerCase() === title);
                let qCount = 0;
                qs.forEach((q: any) => {
                   const bStr = (q.branch || "").toUpperCase();
                   if (!studentBranch || bStr.includes(studentBranch) || bStr === "" || bStr === "GLOBAL" || bStr === "ALL") {
                     qCount++;
                   }
                });

                // User specifically wants "How much got / Total Questions"
                const displayScore = r.correct_count ?? r.score ?? 0;
                const displayTotal = r.total_questions ?? (qCount > 0 ? qCount : r.total_marks) ?? 0;

                if (!submittedMap[title]) {
                  submittedMap[title] = { score: displayScore, total_marks: displayTotal, attempt_count: 0 };
                }
                submittedMap[title].attempt_count++;
                submittedMap[title].score = displayScore;
                submittedMap[title].total_marks = displayTotal;

                histRecords.push({
                  examName: r.exam_title,
                  score: displayScore,
                  totalMarks: displayTotal,
                  timestamp: r.submitted_at,
                });
              }
            });
            setLocalHistory(histRecords);
          }
          if (statusData) {
            statusData.forEach((s: any) => {
              if ((s.status === "submitted" || s.status === "TERMINATED") && s.exam_title) {
                const title = s.exam_title.trim().toLowerCase();
                if (!submittedMap[title]) {
                  submittedMap[title] = { score: 0, total_marks: 0, attempt_count: 1 };
                } else {
                  submittedMap[title].attempt_count = Math.max(submittedMap[title].attempt_count, 1);
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
            // Match: branch field contains student's branch, or is empty/global/all
            if (!studentBranch || branchStr.includes(studentBranch) || branchStr === "" || branchStr === "GLOBAL" || branchStr === "ALL") {
              matchCount++;
            }
          });

          // BRANCH ISOLATION: If the exam HAS questions but NONE match this
          // student's branch, skip it entirely — don't show it to them.
          if (qs.length > 0 && matchCount === 0 && studentBranch) {
            console.log(`[DASHBOARD] Skipping exam ${cfgTitle} - no questions for branch ${studentBranch}`);
            continue;
          }
          
          // If no questions exist at all for any branch, we usually skip it too 
          // unless it's a global/shared exam config with no questions yet.
          if (qs.length === 0) {
            console.log(`[DASHBOARD] Skipping exam ${cfgTitle} - no questions found.`);
            continue;
          }

          const finalMatchCount = matchCount > 0 ? matchCount : qs.length;

          const nid = cfg.exam_title;
          if (!seen.has(nid)) {
            const sub = submittedMap[cfg.exam_title.trim().toLowerCase()];
            nodes.push({ id: nid, exam_name: cfg.exam_title, branch: "ALL", is_active: cfg.is_active,
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
    // Re-run loadExams when student returns from exam (history updated = exam now completed)
    const onHistoryUpdated = () => loadExams();
    window.addEventListener("exam-history-updated", onHistoryUpdated);
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

    // Check status in database before launch
    const token = sessionStorage.getItem("exam_token");
    if (token) {
      try {
        const res = await fetch(`/api/exam/status?_=${Date.now()}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const statusData = await res.json();
        const myStatus = statusData.data?.find((s: any) => s.exam_title === exam.exam_name);
        
        if (myStatus && myStatus.status === "TERMINATED") {
          alert("You have been terminated from this exam due to violations.");
          setActiveNav("History");
          return;
        }

        if ((exam.attempt_count || 0) >= (exam.max_attempts || 1)) {
          setActiveNav("History");
          return;
        }
      } catch (e) {
        console.error("[Dashboard] Pre-launch check failed:", e);
      }
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
    // Total Wipeout: Clear all traces of the current student session
    sessionStorage.clear();
    localStorage.clear();
    
    // Clear cookies just in case (for future-proofing)
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

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
      case "Events": return { title: "Active Events", sub: "Special challenges and hackathons" };
      case "History": return { title: "History", sub: "Review your previous assessments" };
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
                user={{ id: student?.id || "", name: profile.name, usn: student?.usn, photo: profile.photo }}
                onProfileClick={() => setActiveNav("Profile")}
                onLogout={handleLogout}
              />
            </div>
          </header>

          <div className={styles.content}>
            {activeNav === "Home" && (
              <div className={styles.homeGrid}>
                <section className={styles.examSection}>
                  {/* PyHunt Special Event Banner */}
                  <div 
                    className={styles.pyhuntBanner}
                    onClick={() => setActiveNav("PyHunt")}
                  >
                    <div className={styles.pyhuntBannerGlow} />
                    <div className={styles.pyhuntBannerLeft}>
                      <span className={styles.pyhuntSpecialTag}>⚡ SPECIAL EVENT</span>
                      <h2 className={styles.pyhuntBannerTitle}>
                        <span style={{ fontSize: 20 }}>🐍</span> PyHunt: Logic Treasure Hunt
                      </h2>
                      <p className={styles.pyhuntBannerDesc}>Crack 4 rounds of Python puzzles, unlock clues, and rise to the top.</p>
                      <button className={styles.pyhuntBannerBtn}>JOIN PYHUNT →</button>
                    </div>
                    <div className={styles.pyhuntBannerRight}>
                      <div className={styles.pyhuntOrb} />
                    </div>
                  </div>

                  {/* Available Exams heading */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary, #fff)", margin: 0 }}>Available Exams</h2>
                      <p style={{ fontSize: 13, color: "var(--text-muted, rgba(255,255,255,0.5))", margin: "2px 0 0" }}>Live and upcoming assessments</p>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 12px",
                      background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)",
                      borderRadius: 999, color: "#10b981", letterSpacing: 1,
                    }}>SYSTEM LIVE</span>
                  </div>

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
              </div>
            )}
            
            {activeNav !== "Home" && !["Profile", "PyHunt", "History"].includes(activeNav) && (
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

            {/* PYHUNT (EVENTS) */}
            {activeNav === "PyHunt" && (
              <div className={styles.pyhuntSection}>
                <div className={styles.pyhuntCard}>
                  <div className={styles.pyhuntEmoji}>🐍</div>
                  <h2 className={styles.pyhuntTitle}>PyHunt 2024</h2>
                  <p className={styles.pyhuntDesc}>Python Treasure Hunt — Solve 4 rounds of code challenges to unlock the final offline showdown.</p>
                  
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
                    <button className={styles.startBtn} onClick={async () => {
                      if (enteredPyHuntCode === VALID_PYHUNT_CODE) {
                        const token = sessionStorage.getItem("exam_token");
                        const res = await fetch(`/api/exam/pyhunt/status?_=${Date.now()}`, {
                           headers: { "Authorization": `Bearer ${token}` }
                        });
                        const pyHuntStats = await res.json();
                        const myProgress = pyHuntStats.data;
                        
                        if (myProgress && myProgress.status === "TERMINATED") {
                          setPyHuntError(true);
                          alert("You have been terminated from PyHunt due to violations.");
                          return;
                        }
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
                            <p>{student?.usn || student?.id || "—"}</p>
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
                              <div className={styles.scoreValue}>{r.score ?? 0} / {r.totalMarks ?? 0}</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className={styles.historyStatus}>COMPLETED</div>
                              <button
                                onClick={() => deleteHistoryItem(r, i)}
                                title="Delete this result"
                                style={{
                                  background: "rgba(239,68,68,0.1)",
                                  border: "1px solid rgba(239,68,68,0.3)",
                                  color: "#f87171",
                                  borderRadius: 8,
                                  padding: "5px 10px",
                                  fontSize: 12,
                                  cursor: "pointer",
                                  fontWeight: 700,
                                  transition: "all 0.15s",
                                  flexShrink: 0,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.2)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.1)")}
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
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

