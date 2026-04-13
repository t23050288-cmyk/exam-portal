"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchQuestions, submitExam, fetchPublicExamConfig, type Question } from "@/lib/api";
import { useExamState, clearExamStorage } from "@/hooks/useExamState";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useFullscreen } from "@/hooks/useFullscreen";
import ExamTimer from "@/components/ExamTimer";
import QuestionCard from "@/components/QuestionCard";
import AntiCheat from "@/components/AntiCheat";
import styles from "./exam.module.css";

interface StudentInfo {
  id: string;
  name: string;
  examStartTime: string | null;
  examDurationMinutes: number;
}

export default function ExamPage() {
  const router = useRouter();
  const { enter: enterFullscreen } = useFullscreen();

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    score: number; total: number; percentage: number;
  } | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [examInactive, setExamInactive] = useState(false);
  const [examScheduled, setExamScheduled] = useState<string | null>(null);
  const [examTitle, setExamTitle] = useState("ExamGuard Assessment");
  const [saveIndicator, setSaveIndicator] = useState<"idle" | "saving" | "saved">("idle");

  const { answers, dirtyIds, selectAnswer, clearDirty, getAnsweredCount } = useExamState();
  const saveIndicatorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { flush } = useAutoSave({
    answers,
    dirtyIds,
    clearDirty,
    isSubmitted,
  });

  // ── Load student + questions ──────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem("exam_student");
    const token = sessionStorage.getItem("exam_token");

    if (!raw || !token) {
      router.replace("/login");
      return;
    }

    const info: StudentInfo = JSON.parse(raw);
    setStudent(info);

    fetchQuestions()
      .then((qs) => {
        setQuestions(qs);
        setLoading(false);
        // Enter fullscreen on load
        enterFullscreen();
      })
      .catch(() => {
        setError("Failed to load exam questions. Please refresh.");
        setLoading(false);
      });
  }, [router, enterFullscreen]);

  // ── Exam config polling (inactive guard) ──────────────────
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const cfg = await fetchPublicExamConfig();
        setExamTitle(cfg.exam_title || "ExamGuard Assessment");
        if (!cfg.is_active) {
          setExamInactive(true);
          setExamScheduled(null);
        } else if (cfg.scheduled_start) {
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
        // Silently ignore — default to active
      }
    };
    checkConfig();
    const id = setInterval(checkConfig, 15_000);
    return () => clearInterval(id);
  }, []);

  // ── Handle answer select (with save indicator) ────────────
  const handleSelect = useCallback(
    (qId: string, option: string) => {
      selectAnswer(qId, option);
      setSaveIndicator("saving");
      clearTimeout(saveIndicatorTimer.current);
      saveIndicatorTimer.current = setTimeout(() => {
        setSaveIndicator("saved");
        setTimeout(() => setSaveIndicator("idle"), 2000);
      }, 500);
    },
    [selectAnswer]
  );

  // ── Submit handler ────────────────────────────────────────
  const handleSubmit = useCallback(
    async (auto = false) => {
      if (isSubmitted || submitting) return;
      setSubmitting(true);
      setConfirmSubmit(false);
      setError("");

      try {
        await flush(); // Save any dirty answers first
        const res = await submitExam(answers);
        clearExamStorage();
        sessionStorage.removeItem("exam_token");
        sessionStorage.removeItem("exam_student");
        setIsSubmitted(true);
        setSubmitResult({
          score: res.score,
          total: res.total_marks,
          percentage: res.percentage,
        });
        setSubmitting(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Submission failed.";
        setError(auto ? `Auto-submit error: ${msg}` : msg);
        setSubmitting(false);
      }
    },
    [isSubmitted, submitting, flush, answers]
  );

  const handleAutoSubmit = useCallback(() => {
    handleSubmit(true);
  }, [handleSubmit]);

  // ── Loading state ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-center">
        <div className={styles.loadingBox}>
          <div className="spinner" style={{ width: 36, height: 36 }} />
          <p>Loading exam...</p>
        </div>
      </div>
    );
  }

  if (error && !isSubmitted) {
    return (
      <div className="page-center">
        <div className={styles.errorBox}>
          <p className="text-danger">{error}</p>
          <button 
            className="btn btn-primary" 
            disabled={submitting}
            onClick={() => {
              if (error.includes("Failed to load") || error.includes("refresh")) {
                window.location.reload();
              } else {
                handleSubmit(error.toLowerCase().includes("auto-submit"));
              }
            }}
          >
            {submitting ? "Retrying..." : "Retry"}
          </button>
        </div>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="page-center">
        <div className={styles.loadingBox}>
          <div className="spinner" style={{ width: 36, height: 36 }} />
          <p>Submitting exam...</p>
        </div>
      </div>
    );
  }

  // ── Results screen ────────────────────────────────────────
  if (isSubmitted && submitResult) {
    const pct = submitResult.percentage;
    const grade = pct >= 80 ? "Excellent" : pct >= 60 ? "Good" : pct >= 40 ? "Average" : "Below Average";
    const gradeColor = pct >= 80 ? "var(--success)" : pct >= 60 ? "var(--accent)" : pct >= 40 ? "var(--warning)" : "var(--danger)";

    return (
      <div className="page-center">
        <div className={styles.resultCard}>
          <div className={styles.resultIcon}>✅</div>
          <h1 className={styles.resultTitle}>Exam Submitted</h1>
          <p className={styles.resultSub}>Your answers have been recorded successfully.</p>

          <div className={styles.scoreRing} style={{ "--pct": `${pct}%`, "--color": gradeColor } as React.CSSProperties}>
            <div className={styles.scoreInner}>
              <span className={styles.scoreNum} style={{ color: gradeColor }}>{submitResult.score}</span>
              <span className={styles.scoreTotal}>/ {submitResult.total}</span>
            </div>
          </div>

          <div className={styles.resultStats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Percentage</span>
              <span className={styles.statValue} style={{ color: gradeColor }}>{pct}%</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Grade</span>
              <span className={styles.statValue} style={{ color: gradeColor }}>{grade}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Answered</span>
              <span className={styles.statValue}>{getAnsweredCount(questions.length)}/{questions.length}</span>
            </div>
          </div>

          <p className={styles.resultFooter}>You may close this window now.</p>
        </div>
      </div>
    );
  }

  const answeredCount = getAnsweredCount(questions.length);

  return (
    <div className={`${styles.wrapper} no-select`}>
      {/* ── Weightless Exam Overlay (inactive / scheduled) ── */}
      {(examInactive || examScheduled) && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          background: "rgba(10, 10, 20, 0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          animation: "fadeIn 0.5s ease forwards",
          gap: 16,
          padding: 24,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 64, marginBottom: 8, filter: "drop-shadow(0 0 20px rgba(139,92,246,0.6))" }}>
            {examInactive ? "🛸" : "⏳"}
          </div>
          <h2 style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            {examInactive ? "Exam Unavailable" : "Exam Not Started Yet"}
          </h2>
          <p style={{ color: "rgba(148,163,184,0.8)", fontSize: 15, maxWidth: 360 }}>
            {examInactive
              ? "The exam has been temporarily deactivated by your administrator. Please wait for further instructions."
              : `Your exam is scheduled to begin at ${examScheduled ? new Date(examScheduled).toLocaleString() : "—"}. Please stand by.`
            }
          </p>
          <div style={{
            marginTop: 12,
            padding: "10px 20px",
            borderRadius: 999,
            border: "1px solid rgba(139,92,246,0.3)",
            background: "rgba(139,92,246,0.08)",
            color: "#a78bfa",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: examInactive ? "#f87171" : "#fbbf24", display: "inline-block", animation: "pulse 1.5s ease infinite" }} />
            {examInactive ? "Deactivated" : "Scheduled"}
          </div>
        </div>
      )}

      {/* Anti-cheat: all proctoring attached here */}
      <AntiCheat isSubmitted={isSubmitted} onAutoSubmit={handleAutoSubmit} />

      {/* ── Header ─────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.brand}>
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#4f6ef7"/>
              <path d="M8 12h16M8 16h10M8 20h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="24" cy="20" r="4" fill="#22c55e" stroke="white" strokeWidth="1.5"/>
            </svg>
            <span className={styles.brandName}>ExamGuard</span>
          </div>
          <span className={styles.studentName}>{student?.name}</span>
        </div>

        <div className={styles.headerCenter}>
          <span className={styles.progress}>
            {answeredCount}/{questions.length} answered
          </span>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className={styles.headerRight}>
          {saveIndicator === "saving" && (
            <span className={styles.saveStatus}>
              <span className="spinner" style={{width:12,height:12}} /> Saving...
            </span>
          )}
          {saveIndicator === "saved" && (
            <span className={styles.saveStatus} style={{color:"var(--success)"}}>✓ Saved</span>
          )}
          {student && (
            <ExamTimer
              startTime={student.examStartTime || new Date().toISOString()}
              durationMinutes={student.examDurationMinutes}
              onExpire={handleAutoSubmit}
            />
          )}
          <button
            id="submit-exam-btn"
            className="btn btn-danger"
            onClick={() => setConfirmSubmit(true)}
            disabled={submitting}
          >
            {submitting ? <><span className="spinner"/>Submitting...</> : "Submit Exam"}
          </button>
        </div>
      </header>

      {/* ── Question list ───────────────────────────────────── */}
      <main className={styles.main}>
        <div className={styles.questionList}>
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              questionNumber={i + 1}
              selectedAnswer={answers[q.id]}
              onSelect={handleSelect}
              isSubmitted={isSubmitted}
            />
          ))}
        </div>

        {/* Sidebar nav */}
        <aside className={styles.sidebar}>
          <div className={styles.sideCard}>
            <h3 className={styles.sideTitle}>Questions</h3>
            <div className={styles.navGrid}>
              {questions.map((q, i) => (
                <a
                  key={q.id}
                  href={`#question-${i + 1}`}
                  className={`${styles.navBtn} ${answers[q.id] ? styles.navAnswered : ""}`}
                  aria-label={`Question ${i + 1}`}
                >
                  {i + 1}
                </a>
              ))}
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.navBtn} ${styles.navAnswered}`} style={{display:"inline-block",width:20,height:20,fontSize:10}}>✓</span>
                Answered
              </span>
              <span className={styles.legendItem}>
                <span className={styles.navBtn} style={{display:"inline-block",width:20,height:20,fontSize:10}}>·</span>
                Unanswered
              </span>
            </div>
          </div>
        </aside>
      </main>

      {/* ── Submit confirmation dialog ──────────────────────── */}
      {confirmSubmit && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmModal}>
            <h2>Submit Exam?</h2>
            <p>
              You have answered <strong style={{color:"var(--accent)"}}>{answeredCount}</strong> out of{" "}
              <strong>{questions.length}</strong> questions.
            </p>
            {answeredCount < questions.length && (
              <p className={styles.confirmWarn}>
                ⚠️ {questions.length - answeredCount} question(s) still unanswered.
              </p>
            )}
            <p>This action cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button className="btn btn-outline" onClick={() => setConfirmSubmit(false)}>
                Cancel — Keep Exam
              </button>
              <button
                id="confirm-submit-btn"
                className="btn btn-danger btn-lg"
                onClick={() => handleSubmit(false)}
              >
                Yes, Submit Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
