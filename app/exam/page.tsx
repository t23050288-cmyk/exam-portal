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
const AntiCheat = nextDynamic(() => import("@/components/AntiCheat"), { ssr: false });
import Skeleton from "@/components/Skeleton";
import Background from "@/components/dashboard/Background";
import styles from "./exam.module.css";

interface StudentInfo {
  id: string;
  name: string;
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

  // Pagination state
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [flagged, setFlagged] = useState<Set<number>>(new Set());

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
          supabase.from("exam_status")
            .select("status")
            .eq("student_id", studentId) // Uses UUID
            .maybeSingle()
            .then(({ data }: { data: any }) => {
              if (data?.status === "submitted") {
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

    // Fetch initial warning count from exam_status
    if (info.id && info.id !== "PREVIEW") {
      import("@/lib/supabase").then(({ supabase }) => {
        supabase.from("exam_status")
          .select("warnings")
          .eq("student_id", info.id)
          .maybeSingle()
          .then(({ data }: { data: any }) => {
            if (data) {
              setWarningCount(data.warnings || 0);
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

    // ── Cache DISABLED (as per user request) ──────────────────
    /*
    const cached = loadQuestionsFromCache(quizTitle);
    if (cached && cached.length > 0) {
      console.log(`[EXAM] Loaded ${cached.length} questions from local cache.`);
      setQuestions(cached as Question[]);
      setLoadSource("cache");
      setLoading(false);
      enterFullscreen();
      return () => window.removeEventListener("popstate", handlePopState);
    }
    */

    const jitterMs = Math.floor(Math.random() * 2000);
    const timeoutId = setTimeout(() => {
      console.log(`[EXAM] Fetching questions for: ${quizTitle}`);
      fetchQuestions(quizTitle, Date.now())
        .then(async (qs: any) => {
          console.log(`[EXAM] Fetched ${qs.length} questions from network.`);
          if (qs.length === 0) {
            console.warn(`[EXAM] WARNING: Zero questions for title="${quizTitle}".`);
            setError(`No questions found for exam "${quizTitle}". Please contact your invigilator or refresh the page.`);
            setLoading(false);
            return;
          }
          setQuestions(qs);
          // saveQuestionsToCache(quizTitle, qs);
          setLoadSource("network");
          setLoading(false);
          enterFullscreen();
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
      if (!examTitle) return;
      try {
        const configs = await fetchPublicExamConfig();
        const cfg = configs.find(c => c.exam_title === examTitle) || 
                    configs.find(c => c.exam_title?.toLowerCase() === examTitle.toLowerCase());
        
        if (cfg && cfg.is_active === false) {
          setExamInactive(true);
          setExamScheduled(null);
        } else if (cfg && cfg.scheduled_start) {
          const start = new Date(cfg.scheduled_start);
          if (start > new Date()) {
            setExamScheduled(cfg.scheduled_start);
            setExamInactive(false);
          } else {
            setExamInactive(false);
            setExamScheduled(null);
          }
        } else {
          setExamInactive(false);
          setExamScheduled(null);
        }
      } catch {
        // Silently ignore
      }
    };
    checkConfig();
    const id = setInterval(checkConfig, 15_000);
    return () => clearInterval(id);
  }, [examTitle]);

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
        
        const history = JSON.parse(localStorage.getItem("nexus_exam_results") || "[]");
        history.push({
          examName: examTitle,
          score: res.score,
          totalMarks: res.total_marks,
          timestamp: new Date().toISOString(),
          id: Math.random().toString(36).substr(2, 9)
        });
        localStorage.setItem("nexus_exam_results", JSON.stringify(history));
        
        const completedExams = JSON.parse(localStorage.getItem("nexus_completed_exams") || "[]");
        if (!completedExams.includes(examTitle)) {
          completedExams.push(examTitle);
          localStorage.setItem("nexus_completed_exams", JSON.stringify(completedExams));
        }

        clearExamStorage();
        setIsSubmitted(true);
        setSubmitResult(res);
        setSubmitting(false);
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
    if (resultTimerSeconds === 0) {
       router.replace("/dashboard?tab=History");
       return;
    }
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
  }, [isSubmitted, resultTimerSeconds, router]);

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
        isSubmitted={isSubmitted} 
        onAutoSubmit={() => handleSubmit(true)}
        onViolation={(type, meta) => {
          recordEvent(type as any);
          if (meta && typeof meta.warning_count === 'number') setWarningCount(meta.warning_count);
        }}
        initialWarningCount={warningCount}
        forceReenterFullscreen={enterFullscreen}
      />
      {content}
    </div>
  );

  if (loading) {
    return withAntiCheat(
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
    );
  }

  if (error && !isSubmitted) {
    return withAntiCheat(
      <div className="page-center">
        <div className={styles.errorBox}>
          <p className="text-danger">{error}</p>
          <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '8px', color: 'var(--text-secondary)' }}>
            Exam Node: {examTitle} | Branch: {student?.id ? "Syncing..." : "Offline"}
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
    return (
      <div className={styles.submittedWrapper}>
        <div style={{ position: "fixed", top: "10%", left: "15%", width: 400, height: 400, background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ position: "fixed", bottom: "10%", right: "15%", width: 400, height: 400, background: "radial-gradient(circle, rgba(13,148,136,0.15) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div className={styles.successCapsule}>
          <div className={styles.hourglassBg}>
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <path d="M5 2h14" /><path d="M5 22h14" /><path d="M19 2a33 33 0 0 1-14 0" /><path d="M19 22a33 33 0 0 0-14 0" /><path d="M15 2v1c0 5-6 5-6 10s6 5 6 10v1" /><path d="M9 2v1c0 5 6 5 6 10s-6 5-6 10v1" />
            </svg>
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <h1 className={styles.thankYouTitle}>THANK YOU!</h1>
            <div className={styles.resultMetaRow}>
              <div className={styles.subStatus}>
                Exam Submitted <span style={{ background: "#22c55e", borderRadius: "4px", padding: "1px 5px", fontSize: "14px", marginLeft: "2px" }}>✓</span>
              </div>
              <div className={styles.answeredCount}>
                Answered: {getAnsweredCount(questions.length)}/{questions.length}
              </div>
            </div>
            {showResultDetails && (
              <div className={styles.resultCard}>
                <div className={styles.resultDetail}><div className={styles.detailValue} style={{ color: "#34d399" }}>{submitResult.correct_count}</div><div className={styles.detailLabel}>Correct</div></div>
                <div className={styles.resultDetail}><div className={styles.detailValue} style={{ color: "#f87171" }}>{submitResult.wrong_count}</div><div className={styles.detailLabel}>Wrong</div></div>
                <div className={styles.resultDetail}><div className={styles.detailValue} style={{ color: "#94a3b8" }}>{questions.length - (submitResult.correct_count + submitResult.wrong_count)}</div><div className={styles.detailLabel}>Skipped</div></div>
                <div style={{ gridColumn: "1 / -1", marginTop: 12, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                   <div style={{ fontSize: 13, opacity: 0.6 }}>Total Score</div>
                   <div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent-light)" }}>{submitResult.score}/{submitResult.total_marks}</div>
                </div>
              </div>
            )}
            <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12 }}>
              <button className={styles.backToDashboardBtn} onClick={() => router.replace("/dashboard?tab=History")}>GO TO SKILLS INSIGHTS →</button>
              <div style={{ fontSize: 12, opacity: 0.5, textAlign: "center" }}>Auto-redirecting in {resultTimerSeconds}s...</div>
            </div>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--panel-glass)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", padding: "16px 28px", borderRadius: "20px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", border: "1px solid var(--rim-metal)" }}>
             <h1 style={{ margin: 0, fontSize: "20px", color: "var(--text-primary)", fontWeight: 700 }}>{examTitle || "Online Assessment"}</h1>
             <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
               {!isSubmitted && (
                 <div style={{ display: "flex", alignItems: "center", gap: 6, background: warningCount >= 2 ? "rgba(239,68,68,0.18)" : warningCount === 1 ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${warningCount >= 2 ? "rgba(239,68,68,0.6)" : warningCount === 1 ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, padding: "4px 12px", color: warningCount >= 2 ? "#ef4444" : warningCount === 1 ? "#f59e0b" : "rgba(148,163,184,0.7)", fontWeight: 700, fontSize: 13, transition: "all 0.4s ease" }}>
                   ⚠️ {warningCount}/3 Warnings
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
                <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "flex-end", marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--rim-metal)" }}>
                  {activeQuestionIndex < questions.length - 1 && (
                    <button type="button" style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)", color: "#fff", border: "none", padding: "16px 36px", borderRadius: "16px", fontWeight: 900, fontSize: "14px", cursor: "pointer", boxShadow: "0 8px 25px rgba(6, 182, 212, 0.3)", transition: "all 0.3s ease", letterSpacing: "0.08em", textTransform: "uppercase" }} onClick={() => setActiveQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}>NEXT QUESTION →</button>
                  )}
                  <button type="button" style={{ background: flagged.has(activeQuestionIndex) ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.08)", border: flagged.has(activeQuestionIndex) ? "2px solid #eab308" : "1px solid rgba(255,255,255,0.15)", color: flagged.has(activeQuestionIndex) ? "#eab308" : "var(--text-primary)", padding: "16px 28px", borderRadius: "16px", fontWeight: 800, fontSize: "14px", cursor: "pointer", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", display: "flex", alignItems: "center", gap: 10, letterSpacing: "0.05em", textTransform: "uppercase" }} onClick={toggleFlag}>
                    <span>{flagged.has(activeQuestionIndex) ? "🚩" : "🏳️"}</span>
                    {flagged.has(activeQuestionIndex) ? "FLAG" : "MARK AS FLAG"}
                  </button>
                  <button id="submit-exam-btn" type="button" style={{ background: "linear-gradient(135deg, #ff4d4d, #cc0000)", color: "#fff", border: "none", padding: "16px 36px", borderRadius: "16px", fontWeight: 900, fontSize: "14px", cursor: "pointer", boxShadow: "0 10px 30px rgba(255, 77, 77, 0.4)", transition: "all 0.3s ease", letterSpacing: "0.1em", textTransform: "uppercase" }} onClick={() => setConfirmSubmit(true)} disabled={submitting}>{submitting ? "..." : "SUBMIT EXAM"}</button>
                </div>
              </QuestionCard>
            )}
          </div>
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
          </div>
        </aside>
      </main>
      
      {/* ── Confirm Submit Modal ── */}
      {confirmSubmit && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2>Submit Assessment?</h2>
            <p>You have answered {answeredCount} out of {questions.length} questions. You cannot undo this action.</p>
            <div className={styles.modalActions}>
              <button className={styles.confirmBtn} onClick={() => handleSubmit()} disabled={submitting}>YES, SUBMIT</button>
              <button className={styles.cancelBtn} onClick={() => setConfirmSubmit(false)} disabled={submitting}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
