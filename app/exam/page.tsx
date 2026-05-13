"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { fetchQuestions, submitExam, fetchPublicExamConfig, submitCodeAnswer, type Question, type SubmitResponse, type TestResult } from "@/lib/api";
import { useExamState, clearExamStorage, saveQuestionsToCache, loadQuestionsFromCache } from "@/hooks/useExamState";
import { useExamSync } from "@/hooks/useExamSync";
import SyncStatusBar from "@/components/SyncStatusBar";
import { useFullscreen } from "@/hooks/useFullscreen";
import ExamTimer from "@/components/ExamTimer";
import QuestionCard from "@/components/QuestionCard";
import nextDynamic from "next/dynamic";
const AntiCheat = nextDynamic(() => import("@/components/AntiCheat"), { 
  ssr: false,
  loading: () => <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 999999, display: 'grid', placeItems: 'center', color: '#fff'}}>Loading Security Suite...</div>
});
import Skeleton from "@/components/Skeleton";
import Background from "@/components/dashboard/Background";
import styles from "./exam.module.css";

interface StudentInfo {
  id: string;
  name: string;
  branch?: string;
  examTitle?: string;
  examStartTime: string | null;
  examDurationMinutes: number;
}

const FINAL_THEMES = ["glass-aura", "glass-galaxy", "glass-ocean"];

