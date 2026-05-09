"use client";

import styles from "./QuestionCard.module.css";
import React, { ReactNode, lazy, Suspense } from "react";

const CodeEditor = lazy(() => import("./CodeEditor"));

interface TestCase {
  input: string;
  expected_output: string;
  is_hidden: boolean;
  description?: string;
}

interface TestResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  description?: string | null;
  error?: string | null;
}

interface QuestionCardProps {
  question: {
    id: string;
    text: string;
    options: string[];
    marks?: number;
    image_url?: string | null;
    audio_url?: string | null;
    question_type?: "mcq" | "code";
    starter_code?: string;
    test_cases?: TestCase[];
  };
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: string | undefined;
  savedCode?: string;
  onSelect: (questionId: string, option: string) => void;
  onCodeSubmit?: (questionId: string, code: string, results: TestResult[], passedCount: number, totalCount: number) => void;
  isSubmitted: boolean;
  children?: ReactNode;
}

const OPTION_KEYS = ["A", "B", "C", "D"];


// ── Lazy-loaded audio via IntersectionObserver ─────────────────────────────
function LazyAudio({ src }: { src: string }) {
  const wrapRef  = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (!wrapRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={wrapRef} style={{ margin:"12px 0", padding:"10px 14px", background:"rgba(255,255,255,0.06)", borderRadius:10, display:"flex", alignItems:"center", gap:10 }}>
      <span style={{ fontSize:20 }}>🎧</span>
      <audio src={visible ? src : undefined} controls controlsList="nodownload"
        preload="none" style={{ flex:1, height:36 }} />
    </div>
  );
}

export default function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  selectedAnswer,
  savedCode,
  onSelect,
  onCodeSubmit,
  isSubmitted,
  children,
}: QuestionCardProps) {
  const isCode = question.question_type === "code";

  return (
    <div className={styles.card} id={`question-${questionNumber}`}>
      {/* Question header */}
      <div className={styles.header}>
        <span className={styles.numberText}>Question {questionNumber} of {totalQuestions}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isCode && (
            <span style={{
              background: "rgba(124,58,237,0.18)",
              color: "#a78bfa",
              padding: "2px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}>
              🐍 CODE
            </span>
          )}
          {question.marks !== undefined && question.marks > 0 && (
            <span className={styles.marks}>{question.marks} mark{question.marks !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Question text */}
      <p className={styles.text}>{question.text}</p>

      {/* Media asset (optional) */}
      {question.image_url && question.image_url.startsWith("http") && (
        <div className={styles.imageContainer}>
          <img
            src={question.image_url}
            alt="Question Diagram"
            className={styles.image}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      {question.audio_url && <LazyAudio src={question.audio_url} />}

      {/* ── CODE QUESTION: Pyodide Editor ── */}
      {isCode ? (
        <Suspense fallback={
          <div style={{ padding: "24px", background: "rgba(0,0,0,0.3)", borderRadius: 16, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
            ⏳ Loading code editor...
          </div>
        }>
          <CodeEditor
            questionId={question.id}
            starterCode={question.starter_code || "# Write your Python solution here\n"}
            testCases={question.test_cases || []}
            savedCode={savedCode}
            onSubmit={(code, results, passed, total) => {
              onCodeSubmit?.(question.id, code, results, passed, total);
            }}
            isSubmitted={isSubmitted}
          />
        </Suspense>
      ) : (
        /* ── MCQ QUESTION: Options ── */
        <div className={styles.options}>
          {question.options.map((option, idx) => {
            const key = OPTION_KEYS[idx];
            const isSelected = selectedAnswer === key;

            return (
              <button
                key={key}
                id={`q${questionNumber}-option-${key}`}
                type="button"
                disabled={isSubmitted}
                onClick={() => !isSubmitted && onSelect(question.id, key)}
                className={`${styles.option} ${isSelected ? styles.selected : ""}`}
                aria-pressed={isSelected}
              >
                <div className={styles.radioWrapper}>
                  {isSelected ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={styles.radioSelected}>
                      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                      <path d="M8 12.5L10.5 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={styles.radioUnselected}>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}
                </div>
                <span className={styles.optionText}>
                  {key}. {option.replace(/^[A-D]\)\s*/, "")}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Action Buttons Container (Next/Previous/Flag) */}
      {children && (
        <div className={styles.actionsContainer}>
          {children}
        </div>
      )}
    </div>
  );
}

