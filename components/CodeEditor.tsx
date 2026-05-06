"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./CodeEditor.module.css";

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

interface CodeEditorProps {
  questionId: string;
  starterCode: string;
  testCases: TestCase[];
  onSubmit: (code: string, results: TestResult[], passedCount: number, totalCount: number) => void;
  isSubmitted: boolean;
  savedCode?: string;
}

type PyodideStatus = "loading" | "ready" | "error" | "running";

export default function CodeEditor({
  questionId,
  starterCode,
  testCases,
  onSubmit,
  isSubmitted,
  savedCode,
}: CodeEditorProps) {
  const [code, setCode] = useState(savedCode || starterCode || "# Write your Python solution here\n");
  const [pyStatus, setPyStatus] = useState<PyodideStatus>("loading");
  const [results, setResults] = useState<TestResult[]>([]);
  const [passedCount, setPassedCount] = useState(0);
  const [hasRun, setHasRun] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "output">("code");
  const workerRef = useRef<Worker | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Init Pyodide Web Worker
  useEffect(() => {
    if (typeof window === "undefined") return;

    const worker = new Worker("/pyodide-worker.js");
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type } = e.data;
      if (type === "ready") setPyStatus("ready");
      else if (type === "loading") setPyStatus("loading");
      else if (type === "error") setPyStatus("error");
      else if (type === "result") {
        const { results: res, passedCount: pc, totalCount } = e.data;
        setResults(res);
        setPassedCount(pc);
        setHasRun(true);
        setPyStatus("ready");
        setActiveTab("output");
        // Auto-submit to parent
        onSubmit(code, res, pc, totalCount);
      }
    };

    worker.onerror = () => setPyStatus("error");

    return () => worker.terminate();
  }, []);

  const handleRun = useCallback(() => {
    if (!workerRef.current || pyStatus !== "ready" || isSubmitted) return;
    setPyStatus("running");
    setResults([]);
    setHasRun(false);
    workerRef.current.postMessage({
      type: "run",
      code,
      testCases,
      questionId,
      timeoutMs: 10000,
    });
  }, [code, testCases, questionId, pyStatus, isSubmitted]);

  // Handle Tab key in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newCode = code.substring(0, start) + "    " + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 4;
      });
    }
  };

  const statusLabel: Record<PyodideStatus, string> = {
    loading: "⏳ Loading Python engine...",
    ready: "🟢 Python ready",
    running: "⚙️ Running tests...",
    error: "🔴 Python engine failed to load",
  };

  const allPassed = hasRun && passedCount === testCases.length;
  const somePassed = hasRun && passedCount > 0 && passedCount < testCases.length;

  return (
    <div className={styles.container}>
      {/* Status bar */}
      <div className={styles.statusBar}>
        <span className={styles.statusLabel}>{statusLabel[pyStatus]}</span>
        {hasRun && (
          <span
            className={styles.score}
            style={{ color: allPassed ? "#10b981" : somePassed ? "#f59e0b" : "#ef4444" }}
          >
            {passedCount}/{testCases.length} test cases passed
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "code" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("code")}
        >
          📝 Code
        </button>
        <button
          className={`${styles.tab} ${activeTab === "output" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("output")}
        >
          🧪 Test Results {hasRun && `(${passedCount}/${testCases.length})`}
        </button>
      </div>

      {/* Code Editor */}
      {activeTab === "code" && (
        <div className={styles.editorWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.editor}
            value={code}
            onChange={(e) => !isSubmitted && setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitted}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            placeholder="# Write your Python solution here"
          />
        </div>
      )}

      {/* Output */}
      {activeTab === "output" && (
        <div className={styles.outputPanel}>
          {!hasRun && (
            <div className={styles.noResults}>
              Run your code to see test results here.
            </div>
          )}
          {hasRun && results.map((r, i) => (
            <div
              key={i}
              className={`${styles.resultRow} ${r.passed ? styles.resultPass : styles.resultFail}`}
            >
              <div className={styles.resultHeader}>
                <span className={styles.resultIcon}>{r.passed ? "✅" : "❌"}</span>
                <span className={styles.resultTitle}>
                  Test {i + 1}{r.description ? `: ${r.description}` : ""}
                </span>
              </div>
              {!r.input.includes("[hidden]") && (
                <div className={styles.resultDetail}>
                  <span className={styles.detailLabel}>Input:</span>
                  <code>{r.input || "(none)"}</code>
                </div>
              )}
              {!r.expected.includes("[hidden]") && (
                <div className={styles.resultDetail}>
                  <span className={styles.detailLabel}>Expected:</span>
                  <code>{r.expected}</code>
                </div>
              )}
              <div className={styles.resultDetail}>
                <span className={styles.detailLabel}>Got:</span>
                <code className={r.passed ? styles.codePass : styles.codeFail}>
                  {r.actual}
                </code>
              </div>
              {r.error && (
                <div className={styles.resultError}>⚠️ {r.error}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Run button */}
      <div className={styles.footer}>
        <button
          className={styles.runBtn}
          onClick={handleRun}
          disabled={pyStatus !== "ready" || isSubmitted}
        >
          {pyStatus === "running" ? "⚙️ Running..." : "▶ Run & Test"}
        </button>
        {isSubmitted && (
          <span className={styles.submittedLabel}>Exam submitted — code locked.</span>
        )}
      </div>
    </div>
  );
}