export default function ExamPage() {
  const router = useRouter();
  const { enter: enterFullscreen, active: isFullscreen } = useFullscreen();

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);
  const [showResultDetails, setShowResultDetails] = useState(true);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [examInactive, setExamInactive] = useState(false);
  const [examScheduled, setExamScheduled] = useState<string | null>(null);
  const [examTitle, setExamTitle] = useState("");
  const [saveIndicator, setSaveIndicator] = useState<"idle" | "saving" | "saved">("idle");
  const [loadSource, setLoadSource] = useState<"network" | "cache" | null>(null);
  const [warningCount, setWarningCount] = useState(0);
  const [examDurationMinutes, setExamDurationMinutes] = useState(20);
  const [marksPerQuestion, setMarksPerQuestion] = useState(4);

  // Pagination state
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [showSecureGate, setShowSecureGate] = useState(true);

  // Result Timer (10 seconds for auto-redirect)
  const [resultTimerSeconds, setResultTimerSeconds] = useState(10);

  // Randomized final theme for this student's session
  const [finalTheme, setFinalTheme] = useState("glass-aura");

  const { answers, dirtyIds, selectAnswer, clearDirty, getAnsweredCount } = useExamState();
  // Code answers (Pyodide submissions) stored separately
  const [codeAnswers, setCodeAnswers] = useState<Record<string, { code: string; passedCount: number; totalCount: number }>>({});

  const handleCodeSubmit = useCallback(async (
    questionId: string,
    code: string,
    results: TestResult[],
    passedCount: number,
    totalCount: number
  ) => {
    setCodeAnswers(prev => ({ ...prev, [questionId]: { code, passedCount, totalCount } }));
    try {
      await submitCodeAnswer(questionId, code, results, passedCount, totalCount, false);
    } catch {
      // Silently ignore — will retry on final submit
    }
  }, []);
  const saveIndicatorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [examToken, setExamToken] = useState<string>("");
  const [examSessionId, setExamSessionId] = useState<string>("");

  const {
    syncStatus,
    lastSyncedAt,
    offlineMsg,
    saveAnswer,
    recordEvent,
    downloadBackup,
    flush,
  } = useExamSync({
    sessionId: examSessionId || "init",
    token: examToken,
    enabled: !isSubmitted && !!examSessionId,
  });

  // ── Load student + questions ──────────────────────────────
  useEffect(() => {
    const isPreview = sessionStorage.getItem("exam_preview") === "true";
    const raw = sessionStorage.getItem("exam_student");
    const token = sessionStorage.getItem("exam_token");

    if (!isPreview && (!raw || !token)) {
      router.replace("/login");
      return;
    }

    // Block re-entry: if exam was already submitted, redirect to dashboard
    if (!isPreview) {
      const studentInfo = raw ? JSON.parse(raw) : null;
      const studentId = studentInfo?.id;
      if (studentId) {
        import("@/lib/supabase").then(({ supabase }) => {
          // Check exam_results (has exam_title) for per-exam retake prevention
          const examTitleCheck = sessionStorage.getItem("exam_selected_title") || "";
          supabase.from("exam_results")
            .select("id")
            .eq("student_id", studentId)
            .eq("exam_title", examTitleCheck)
            .limit(1)
            .then(({ data }: { data: any }) => {
              if (data && data.length > 0) {
                // Already submitted this specific exam
                router.replace("/dashboard?tab=History");
              }
            });
        });
      }
    }

    // Wire token into sync engine
    setExamToken(token || "");
    setExamSessionId(sessionStorage.getItem("exam_session_id") || "");

    const info = raw ? JSON.parse(raw) : { 
      id: "PREVIEW", 
      name: "Admin Preview", 
      examStartTime: null, 
      examDurationMinutes: 20,
      examTitle: "Online Assessment"
    };
    
    info.examDurationMinutes = info.examDurationMinutes || 20;
    if (!info.examStartTime) {
      const storedStart = sessionStorage.getItem("exam_start_time");
      if (storedStart) {
        info.examStartTime = storedStart;
      } else {
        const nowIso = new Date().toISOString();
        sessionStorage.setItem("exam_start_time", nowIso);
        info.examStartTime = nowIso;
      }
    }
    
    setStudent(info);

    // Fetch initial warning count from exam_status for THIS SPECIFIC exam
    if (info.id && info.id !== "PREVIEW") {
      const currentExam = sessionStorage.getItem("exam_selected_title") || info.examTitle || "Online Assessment";
      import("@/lib/supabase").then(({ supabase }) => {
        supabase.from("exam_status")
          .select("warnings")
          .eq("student_id", info.id)
          .maybeSingle()
          .then(({ data }: { data: any }) => {
            if (data) {
              setWarningCount(data.warnings || 0);
            } else {
              setWarningCount(0); // Fresh start if no record exists for this exam
            }
          });
      });
    }

    const quizTitle = sessionStorage.getItem("exam_selected_title") || info.examTitle || "Online Assessment";
    setExamTitle(quizTitle);
    
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", handlePopState);

    setFinalTheme(FINAL_THEMES[Math.floor(Math.random() * FINAL_THEMES.length)]);

    // ── Session-level question cache (avoids re-fetching on hot reload) ──
    const cacheKey = `exam_qs_${quizTitle}`;
    const cachedRaw = sessionStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const cachedQs = JSON.parse(cachedRaw);
        if (Array.isArray(cachedQs) && cachedQs.length > 0) {
          console.log(`[EXAM] Loaded ${cachedQs.length} questions from session cache.`);
          setQuestions(cachedQs);
          setLoadSource("cache");
          setLoading(false);
          return () => window.removeEventListener("popstate", handlePopState);
        }
      } catch { /* ignore parse error, fetch fresh */ }
    }

    // Stagger concurrent students: random 0–4s jitter
    const jitterMs = Math.floor(Math.random() * 4000);
    const timeoutId = setTimeout(() => {
      console.log(`[EXAM] Fetching questions for: ${quizTitle}`);
      fetchQuestions(quizTitle, Date.now())
        .then(async (qs: any) => {
          const qsArr = Array.isArray(qs) ? qs : (qs.questions || []);
          console.log(`[EXAM] Processed ${qsArr.length} questions.`);
          
          if (qsArr.length === 0) {
            console.warn(`[EXAM] WARNING: Zero questions for title="${quizTitle}".`);
            let msg = `No questions found for exam "${quizTitle}". Please contact your invigilator or refresh the page.`;
            if (qs.available_exams && qs.available_exams.length > 0) {
              msg += `\n\nAvailable exams: ${qs.available_exams.join(", ")}`;
            }
            setError(msg);
            setLoading(false);
            return;
          }
          // Cache questions in session storage to avoid re-fetch
          try { sessionStorage.setItem(cacheKey, JSON.stringify(qsArr)); } catch { /* quota */ }
          setQuestions(qsArr);
          setLoadSource("network");
          setLoading(false);
          // Note: enterFullscreen() is called from the Start button click (user gesture)
          // NOT here — calling requestFullscreen() outside a user gesture is blocked by browsers
        })
        .catch((err) => {
          console.error("[EXAM] Question fetch failed:", err);
          setError("Failed to load exam questions. Please check your connection and refresh.");
          setLoading(false);
        });
    }, jitterMs);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [router, enterFullscreen]);

  useEffect(() => {
    const checkConfig = async () => {
      const token = sessionStorage.getItem("exam_token");
      if (!token || !examTitle) return;

      try {
        const res = await fetch(`/api/admin/exam/config/public?_=${Date.now()}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const configs = await res.json();
        const myConfig = configs.find((c: any) => c.exam_title === examTitle);
        
        if (myConfig) {
          if (myConfig.is_active === false) {
             setError("Exam deactivated by admin.");
             setTimeout(() => router.push("/dashboard"), 3000);
          }

          // Sync Duration
          if (myConfig.duration_minutes && myConfig.duration_minutes !== examDurationMinutes) {
            setExamDurationMinutes(myConfig.duration_minutes);
          }
          // Sync Marks
          if (myConfig.marks_per_question && myConfig.marks_per_question !== marksPerQuestion) {
            setMarksPerQuestion(myConfig.marks_per_question);
          }
        }

        // ── SYNC STATUS: Termination Check ──
        const statusRes = await fetch(`/api/exam/status?_=${Date.now()}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const statusData = await statusRes.json();
        const myStatus = statusData.data?.find((s: any) => s.exam_title === examTitle);
        if (myStatus && myStatus.status === "TERMINATED") {
          router.replace("/dashboard");
        }
      } catch (e) {
        console.error("[Exam] Config sync failed:", e);
      }
    };
    checkConfig();
    const jitter = Math.floor(Math.random() * 15000);
    const id = setInterval(checkConfig, 30_000 + jitter);
    return () => clearInterval(id);
  }, [examTitle, examDurationMinutes, marksPerQuestion]);

  const handleSelect = useCallback(
    (qId: string, option: string) => {
      selectAnswer(qId, option);
      setSaveIndicator("saving");
      saveAnswer(qId, { selected_option: option }).catch(() => {});
      clearTimeout(saveIndicatorTimer.current);
      saveIndicatorTimer.current = setTimeout(() => {
        setSaveIndicator("saved");
        setTimeout(() => setSaveIndicator("idle"), 2000);
      }, 500);
    },
    [selectAnswer, saveAnswer]
  );

  const toggleFlag = () => {
    const newFlags = new Set(flagged);
    if (newFlags.has(activeQuestionIndex)) newFlags.delete(activeQuestionIndex);
    else newFlags.add(activeQuestionIndex);
    setFlagged(newFlags);
  };

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (isSubmitted || submitting) return;
      setSubmitting(true);
      setConfirmSubmit(false);
      setError("");

      try {
        await flush();
        const res = await submitExam(answers, examTitle);
        setSubmitResult(res);
        setIsSubmitted(true);
        setSubmitting(false);
        
        // Final Sync & Cleanup
        try { await flush(); } catch {}
        clearExamStorage();
        sessionStorage.removeItem("exam_start_time");
        sessionStorage.removeItem("exam_selected_title");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Submission failed.";
        setError(auto ? `Auto-submit error: ${msg}` : msg);
        setSubmitting(false);
      }
    },
    [isSubmitted, submitting, flush, answers, examTitle]
  );

  const handleAutoSubmit = useCallback(() => {
    handleSubmit(true);
  }, [handleSubmit]);

  useEffect(() => {
    if (!isSubmitted) return;
    
    const interval = setInterval(() => {
      setResultTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          router.replace("/dashboard?tab=History");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isSubmitted, router]);

  // ── Rendering ───────────────────────────────────────────
  const answeredCount = getAnsweredCount(questions.length);
  const progressPercentage = questions.length > 0 ? (activeQuestionIndex + 1) / questions.length : 0;

  const activeTheme = useMemo(() => {
    if (progressPercentage < 0.2) return "phase-1";
    if (progressPercentage < 0.4) return "ocean";
    if (progressPercentage < 0.6) return "galaxy";
    if (progressPercentage < 0.8) return "nebula";
    return finalTheme;
  }, [progressPercentage, finalTheme]);

  const activeQuestion = questions[activeQuestionIndex];

  // Helper to wrap content with AntiCheat
  const withAntiCheat = (content: React.ReactNode) => (
    <div className={`${styles.wrapper} no-select`} data-theme={activeTheme} style={{ paddingBottom: "120px" }}>
      <Background />
      <AntiCheat 
        sessionId={examSessionId || "init"}
        authToken={examToken}
        studentId={student?.id || "ID_PENDING"}
        studentName={student?.name || "STUDENT_NAME"}
        isSubmitted={isSubmitted} 
        onAutoSubmit={() => handleSubmit(true)}
        onViolation={(type, meta) => {
          recordEvent(type as any);
          if (meta && typeof (meta as any).strike === 'number') {
            setWarningCount((meta as any).strike);
          }
        }}
        initialWarningCount={warningCount}
      >
        {content}
      </AntiCheat>
    </div>
  );

  if (loading || showSecureGate) {
    return (
      <div className={styles.wrapper}>
        <Background />
        
        {showSecureGate ? (
          <div className={styles.secureGate}>
            <div className={styles.gateCard}>
              <div className={styles.gateIcon}>🛡️</div>
              <h2 className={styles.gateTitle}>Final Security Check</h2>
              <p className={styles.gateText}>
                You are about to enter a secure assessment environment.
                Fullscreen mode will be enforced throughout the session.
              </p>
              <div className={styles.gateRules}>
                <div className={styles.rule}>• Tab switching is disabled</div>
                <div className={styles.rule}>• Screenshots are strictly monitored</div>
                <div className={styles.rule}>• Exit from fullscreen logs a violation</div>
              </div>
              <button 
                className={styles.gateBtn}
                onClick={() => {
                  enterFullscreen();
                  setShowSecureGate(false);
                }}
              >
                I AGREE, START EXAM →
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 28 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1200, margin: "0 auto", width: "100%" }}>
              <Skeleton height={80} borderRadius={20} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20 }}>
                <Skeleton height={400} borderRadius={28} />
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Skeleton height={200} borderRadius={20} />
                  <Skeleton height={150} borderRadius={20} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error && !isSubmitted) {
    return withAntiCheat(
      <div className="page-center">
        <div className={styles.errorBox}>
          <p className="text-danger">{error}</p>
          <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '8px', color: 'var(--text-secondary)' }}>
            Exam Node: {examTitle} | Branch: {student?.branch || (student?.id ? "Syncing..." : "Offline")}
          </div>
          <button 
            className="btn btn-primary" 
            style={{ marginTop: '20px' }}
            disabled={submitting}
            onClick={() => window.location.reload()}
          >
            {submitting ? "..." : "Refresh Page"}
          </button>
        </div>
      </div>
    );
  }

  if (submitting) {
    return withAntiCheat(
      <div style={{ display: "grid", placeItems: "center", height: "60vh" }}>
        <div style={{ textAlign: "center", zIndex: 10 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>Submitting exam...</h2>
          <p style={{ opacity: 0.7 }}>Securely uploading your responses</p>
        </div>
      </div>
    );
  }

  if (isSubmitted && submitResult) {
    const pct = submitResult.total_marks > 0 ? Math.round((submitResult.score / submitResult.total_marks) * 100) : 0;
    const correct = submitResult.correct_count ?? 0;
    const wrong = (submitResult.total_questions ?? questions.length) - correct;
    const startIso = sessionStorage.getItem("exam_start_time") || new Date().toISOString();
    const timeTakenSec = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
    const mm = String(Math.floor(timeTakenSec / 60)).padStart(2, "0");
    const ss = String(timeTakenSec % 60).padStart(2, "0");
    const scoreColor = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";

    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "radial-gradient(ellipse at 50% 30%, #0f172a 0%, #060b18 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
        padding: "20px",
      }}>
        {/* subtle star field */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          {Array.from({ length: 60 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute",
              width: i % 5 === 0 ? 2 : 1,
              height: i % 5 === 0 ? 2 : 1,
              background: "rgba(255,255,255," + (0.2 + (i % 4) * 0.1) + ")",
              borderRadius: "50%",
              left: (i * 1.618 * 17) % 100 + "%",
              top: (i * 2.718 * 13) % 100 + "%",
            }} />
          ))}
        </div>

        <div style={{
          position: "relative",
          width: "100%", maxWidth: 460,
          background: "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 24,
          padding: "40px 32px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
          textAlign: "center",
          animation: "fadeInUp 0.5s ease forwards",
        }}>
          {/* Top badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)",
            borderRadius: 999, padding: "4px 14px", marginBottom: 24,
            fontSize: 12, fontWeight: 700, color: "#10b981", letterSpacing: 1,
          }}>
            ✓ EXAM SUBMITTED
          </div>

          {/* Score circle */}
          <div style={{
            width: 120, height: 120, borderRadius: "50%",
            background: `conic-gradient(${scoreColor} ${pct * 3.6}deg, rgba(255,255,255,0.05) 0deg)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 8px",
            boxShadow: `0 0 32px ${scoreColor}40`,
            position: "relative",
          }}>
            <div style={{
              width: 96, height: 96, borderRadius: "50%",
              background: "#0f172a",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column",
            }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{pct}%</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>SCORE</span>
            </div>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "16px 0 4px", letterSpacing: "-0.02em" }}>
            Thank You!
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 28 }}>
            Your assessment has been recorded.
          </p>

          {/* Stats row */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 28,
          }}>
            {[
              { label: "Score", value: `${submitResult.score}/${submitResult.total_marks}`, color: scoreColor },
              { label: "Correct", value: correct, color: "#10b981" },
              { label: "Wrong", value: wrong, color: wrong > 0 ? "#ef4444" : "rgba(255,255,255,0.5)" },
              { label: "Time", value: `${mm}:${ss}`, color: "#60a5fa" },
            ].map((stat) => (
              <div key={stat.label} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 12, padding: "12px 8px",
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 3, fontWeight: 600, letterSpacing: 0.5 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => router.replace("/dashboard?tab=History")}
            style={{
              width: "100%", padding: "14px",
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              border: "none", borderRadius: 12,
              color: "#fff", fontSize: 14, fontWeight: 800,
              cursor: "pointer", letterSpacing: 0.5,
              boxShadow: "0 8px 24px rgba(59,130,246,0.35)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
          >
            VIEW MY RESULTS →
          </button>

          <div style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
            Auto-redirecting in {resultTimerSeconds}s
          </div>
        </div>
      </div>
    );
  }

  return withAntiCheat(
    <>
      {(examInactive || examScheduled) && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
          background: "rgba(10, 10, 20, 0.85)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", animation: "fadeIn 0.5s ease forwards", gap: 16, padding: 24, textAlign: "center",
        }}>
          <div style={{ fontSize: 64, marginBottom: 8, filter: "drop-shadow(0 0 20px rgba(139,92,246,0.6))" }}>{examInactive ? "🛸" : "⏳"}</div>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            {examInactive ? "Exam Unavailable" : "Exam Not Started Yet"}
          </h2>
          <p style={{ color: "rgba(148,163,184,0.8)", fontSize: 15, maxWidth: 360 }}>
            {examInactive ? "The exam has been temporarily deactivated by your administrator." : `Your exam is scheduled to begin at ${examScheduled ? new Date(examScheduled).toLocaleString() : "—"}.`}
          </p>
        </div>
      )}

      <div style={{ padding: "16px 28px 0", zIndex: 2, position: "relative" }}>
        <div style={{ background: "var(--panel-glass)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", padding: "16px 28px", borderRadius: "20px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--rim-metal)" }}>
          <h2 style={{ fontSize: "16px", margin: 0, fontWeight: 700, color: "var(--text-primary)" }}>
            Welcome, {student?.name || "Student"}!{" "}
            {loadSource === "cache" && (
              <span style={{ fontSize: 10, background: "rgba(40, 215, 214, 0.15)", color: "var(--accent-cool)", borderRadius: 6, padding: "2px 7px", marginLeft: 6, fontWeight: 700, verticalAlign: "middle" }}>⚡ Cache</span>
            )}
            <span style={{ fontWeight: 400, opacity: 0.7, color: "var(--text-secondary)" }}> Deep breaths and stay focused. You&apos;ve got this.</span>
          </h2>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--accent-cool-grad)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "16px", boxShadow: "0 4px 12px rgba(40, 215, 214, 0.3)", flexShrink: 0 }}>
            {(student?.name || "S").charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      <main className={styles.main}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* ── Exam info bar — responsive for mobile ── */}
          <div className={styles.examInfoBar}>
            <div className={styles.examInfoTop}>
              <h1 className={styles.examInfoTitle}>{examTitle || "Online Assessment"}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6,
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: 10, padding: "5px 10px",
                color: "#10b981", fontSize: 10, fontWeight: 800,
                letterSpacing: "0.05em", flexShrink: 0 }}>
                <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                  background: "#10b981", animation: "pulseGlow 2s infinite", boxShadow: "0 0 8px #10b981" }} />
                SECURE
              </div>
            </div>
            <div className={styles.examInfoBottom}>
              {!isSubmitted && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: warningCount >= 2 ? "rgba(239,68,68,0.12)" : warningCount === 1 ? "rgba(245,158,11,0.1)" : "transparent",
                  border: `1px solid ${warningCount >= 2 ? "rgba(239,68,68,0.4)" : warningCount === 1 ? "rgba(245,158,11,0.3)" : "transparent"}`,
                  borderRadius: 8, padding: "4px 8px",
                  color: warningCount >= 2 ? "#f87171" : warningCount === 1 ? "#fbbf24" : "rgba(148,163,184,0.5)",
                  fontWeight: 800, fontSize: 11, flexShrink: 0 }}>
                  <span>{warningCount >= 2 ? "🔴" : warningCount === 1 ? "🟠" : "🛡️"}</span>
                  {warningCount}/3
                </div>
              )}
              {student && (
                <ExamTimer startTime={student.examStartTime || new Date().toISOString()} durationMinutes={student.examDurationMinutes || 20} onExpire={handleAutoSubmit} />
              )}
            </div>
          </div>

          <div className={styles.questionList}>
            {activeQuestion && (
              <QuestionCard
                key={activeQuestion.id} question={activeQuestion} questionNumber={activeQuestionIndex + 1} totalQuestions={questions.length} selectedAnswer={answers[activeQuestion.id]} savedCode={codeAnswers[activeQuestion.id]?.code} onSelect={handleSelect} onCodeSubmit={handleCodeSubmit} isSubmitted={isSubmitted}
              >
                <div className={styles.actionsRow}>
                  {/* Row 1: PREV + NEXT (or SUBMIT) */}
                  <div className={styles.navBtnRow}>
                    {activeQuestionIndex > 0 && (
                      <button
                        type="button"
                        className={styles.prevBtn}
                        onClick={() => setActiveQuestionIndex((prev) => Math.max(0, prev - 1))}
                      >
                        ← PREV
                      </button>
                    )}
                    {activeQuestionIndex < questions.length - 1 ? (
                      <button
                        type="button"
                        className={styles.nextBtn}
                        onClick={() => setActiveQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                      >
                        NEXT →
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.finishBtn}
                        onClick={() => setConfirmSubmit(true)}
                      >
                        FINISH & SUBMIT 🚀
                      </button>
                    )}
                  </div>
                  {/* Row 2: Flag button */}
                  <button
                    type="button"
                    className={`${styles.flagBtn} ${flagged.has(activeQuestionIndex) ? styles.flagBtnActive : ""}`}
                    onClick={toggleFlag}
                  >
                    <span>{flagged.has(activeQuestionIndex) ? "🚩" : "🏳️"}</span>
                    {flagged.has(activeQuestionIndex) ? "FLAGGED" : "MARK AS FLAG"}
                  </button>
                </div>
              </QuestionCard>
            )}
          </div>

          {/* ── Mobile sticky bottom bar: progress + submit (fullscreen only) ── */}
          {isFullscreen && !isSubmitted && (
            <div className={styles.mobileBottomBar}>
              <div className={styles.mobileProgress}>
                <span className={styles.mobileProgressText}>
                  {answeredCount} / {questions.length} answered
                </span>
                <div className={styles.mobileProgressTrack}>
                  <div
                    className={styles.mobileProgressFill}
                    style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <button
                className={styles.mobileSubmitBtn}
                onClick={() => setConfirmSubmit(true)}
                disabled={submitting}
              >
                {submitting ? "..." : `SUBMIT (${answeredCount}/${questions.length})`}
              </button>
            </div>
          )}
        </div>
        <aside className={styles.sidebar}>
          <div className={styles.sideCard}>
            <h3 className={styles.sideTitle}>Progress</h3>
            <div className={styles.navGrid}>
              {questions.map((q, i) => {
                const isAnswered = !!answers[q.id];
                const isActive = i === activeQuestionIndex;
                const isFlagged = flagged.has(i);
                return (
                  <button key={q.id} onClick={() => setActiveQuestionIndex(i)} className={`${styles.navBtn} ${isAnswered ? styles.navAnswered : ""} ${isActive ? styles.navActive : ""} ${isFlagged ? styles.navFlagged : ""}`}>
                    {isAnswered ? <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg> : i + 1}
                    {isFlagged && <span style={{ position: "absolute", top: -3, right: -3, width: 10, height: 10, background: "#eab308", borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 0 6px rgba(234,179,8,0.6)" }} />}
                  </button>
                );
              })}
            </div>

            {questions.length > 0 && (
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  className={styles.reviewBtn}
                  style={{
                    width: "100%",
                    padding: "14px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "var(--text-primary)",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "13px",
                    letterSpacing: "0.05em",
                    transition: "all 0.2s ease"
                  }}
                  onClick={() => setActiveQuestionIndex(0)}
                >
                  🔍 REVIEW ALL
                </button>
                <button
                  className={styles.submitBtnSidebar}
                  style={{
                    width: "100%",
                    padding: "16px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    border: "none",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                    fontSize: "14px",
                    letterSpacing: "0.08em",
                    boxShadow: "0 8px 20px rgba(16, 185, 129, 0.25)",
                    transition: "all 0.2s ease"
                  }}
                  onClick={() => setConfirmSubmit(true)}
                >
                  🚀 SUBMIT EXAM
                </button>
              </div>
            )}
          </div>
        </aside>
      </main>
      
      {/* ── Confirm Submit Modal ── */}
      {confirmSubmit && (
        <div className={styles.confirmOverlay} style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(5, 5, 10, 0.75)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.3s ease-out"
        }}>
          <div className={styles.confirmModal} style={{
            background: "linear-gradient(165deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 32, padding: 48, maxWidth: 500, width: "90%",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 80px rgba(139, 92, 246, 0.1)",
            textAlign: "center", position: "relative", overflow: "hidden"
          }}>
            <div style={{
              position: "absolute", top: -50, right: -50, width: 150, height: 150,
              background: "radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)",
              filter: "blur(20px)"
            }} />
            <div style={{ fontSize: 64, marginBottom: 24, filter: "drop-shadow(0 0 15px rgba(16, 185, 129, 0.4))" }}>🚀</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 12, background: "linear-gradient(135deg, #fff, rgba(255,255,255,0.6))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Final Submission
            </h2>
            <p style={{ color: "rgba(148, 163, 184, 0.8)", fontSize: 17, lineHeight: 1.6, marginBottom: 40 }}>
              You have answered <strong>{answeredCount}</strong> out of <strong>{questions.length}</strong> questions.<br/>
              Ready to submit your assessment?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <button
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  color: "#fff", border: "none", padding: "18px", borderRadius: "20px",
                  fontWeight: 900, fontSize: "16px", cursor: "pointer",
                  boxShadow: "0 10px 30px rgba(16, 185, 129, 0.3)",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  letterSpacing: "0.1em", textTransform: "uppercase"
                }}
                onClick={() => handleSubmit()}
                disabled={submitting}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 15px 40px rgba(16, 185, 129, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 10px 30px rgba(16, 185, 129, 0.3)";
                }}
              >
                {submitting ? "Processing..." : "YES, SUBMIT MY EXAM"}
              </button>
              <button
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  color: "rgba(255, 255, 255, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  padding: "16px", borderRadius: "20px",
                  fontWeight: 700, fontSize: "14px", cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onClick={() => setConfirmSubmit(false)}
                disabled={submitting}
              >
                NO, GO BACK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

