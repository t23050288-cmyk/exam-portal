"use client";
import { useEffect, useState, useRef, useCallback } from "react";
export const dynamic = 'force-dynamic';
import { useRouter } from "next/navigation";
import styles from "./pyhunt.module.css";
import { getAICompletion, streamAICompletion, checkCodeAI, getAIHint } from "@/lib/ai-client";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import GoldenOrb from "@/components/GoldenOrb";
import AntiCheat from "@/components/AntiCheat";

/* ═══════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════ */
interface MCQOption { label: string; text: string; }
interface MCQQuestion {
  id: string; question: string; options: MCQOption[];
  correct: string; explanation?: string;
}
interface CodingProblem {
  title: string; description: string; starterCode: string;
  testCases: { input: string; expected: string; }[];
}
interface TurtleProblem { title: string; description: string; starterCode: string; }
interface JumbleProblem { title: string; description: string; lines: string[]; }
interface ClueConfig {
  clueText: string;     // Shown after round completes — physical location clue
  unlockCode: string;   // Student must type this code to proceed
}
interface PyHuntConfig {
  entryAccessCode: string;
  mcqQuestions: MCQQuestion[];
  jumbleProblem: JumbleProblem;
  jumbleProblemB?: JumbleProblem;
  round3: CodingProblem;
  round3b?: CodingProblem;
  round4: CodingProblem;
  round4UnlockCode: string;
  round1Clues: ClueConfig[];
  round2Clues: ClueConfig[];
  round3Clues: ClueConfig[];
  round4Clues: ClueConfig[];
  finishMessage: string;
}

/* ═══════════════════════════════════════════════
   DEFAULTS
═══════════════════════════════════════════════ */
const DEFAULT_CONFIG: PyHuntConfig = {
  entryAccessCode: "NEXUS24",
  mcqQuestions: [
    { id: "q1", question: "What is the output of print(2**3**2)?", options: [{ label: "A", text: "64" }, { label: "B", text: "512" }, { label: "C", text: "81" }, { label: "D", text: "4096" }], correct: "B", explanation: "Exponentiation is right-associative: 2**(3**2) = 2**9 = 512." },
    { id: "q2", question: "Which of these is a valid Python set?", options: [{ label: "A", text: "{1, 2, [3]}" }, { label: "B", text: "{1, 2, {3}}" }, { label: "C", text: "{1, 2, (3,)}" }, { label: "D", text: "{'a': 1}" }], correct: "C", explanation: "Sets only accept hashable (immutable) elements. Tuples are hashable; lists and sets are not." },
    { id: "q3", question: "What does 'pass' do in Python?", options: [{ label: "A", text: "Exits the function" }, { label: "B", text: "Skips the current loop iteration" }, { label: "C", text: "Does nothing; it's a null operation" }, { label: "D", text: "Clears the memory" }], correct: "C", explanation: "pass is a placeholder that does nothing." },
    { id: "q4", question: "What is the result of 'abc' * 2?", options: [{ label: "A", text: "abcabc" }, { label: "B", text: "abc2" }, { label: "C", text: "Error" }, { label: "D", text: "aabbcc" }], correct: "A", explanation: "String multiplication repeats the string." },
    { id: "q5", question: "Which operator is used for floor division?", options: [{ label: "A", text: "/" }, { label: "B", text: "//" }, { label: "C", text: "%" }, { label: "D", text: "**" }], correct: "B", explanation: "// is the floor division operator." },
  ],
  jumbleProblem: { title: "Fibonacci Logic (Part 1)", description: "Reorder the lines to correctly implement a recursive Fibonacci function that prints the 7th number (13).", lines: ["def fib(n):", "    if n <= 1:", "        return n", "    return fib(n-1) + fib(n-2)", "", "print(fib(7))"] },
  jumbleProblemB: { title: "Factorial Logic (Part 2)", description: "Reorder the lines to correctly implement a recursive Factorial function that prints 5! (120).", lines: ["def fact(n):", "    if n <= 1:", "        return 1", "    return n * fact(n-1)", "", "print(fact(5))"] },
  round3: { title: "The Palindrome Trial (Part 1)", description: "Write a function `is_palindrome(s)` that returns True if a string is a palindrome, ignoring case.", starterCode: "def is_palindrome(s: str) -> bool:\n    # Your code here\n    pass\n", testCases: [{ input: "Racecar", expected: "True" }, { input: "Python", expected: "False" }] },
  round3b: { title: "Vowel Counter (Part 2)", description: "Write a function `count_vowels(s)` that returns the number of vowels (a, e, i, o, u) in a string.", starterCode: "def count_vowels(s: str) -> int:\n    # Your code here\n    pass\n", testCases: [{ input: "Hello World", expected: "3" }] },
  round4: { title: "Factorial Mastery (Round 4)", description: "Write a recursive function `factorial(n)`.", starterCode: "def factorial(n: int) -> int:\n    # Your code here\n    pass\n", testCases: [{ input: "5", expected: "120" }] },
  round4UnlockCode: "FINISH",
  round1Clues: [{ clueText: "🗝️ Round 1 Complete! Go to Library.", unlockCode: "LIBRARY" }],
  round2Clues: [{ clueText: "🗝️ Round 2 Complete! Go to Lab 2.", unlockCode: "LAB2" }],
  round3Clues: [{ clueText: "🗝️ Round 3 Complete! Go to Locker 301.", unlockCode: "LOCKER" }],
  round4Clues: [{ clueText: "🗝️ Round 4 Complete! Go to Main Entrance.", unlockCode: "FINISH" }],
  finishMessage: "Congratulations! You have completed the ultimate Python trial.",
};

/* ═══════════════════════════════════════════════
   CONFIG LOADER
═══════════════════════════════════════════════ */
// Always use relative path to avoid CORS — Vercel routes /api/* to Python backend

function parseCfg(parsed: any): PyHuntConfig {
  return {
    mcqQuestions: parsed.mcqQuestions || DEFAULT_CONFIG.mcqQuestions,
    jumbleProblem: parsed.jumbleProblem || DEFAULT_CONFIG.jumbleProblem,
    jumbleProblemB: parsed.jumbleProblemB || DEFAULT_CONFIG.jumbleProblemB,
    round3: parsed.round3 || DEFAULT_CONFIG.round3,
    round3b: parsed.round3b || DEFAULT_CONFIG.round3b,
    round4: parsed.round4 || DEFAULT_CONFIG.round4,
    round4UnlockCode: parsed.round4UnlockCode || DEFAULT_CONFIG.round4UnlockCode,
    round1Clues: parsed.round1Clues || DEFAULT_CONFIG.round1Clues,
    round2Clues: parsed.round2Clues || DEFAULT_CONFIG.round2Clues,
    round3Clues: parsed.round3Clues || DEFAULT_CONFIG.round3Clues,
    round4Clues: parsed.round4Clues || DEFAULT_CONFIG.round4Clues,
    entryAccessCode: parsed.entryAccessCode || DEFAULT_CONFIG.entryAccessCode,
    finishMessage: parsed.finishMessage || DEFAULT_CONFIG.finishMessage,
  };
}

async function loadPyHuntConfigAsync(): Promise<PyHuntConfig> {
  // ── Route through backend (bypasses Supabase RLS) ──
  // Always fetch fresh from backend — never trust stale localStorage
  try {
    const res = await fetch(`/api/admin/pyhunt/config?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
    });
    if (res.ok) {
      const json = await res.json();
      if (json.ok && json.config) {
        // Update cache with fresh server data
        if (typeof window !== "undefined") {
          localStorage.setItem("nexus_pyhunt_config_v2", JSON.stringify(json.config));
        }
        return parseCfg(json.config);
      }
    }
  } catch (e) {
    console.warn("[PyHunt] Backend config fetch failed, trying localStorage:", e);
  }

  // Network failed — return DEFAULT_CONFIG (don't use stale localStorage)
  return DEFAULT_CONFIG;
}

/* ═══════════════════════════════════════════════
   PYODIDE HOOK
═══════════════════════════════════════════════ */
function usePyodide() {
  const workerRef = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cbRef = useRef<Map<string,(r:any)=>void>>(new Map());

  useEffect(() => {
    let w: Worker;
    try {
      w = new Worker("/pyodide-worker.js");
      workerRef.current = w;
      w.onmessage = (e) => {
        const { id, type } = e.data;
        if (type === "ready") { setReady(true); return; }
        if (type === "error") { setLoadError(e.data.message); return; }
        const cb = cbRef.current.get(id);
        if (cb) { cb(e.data); cbRef.current.delete(id); }
      };
      w.onerror = (err) => setLoadError("Worker crashed: " + err.message);
    } catch (e: any) { setLoadError(String(e)); }
    return () => { try { w?.terminate(); } catch {} };
  }, []);

  const runCode = useCallback((code: string, stdin = ""): Promise<{stdout:string;stderr:string;error?:string}> => {
    return new Promise((resolve) => {
      if (!workerRef.current) { resolve({stdout:"",stderr:"Worker not ready"}); return; }
      const id = Math.random().toString(36).slice(2);
      const timeout = setTimeout(() => {
        cbRef.current.delete(id);
        resolve({stdout:"",stderr:"",error:"Timeout (15s)"});
      }, 15000);
      cbRef.current.set(id, (data) => {
        clearTimeout(timeout);
        resolve({ stdout: data.stdout || data.output || "", stderr: data.stderr || "", error: data.error });
      });
      workerRef.current.postMessage({ type:"run", id, code, stdin });
    });
  }, []);

  const runTests = useCallback((code:string, testCases:{input:string;expected:string}[]): Promise<{results:{pass:boolean;got:string;expected:string}[];allPass:boolean}> => {
    return new Promise((resolve) => {
      if (!workerRef.current) { resolve({results:[],allPass:false}); return; }
      const id = Math.random().toString(36).slice(2);
      const timeout = setTimeout(() => {
        cbRef.current.delete(id);
        resolve({results:[],allPass:false});
      }, 25000);
      cbRef.current.set(id, (data) => {
        clearTimeout(timeout);
        // Worker v4 returns: { results:[{pass,got,expected}], allPass }
        const results = (data.results || []).map((r:any, i:number) => ({
          pass: r.pass === true,
          got: (r.got || r.stdout || r.output || "").trim(),
          expected: (r.expected || testCases[i]?.expected || "").trim(),
        }));
        const allPass = data.allPass === true || (results.length > 0 && results.every((r:any) => r.pass));
        resolve({ results, allPass });
      });
      workerRef.current.postMessage({ type:"testCases", id, code, testCases });
    });
  }, []);

  return { ready, loadError, runCode, runTests };
}

/* ═══════════════════════════════════════════════
   ENTRY GATE
   Requires entryAccessCode to begin Round 1
═══════════════════════════════════════════════ */
function EntryGate({ correctCode, onUnlock }: { correctCode: string; onUnlock: () => void }) {
  const [input, setInput] = useState("");
  const [shaking, setShaking] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = () => {
    if (input.trim().toUpperCase() === (correctCode || "").toUpperCase()) {
      onUnlock();
    } else {
      setShaking(true);
      setError(true);
      setTimeout(() => { setShaking(false); setError(false); }, 600);
    }
  };

  return (
    <div className={styles.clueScreen}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${styles.clueCard} ${shaking ? styles.shake : ""}`}
      >
        <div className={styles.clueEmoji}>🐍</div>
        <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Initialize Hunt</h2>
        <p style={{ color: "rgba(255,255,255,0.6)", marginBottom: 24 }}>Enter the competition access code to begin the trial.</p>
        
        <input
          className={`${styles.clueCodeInput} ${error ? styles.clueInputError : ""}`}
          type="text"
          placeholder="ENTER ACCESS CODE…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          autoFocus
          autoComplete="off"
        />
        <button className={styles.primaryBtn} onClick={handleSubmit} style={{ width: "100%", marginTop: 12 }}>
          🔓 START COMPETITION
        </button>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CLUE UNLOCK SCREEN
═══════════════════════════════════════════════ */
function ClueScreen({ clue, onUnlock }: { clue: ClueConfig; onUnlock: () => void }) {
  const [input, setInput] = useState("");
  const [shaking, setShaking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [attempts, setAttempts] = useState(0);

  // If no unlock code needed (last round), auto-show unlock button
  if (!clue || !clue.unlockCode) {
    return (
      <div className={styles.clueScreen}>
        <div className={styles.clueCard}>
          <div className={styles.clueEmoji}>🎉</div>
          <div className={styles.clueText}>{clue?.clueText || "Hunt Over! Proceed to final results."}</div>
          <button className={styles.primaryBtn} onClick={onUnlock}>Continue →</button>
        </div>
      </div>
    );
  }

  const MAX_CODE_ATTEMPTS = 4;
  const handleSubmit = () => {
    if (input.trim().toUpperCase() === clue.unlockCode.toUpperCase()) {
      setUnlocked(true);
      setTimeout(onUnlock, 1200);
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
      if (next >= MAX_CODE_ATTEMPTS) {
        // Auto-submit after max wrong code attempts
        setTimeout(() => onUnlock(), 1500);
      }
    }
  };

  return (
    <div className={styles.clueScreen}>
      <div className={`${styles.clueCard} ${shaking ? styles.shake : ""}`}>
        <div className={styles.clueTrophyRow}>
          <span className={styles.clueTrophy}>🗝️</span>
          <span className={styles.clueRoundBadge}>CLUE UNLOCKED</span>
        </div>
        <div className={styles.clueText}>{clue.clueText}</div>

        {!unlocked ? (
          <div className={styles.clueCodeSection}>
            <div className={styles.clueCodeLabel}>
              Found the code? Enter it below to unlock the next round
            </div>
            <input
              className={`${styles.clueCodeInput} ${attempts > 0 ? styles.clueInputError : ""}`}
              type="text"
              placeholder="Enter unlock code…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              autoFocus
              autoComplete="off"
            />
            {attempts > 0 && (
              <div className={styles.clueWrongMsg}>
                {attempts >= 4
                  ? "🚫 Too many wrong attempts! Moving to next round automatically..."
                  : `❌ Wrong code — ${4 - attempts} attempt${4 - attempts !== 1 ? "s" : ""} remaining`
                }
              </div>
            )}
            <button className={styles.primaryBtn} onClick={handleSubmit}>
              🔓 Unlock Next Round
            </button>
          </div>
        ) : (
          <div className={styles.clueUnlockedMsg}>
            ✅ Code accepted! Loading next round…
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROUND 1 — MCQ
═══════════════════════════════════════════════ */
function RoundMCQ({ questions, onComplete, onWrong, isFinal = false }: { questions: MCQQuestion[]; onComplete: (score?: string) => void; onWrong: () => void; isFinal?: boolean }) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string|null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = questions[idx];

  const handleCheck = () => { if (selected) setChecked(true); };
  const handleNext = () => {
    const correct = selected === q.correct;
    if (correct) setScore(s => s+1);
    else onWrong();
    if (idx+1 < questions.length) { setIdx(i=>i+1); setSelected(null); setChecked(false); }
    else setDone(true);
  };

  if (done) return (
    <div className={styles.roundDone}>
      <div className={styles.doneIcon}>✅</div>
      <h2>{isFinal ? "Final Round Complete!" : "Round 1 Complete!"}</h2>
      <p className={styles.scoreText}>You scored <strong>{score}/{questions.length}</strong></p>
      <button className={styles.primaryBtn} onClick={() => onComplete(`${score}/${questions.length}`)}>
        {isFinal ? "Finish PyHunt →" : "Get Clue →"}
      </button>
    </div>
  );

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>{isFinal ? "Final Round" : "Round 1"} · MCQ</span>
        <span className={styles.questionCount}>Q {idx+1} / {questions.length}</span>
      </div>
      <div className={styles.questionCard}>
        <div className={styles.questionText}>{q.question}</div>
        <div className={styles.optionsList}>
          {q.options.map(opt => {
            let cls = styles.option;
            if (checked) {
              if (opt.label === q.correct) cls = `${styles.option} ${styles.optionCorrect}`;
              else if (opt.label === selected) cls = `${styles.option} ${styles.optionWrong}`;
            } else if (opt.label === selected) cls = `${styles.option} ${styles.optionSelected}`;
            return (
              <button key={opt.label} className={cls} onClick={() => !checked && setSelected(opt.label)} disabled={checked}>
                <span className={styles.optionLabel}>{opt.label}</span>
                {opt.text}
              </button>
            );
          })}
        </div>
        {checked && q.explanation && <div className={styles.explanation}>💡 {q.explanation}</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          {!checked
            ? <button className={styles.primaryBtn} onClick={handleCheck} disabled={!selected}>Check Answer</button>
            : <button className={styles.primaryBtn} onClick={handleNext}>{idx+1<questions.length? "Next →" : (isFinal ? "Finish Round 5 →" : "Finish Round 1 →")}</button>
          }
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROUND 2 — CODE JUMBLE
═══════════════════════════════════════════════ */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}



/* ═══════════════════════════════════════════════
   ROUND 3 & 4 — CODING
═══════════════════════════════════════════════ */
function RoundCoding({ problem, roundNum, partLabel = "", onComplete, onWrong, showNextPartOnPass = false }: { problem: CodingProblem; roundNum: number; partLabel?: string; onComplete: () => void; onWrong: () => void; showNextPartOnPass?: boolean }) {
  const { ready, loadError, runCode, runTests } = usePyodide();
  const [code, setCode] = useState(problem.starterCode);
  const [running, setRunning] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [output, setOutput] = useState<{stdout:string;stderr:string;error?:string}|null>(null);
  const [testResults, setTestResults] = useState<{pass:boolean;got:string;expected:string}[]>([]);
  const [allPass, setAllPass] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string|null>(null);
  const [aiHint, setAiHint] = useState<string|null>(null);
  const [aiReasoning, setAiReasoning] = useState<string|null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);

  const handleRun = async () => {
    if (running || cooldown > 0) return;
    setRunning(true); setOutput(null); setTestResults([]); setAiFeedback(null); setAiHint(null);
    setCooldown(10); // HCOL Cooldown
    try {
      const examToken = sessionStorage.getItem("exam_token") || "";
      
      // 1. Call Professional Grade Execution Engine (Plan A: Piston)
      const resp = await fetch("/api/exam/pyhunt/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${examToken}`
        },
        body: JSON.stringify({
          code,
          test_cases: problem.testCases
        })
      });

      const data = await resp.json();
      
      if (data.ok) {
        setTestResults(data.results || []);
        setAllPass(data.all_pass);
        
        // Final result based on all test cases
        if (data.all_pass) {
          setAiFeedback("🎯 LOGIC VERIFIED: Professional engine confirmed your solution is 100% correct.");
        } else {
          onWrong();
          // Get AI hint for why it failed
          const firstFail = (data.results || []).find((r: any) => !r.pass);
          try {
            const hintRes = await getAIHint({
              problem_title: problem.title,
              code,
              error: firstFail?.got || "Unknown logic error"
            });
            setAiHint(hintRes.hint);
          } catch {}
        }
      } else {
        throw new Error(data.detail || "Execution failed");
      }
    } catch (err) {
      console.error("Execution Error:", err);
      setAiFeedback("⚠ Execution Engine Error. Please check your internet connection.");
    } finally { setRunning(false); }
  };

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round {roundNum} · Coding{partLabel ? ` · ${partLabel}` : ""}</span>
        {loadError && <span className={styles.errorTag}>⚠ Pyodide: {loadError}</span>}
        {!loadError && !ready && <span className={styles.loadingTag}>⟳ Loading Python…</span>}
        {!loadError && ready && <span className={styles.readyTag}>✓ Python Ready</span>}
      </div>
      <div className={styles.codingLayout}>
        <div className={styles.problemPane}>
          <div className={styles.problemTitle}>{problem.title}</div>
          <div className={styles.problemDesc}>{problem.description}</div>
          <div className={styles.testCasesList}>
            <div className={styles.tcHeader}>Verification Protocol (Test Cases)</div>
            <div className={styles.tcGrid}>
              {problem.testCases.map((tc, i) => {
                const res = testResults[i];
                return (
                  <div key={i} className={`${styles.tcCard} ${res ? (res.pass ? styles.tcCardPass : styles.tcCardFail) : ""}`}>
                    <div className={styles.tcCardHeader}>
                      <span>Test Case {i + 1}</span>
                      {res && (res.pass ? <span className={styles.passChip}>PASS</span> : <span className={styles.failChip}>FAIL</span>)}
                    </div>
                    <div className={styles.tcCardBody}>
                      <div className={styles.tcField}>
                        <span className={styles.tcLabel}>Input:</span>
                        <code>{tc.input}</code>
                      </div>
                      <div className={styles.tcField}>
                        <span className={styles.tcLabel}>Expected:</span>
                        <code>{tc.expected}</code>
                      </div>
                      {res && !res.pass && (
                        <div className={styles.tcField}>
                          <span className={styles.tcLabel}>Got:</span>
                          <code className={styles.codeFail}>{res.got || "(empty)"}</code>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className={styles.editorPane}>
          <textarea
            className={styles.codeEditor}
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
          />
          <button className={styles.runBtn} onClick={handleRun} disabled={!ready||running||cooldown>0}>
            {running ? "⟳ Processing..." : (cooldown > 0 ? `COOLDOWN: ${cooldown}s` : "EXECUTE LOGIC PROTOCOL")}
          </button>
          {output && (
            <div className={styles.outputBox}>
              <div className={styles.outputLabel}>{output.stderr || output.error ? "SYSTEM ERROR — LOG TRACE" : "TRANSMISSION OUTPUT"}</div>
              <pre style={{color: output.stderr || output.error ? "#f87171" : "#80c8a0"}}>
                {output.stderr || output.error || output.stdout || "(no output)"}
              </pre>
            </div>
          )}
          {testResults.length > 0 && (
            <div className={styles.testResults}>
              {testResults.map((r,i) => (
                <div key={i} className={`${styles.tcResult} ${r.pass?styles.tcPass:styles.tcFail}`}>
                  {r.pass?"✓":"✗"} Test {i+1}: got <code>"{r.got.trim()}"</code> — expected <code>"{r.expected}"</code>
                </div>
              ))}
            </div>
          )}
          {aiLoading && <div className={styles.aiLoading}>🤖 Groq is reviewing your code…</div>}
          
          {aiReasoning && (
            <div className={styles.aiReasoningBox}>
              <button 
                className={styles.reasoningToggle} 
                onClick={() => setShowReasoning(!showReasoning)}
              >
                {showReasoning ? "▼ Hide AI Thought Process" : "▶ Show AI Thought Process"}
              </button>
              <AnimatePresence>
                {showReasoning && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className={styles.reasoningContent}
                  >
                    <div className={styles.reasoningLabel}>AI Reasoning:</div>
                    <div className={styles.reasoningText}>{aiReasoning}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {aiFeedback && <div className={styles.aiFeedback}>🤖 <strong>AI Feedback:</strong> {aiFeedback}</div>}
          {aiHint && <div className={styles.aiHint}><span className={styles.aiHintLabel}>💡 Hint: </span>{aiHint}</div>}
          {allPass && (
            <div className={styles.roundDone} style={{marginTop:12}}>
              <div className={styles.doneIcon}>🎉</div>
              <p>All tests passed! {partLabel ? `${partLabel} complete!` : ""}</p>
              <button className={styles.primaryBtn} onClick={onComplete}>
                {showNextPartOnPass ? "Next Part →" : "Get Clue →"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   ROUND 2 — DUAL CODE JUMBLE  (Part A + Part B, with compiler on right)
═══════════════════════════════════════════════ */
function JumblePart({
  problem,
  partLabel,
  partIndex,
  runCode,
  ready,
  onPartComplete,
  onWrong,
}: {
  problem: JumbleProblem;
  partLabel: string;
  partIndex: number;
  runCode: (code: string) => Promise<{ stdout: string; stderr: string; error?: string }>;
  ready: boolean;
  onPartComplete: () => void;
  onWrong: () => void;
}) {
  const correct = problem.lines;
  const [lines, setLines] = useState<string[]>(() => shuffle(correct));
  const [dragging, setDragging] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [runOutput, setRunOutput] = useState<{ stdout: string; stderr: string; error?: string } | null>(null);
  const [running, setRunning] = useState(false);

  const handleDragStart = (i: number) => setDragging(i);
  const handleDrop = (i: number) => {
    if (dragging === null || dragging === i) return;
    const next = [...lines];
    [next[dragging], next[i]] = [next[i], next[dragging]];
    setLines(next);
    setDragging(null);
  };

  const handleRun = async () => {
    if (!ready || running) return;
    setRunning(true);
    setRunOutput(null);
    const code = lines.join("\n");
    const result = await runCode(code);
    setRunOutput(result);
    setRunning(false);
  };

  const handleSubmit = () => {
    const ok = lines.join("\n") === correct.join("\n");
    setSubmitted(true);
    setIsCorrect(ok);
    if (!ok) { setAttempts(a => a + 1); onWrong(); }
  };
  const handleRetry = () => { setSubmitted(false); setIsCorrect(false); setLines(shuffle(correct)); setRunOutput(null); };

  if (submitted && isCorrect) return (
    <div className={styles.roundDone}>
      <div className={styles.doneIcon}>🔀</div>
      <h2>{partLabel} Complete!</h2>
      <p className={styles.scoreText}>You unscrambled the code correctly!</p>
      <button className={styles.primaryBtn} onClick={onPartComplete}>
        {partIndex === 0 ? "Next Part →" : "Get Clue →"}
      </button>
    </div>
  );

  return (
      <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round 2 · Code Jumble · {partLabel}</span>
        {!ready && <span className={styles.loadingTag}>⟳ Loading Python…</span>}
        {ready && <span className={styles.readyTag}>✓ Python Ready</span>}
      </div>
      <div className={styles.problemTitle}>{problem.title}</div>
      <div className={styles.problemDesc}>{problem.description}</div>

      {/* Side-by-side: jumble board + compiler */}
      <div className={styles.jumbleCompilerLayout}>
        {/* LEFT — drag-drop jumble */}
        <div className={styles.jumbleSide}>
          <div className={styles.tcHeader} style={{ marginBottom: 8 }}>🔀 Arrange the lines</div>
          <div className={styles.jumbleBoard}>
            {lines.map((line, i) => (
              <div
                key={i}
                className={`${styles.jumbleLine} ${dragging === i ? styles.jumbleDragging : ""}`}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(i)}
              >
                <span className={styles.lineNum}>{i + 1}</span>
                <code>{line || "\u200b"}</code>
                <span className={styles.dragHandle}>⠿</span>
              </div>
            ))}
          </div>
          {submitted && !isCorrect && (
            <div className={styles.wrongMsg}>❌ Not quite — the logic isn't right yet. Try reordering!</div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
            {submitted && !isCorrect && <button className={styles.secondaryBtn} onClick={handleRetry}>🔄 Reset</button>}
            <button className={styles.primaryBtn} onClick={submitted && !isCorrect ? handleRetry : handleSubmit}>
              {submitted && !isCorrect ? "Try Again" : "✓ Submit Order"}
            </button>
          </div>
        </div>

        {/* RIGHT — compiler */}
        <div className={styles.compilerSide}>
          <div className={styles.tcHeader} style={{ marginBottom: 8 }}>▶ Test Your Arrangement</div>
          <div className={styles.editorPane} style={{ height: "100%" }}>
            <textarea
              className={styles.codeEditor}
              value={lines.join("\n")}
              readOnly
              style={{ opacity: 0.85, cursor: "not-allowed", minHeight: 160 }}
              spellCheck={false}
            />
            <button className={styles.runBtn} onClick={handleRun} disabled={!ready || running}>
              {running ? "⟳ Running…" : "▶ Run Code"}
            </button>
            {runOutput && (
              <div className={styles.outputBox}>
                <div className={styles.outputLabel}>
                  {runOutput.stderr || runOutput.error ? "❌ Error Output" : "✅ Output"}
                </div>
                <pre style={{ color: runOutput.stderr || runOutput.error ? "#f87171" : "#80c8a0" }}>
                  {runOutput.stderr || runOutput.error || runOutput.stdout || "(no output)"}
                </pre>
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
              💡 Run your arrangement to see if the output looks correct before submitting!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoundJumble({ problem, onComplete, onWrong }: { problem: JumbleProblem; onComplete: () => void; onWrong: () => void }) {
  const { ready, runCode } = usePyodide();
  return (
    <JumblePart
      problem={problem}
      partLabel="Trial"
      partIndex={1}
      runCode={runCode}
      ready={ready}
      onPartComplete={onComplete}
      onWrong={onWrong}
    />
  );
}

function RoundJumbleDual({
  problemA,
  problemB,
  onComplete,
  onWrong,
}: {
  problemA: JumbleProblem;
  problemB: JumbleProblem;
  onComplete: () => void;
  onWrong: () => void;
}) {
  const { ready, runCode } = usePyodide();
  const [part, setPart] = useState<0 | 1>(0);

  return part === 0 ? (
    <JumblePart
      key="part1"
      problem={problemA}
      partLabel="Part 1"
      partIndex={0}
      runCode={runCode}
      ready={ready}
      onPartComplete={() => setPart(1)}
      onWrong={onWrong}
    />
  ) : (
    <JumblePart
      key="part2"
      problem={problemB}
      partLabel="Part 2"
      partIndex={1}
      runCode={runCode}
      ready={ready}
      onPartComplete={onComplete}
      onWrong={onWrong}
    />
  );
}

/* ═══════════════════════════════════════════════
   ROUND 3 — DUAL CODING  (Part A + Part B)
═══════════════════════════════════════════════ */
function RoundCodingDual({
  problemA,
  problemB,
  roundNum,
  onComplete,
  onWrong,
}: {
  problemA: CodingProblem;
  problemB: CodingProblem;
  roundNum: number;
  onComplete: () => void;
  onWrong: () => void;
}) {
  const [part, setPart] = useState<0 | 1>(0);

  return part === 0 ? (
    <RoundCoding
      key="part1"
      problem={problemA}
      roundNum={roundNum}
      partLabel="Part 1"
      onComplete={() => setPart(1)}
      onWrong={onWrong}
      showNextPartOnPass
    />
  ) : (
    <RoundCoding
      key="part2"
      problem={problemB}
      roundNum={roundNum}
      partLabel="Part 2"
      onComplete={onComplete}
      onWrong={onWrong}
      showNextPartOnPass={false}
    />
  );
}

/* ═══════════════════════════════════════════════
   FINISH SCREEN
═══════════════════════════════════════════════ */
function FinishScreen({ message, stats, timerSeconds, terminated, studentName }: { message: string; stats: { minutes: number; wrongs: number; warnings: number; round1Score?: string; round1Time?: string }; timerSeconds: number; terminated?: boolean; studentName: string }) {
  const router = useRouter();

  if (terminated) {
    return (
      <div className={styles.finishScreen} style={{ border: "2px solid #ef4444", background: "rgba(239, 68, 68, 0.05)", boxShadow: "0 0 40px rgba(239, 68, 68, 0.2)" }}>
        <div className={styles.finishEmoji}>⛔</div>
        <div className={styles.finishTitle} style={{ color: "#ef4444", textShadow: "0 0 20px rgba(239, 68, 68, 0.5)" }}>SESSION TERMINATED</div>
        <div style={{ color: "#fff", fontSize: "1.2rem", fontWeight: 800, marginBottom: 12, opacity: 0.9 }}>{studentName.toUpperCase()}</div>
        <p style={{ color: "#fca5a5", fontWeight: 600, maxWidth: 500, margin: "0 auto" }}>Your PyHunt session was automatically terminated due to excessive security violations. Please contact your facilitator.</p>
        <button className={styles.primaryBtn} onClick={() => router.replace("/dashboard")} style={{ marginTop: 32, background: "linear-gradient(135deg, #ef4444, #991b1b)" }}>← RETURN TO DASHBOARD</button>
      </div>
    );
  }

  return (
    <div className={styles.finishScreen}>
      <div className={styles.finishEmoji}>🏆</div>
      <div className={styles.finishTitle}>PYHUNT COMPLETE!</div>
      <div style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 900, marginBottom: 8, letterSpacing: "-0.01em" }}>
        BRAVO, {studentName.toUpperCase()}!
      </div>
      <p style={{ color: "#28D7D6", fontSize: 16, fontWeight: 700, marginBottom: 12, opacity: 0.8 }}>{message}</p>
      <div style={{ background: "rgba(40, 215, 214, 0.1)", border: "1px solid rgba(40, 215, 214, 0.3)", padding: "12px 24px", borderRadius: "12px", color: "#28D7D6", fontWeight: 800, fontSize: "14px", marginBottom: 32, display: "inline-block" }}>
        🎉 CONGRATULATIONS ON COMPLETING 4TH ROUND! NOW PROCEED TO 5TH ROUND (OFFLINE).
      </div>

      <div className={styles.statsCard} style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className={styles.statItem} style={{ border: "1px solid rgba(251, 191, 36, 0.2)", background: "rgba(251, 191, 36, 0.03)" }}>
          <div className={styles.statValue} style={{ color: "#fbbf24" }}>{stats.round1Score || "0/0"}</div>
          <div className={styles.statLabel}>Round 1 MCQ Score</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{stats.round1Time || "0s"}</div>
          <div className={styles.statLabel}>MCQ Completion Time</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{stats.minutes}m</div>
          <div className={styles.statLabel}>Total Time (4 Rounds)</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{stats.wrongs}</div>
          <div className={styles.statLabel}>Wrong Attempts</div>
        </div>
      </div>

      <div style={{ marginTop: 40, width: "100%", maxWidth: 600, textAlign: "left", background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: "20px 24px" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 800, letterSpacing: 1, marginBottom: 12, textTransform: "uppercase" }}>Participant Details</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Student Name:</span>
          <span style={{ color: "#fff", fontWeight: 700 }}>{studentName}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Security Warnings:</span>
          <span style={{ color: stats.warnings > 0 ? "#f87171" : "#10b981", fontWeight: 900 }}>{stats.warnings} / 3</span>
        </div>
      </div>

      <div style={{ marginTop: 40, display: "flex", gap: 12, width: "100%", maxWidth: 600 }}>
        <button className={styles.secondaryBtn} onClick={() => router.replace("/dashboard?tab=History")} style={{ flex: 1 }}>← GO TO HISTORY</button>
        <button className={styles.primaryBtn} onClick={() => window.print()} style={{ flex: 1 }}>PRINT CERTIFICATE</button>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: 1, fontWeight: 700 }}>
        NEXUS SECURE · VERIFIED COMPLETION · {new Date().toLocaleDateString()}
      </div>
      
      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.4 }}>
        Redirecting to history in {timerSeconds}s...
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PROGRESS BAR  (4 rounds only — Round 5 is offline)
═══════════════════════════════════════════════ */
function ProgressBar({ round, showingClue }: { round: number; showingClue: boolean }) {
  const ROUNDS = ["MCQ 1", "Jumble", "Coding 1", "Coding 2"];
  const filled = showingClue ? round + 1 : round;
  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressLine}>
        <div className={styles.progressLineFill} style={{ width: `${(filled / 4) * 100}%` }} />
      </div>
      {ROUNDS.map((label, i) => {
        const isActive = i === round && !showingClue;
        const isDone = i < filled;
        return (
          <div
            key={i}
            title={label}
            className={`${styles.progressDot} ${isDone ? styles.progressDone : ""} ${isActive ? styles.progressActive : ""}`}
          >
            {isActive ? (
              <div style={{ width: "100%", height: "100%", transform: "scale(1.2)" }}>
                <GoldenOrb />
              </div>
            ) : (
              isDone ? "✓" : i + 1
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════ */

/* ══ PyHunt 3D Loading Orb ══ */
function PyHuntOrb({ size = 120, label = "Initialising PyHunt…", sublabel = "" }: { size?: number; label?: string; sublabel?: string }) {
  const s = size;
  return (
    <>
      <style>{`
        @keyframes ph-spin { from { transform:rotateY(0deg) rotateZ(15deg); } to { transform:rotateY(360deg) rotateZ(15deg); } }
        @keyframes ph-ring-a { 0% { transform:rotateX(80deg) rotateZ(0deg); } 100% { transform:rotateX(80deg) rotateZ(360deg); } }
        @keyframes ph-ring-b { 0% { transform:rotateX(20deg) rotateZ(0deg); } 100% { transform:rotateX(20deg) rotateZ(-360deg); } }
        @keyframes ph-ring-c { 0% { transform:rotateX(50deg) rotateZ(0deg); } 100% { transform:rotateX(50deg) rotateZ(360deg); } }
        @keyframes ph-pulse { 0%,100% { opacity:0.5; transform:scale(1); } 50% { opacity:1; transform:scale(1.15); } }
        @keyframes ph-float { 0%,100% { transform:translateY(0px); } 50% { transform:translateY(-9px); } }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, userSelect: "none" }}>
        <div style={{ animation: "ph-float 3s ease-in-out infinite", position: "relative", width: s * 1.8, height: s * 1.8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", width: s * 1.7, height: s * 1.7, borderRadius: "50%", background: "radial-gradient(circle, rgba(100,60,255,0.22) 0%, rgba(60,0,160,0.1) 45%, transparent 70%)", animation: "ph-pulse 2.4s ease-in-out infinite", pointerEvents: "none" }} />
          <div style={{ position: "absolute", width: s * 1.65, height: s * 1.65, borderRadius: "50%", border: "1.5px solid rgba(140,80,255,0.35)", animation: "ph-ring-a 4s linear infinite", transformStyle: "preserve-3d" as React.CSSProperties["transformStyle"] }} />
          <div style={{ position: "absolute", width: s * 1.35, height: s * 1.35, borderRadius: "50%", border: "1px solid rgba(80,160,255,0.3)", animation: "ph-ring-b 6s linear infinite", transformStyle: "preserve-3d" as React.CSSProperties["transformStyle"] }} />
          <div style={{ position: "absolute", width: s * 1.1, height: s * 1.1, borderRadius: "50%", border: "1px dashed rgba(200,100,255,0.2)", animation: "ph-ring-c 9s linear infinite", transformStyle: "preserve-3d" as React.CSSProperties["transformStyle"] }} />
          <div style={{ position: "relative", width: s, height: s, borderRadius: "50%", perspective: s * 3, perspectiveOrigin: "50% 50%" }}>
            <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, rgba(180,100,255,0.9) 0%, rgba(80,40,200,0.85) 30%, rgba(20,10,80,0.95) 65%, rgba(40,20,120,1) 100%)", animation: "ph-spin 5s linear infinite", willChange: "transform", boxShadow: `0 0 ${s * 0.3}px rgba(120,60,255,0.6), 0 0 ${s * 0.6}px rgba(80,40,200,0.25), inset 0 0 ${s * 0.2}px rgba(200,150,255,0.3)` }}>
              <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.55, borderRadius: "50%" }}>
                <path d="M30 70 Q20 50 35 35 Q50 20 65 35 Q80 50 65 65 Q50 80 35 65" fill="none" stroke="rgba(255,220,100,0.7)" strokeWidth="5" strokeLinecap="round" />
                <circle cx="30" cy="70" r="6" fill="rgba(255,220,80,0.8)" />
                <circle cx="28" cy="68" r="1.5" fill="#1a0a30" />
                <text x="18" y="28" fontSize="12" fill="rgba(180,220,255,0.6)" fontFamily="monospace" fontWeight="bold">&lt;/&gt;</text>
              </svg>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#c0a8ff", fontSize: 15, fontWeight: 700, letterSpacing: "0.06em", textShadow: "0 0 12px rgba(120,60,255,0.6)" }}>{label}</div>
          {sublabel && <div style={{ color: "#6040a0", fontSize: 12, marginTop: 4 }}>{sublabel}</div>}
        </div>
      </div>
    </>
  );
}

export default function PyHuntPage() {
  const router = useRouter();
  const [cfg, setCfg] = useState<PyHuntConfig>(DEFAULT_CONFIG);
  const [round, setRound] = useState(0);           // 0–4 = active round (5 rounds total)
  const [showingClue, setShowingClue] = useState(false);
  const [finished, setFinished] = useState(false);
  const [terminated, setTerminated] = useState(false);
  const [studentName, setStudentName] = useState("Student");

  // Stats tracking
  const [startTime] = useState(Date.now());
  const [totalWrongs, setTotalWrongs] = useState(0);
  const [finishStats, setFinishStats] = useState<{ minutes: number; wrongs: number; warnings: number; round1Score?: string; round1Time?: string }>({ minutes: 0, wrongs: 0, warnings: 0 });
  const [mcqStartTime, setMcqStartTime] = useState(Date.now());
  const [warningCount, setWarningCount] = useState(0);
  const [lastViolation, setLastViolation] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pyhuntLoading, setPyhuntLoading] = useState(false);
  const [resultTimerSeconds, setResultTimerSeconds] = useState(10);
  const [studentId, setStudentId] = useState("");
  const [entryUnlocked, setEntryUnlocked] = useState(false);
  const [assignedClue, setAssignedClue] = useState<ClueConfig | null>(null);
  const [clueRank, setClueRank] = useState<number | null>(null);

  const recordWrong = useCallback(() => setTotalWrongs(w => w + 1), []);

  useEffect(() => {
    setPyhuntLoading(true);
    const t = setTimeout(() => setPyhuntLoading(false), 3000);

    if (typeof window !== "undefined") {
      localStorage.removeItem("nexus_pyhunt_config_v2");
    }

    loadPyHuntConfigAsync().then(c => {
      setCfg(c);
    }).catch(e => {
      console.error("[PyHunt] Config load failed:", e);
    });

    try {
      const examStudent = sessionStorage.getItem("exam_student");
      const examStudentData = examStudent ? JSON.parse(examStudent) : {};
      const n = examStudentData.name || null;
      const sid = examStudentData.id || null;
      if (n) setStudentName(n);
      if (sid) setStudentId(sid);

      const effectiveId = sid || examStudentData.id;
      if (effectiveId) {
        supabase.from("pyhunt_progress")
          .select("warnings, current_round, status")
          .eq("student_id", effectiveId)
          .maybeSingle()
          .then(({ data }: { data: any }) => {
            if (data) {
              if (data.status === "TERMINATED") {
                setTerminated(true);
                setFinished(true);
                setPyhuntLoading(false);
                return;
              }
              setWarningCount(data.warnings || 0);
              if (data.round1_rank) {
                setClueRank(data.round1_rank);
                localStorage.setItem("pyhunt_clue_rank_cache", data.round1_rank.toString());
                setEntryUnlocked(true);
              }
              if (data.current_round && data.current_round.startsWith("Round")) {
                const r = parseInt(data.current_round.replace("Round ", ""));
                if (!isNaN(r)) {
                  const currentR = Math.min(r - 1, 3);
                  setRound(currentR);
                  if (currentR > 0) setEntryUnlocked(true);
                }
              }
            }
          });
      }
    } catch {}

    const channel = supabase
      .channel("pyhunt-realtime-config")
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_config", filter: "exam_title=eq.PYHUNT_GLOBAL_CONFIG" },
        () => {
          loadPyHuntConfigAsync().then(fresh => setCfg(fresh)).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, []);

  // Track Progress to Supabase
  useEffect(() => {
    const updateProgress = async () => {
      try {
        const examToken = sessionStorage.getItem("exam_token") || "";
        if (!examToken) return;

        const currentRound = finished ? (terminated ? `Round ${round + 1}` : "COMPLETED") : `Round ${round + 1}`;
        
        const payload = {
          current_round: currentRound,
          finished,
          terminated,
          warning_count: warningCount,
          last_violation: lastViolation || undefined,
          round1_score: finishStats.round1Score,
          round1_time: finishStats.round1Time,
          total_time: finished ? `${finishStats.minutes}m` : undefined,
        };

        const res = await fetch("/api/exam/pyhunt/sync-progress", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": `Bearer ${examToken}` 
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          console.log(`[PyHuntSync] Successfully synced: ${currentRound} (Score: ${finishStats.round1Score || "N/A"})`);
        } else {
          console.warn(`[PyHuntSync] Server returned error: ${res.status}`);
        }
      } catch (err) {
        console.error("[PyHuntSync] Network/Logic error:", err);
      }
    };
    updateProgress();
  }, [round, finished, terminated, warningCount, lastViolation, finishStats, clueRank]);

  // Fullscreen Watcher
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const enterFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    }
  }, []);

  // Auto-Redirect Timer
  useEffect(() => {
    if (!finished) return;
    const interval = setInterval(() => {
      setResultTimerSeconds(prev => {
        if (prev <= 1) { clearInterval(interval); router.replace("/dashboard?tab=History"); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [finished, router]);

  // Grace period
  const gracePeriodRef = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => { gracePeriodRef.current = false; }, 8000);
    return () => clearTimeout(t);
  }, []);

  // Round complete → show clue (rounds 0–3)
  const handleRoundComplete = useCallback(async (mcqScore?: string) => {
    if (round === 0) {
      if (mcqScore) {
        const timeMs = Date.now() - mcqStartTime;
        const m = Math.floor(timeMs / 60000);
        const s = Math.floor((timeMs % 60000) / 1000);
        setFinishStats(prev => ({
          ...prev,
          round1Score: mcqScore,
          round1Time: `${m}m ${s}s`
        }));
      }

      // ORBITAL DISTRIBUTION: Assign rank atomically
      try {
        // HCOL: Check cache first to prevent redundant DB calls
        const cached = localStorage.getItem("pyhunt_clue_rank_cache");
        if (cached) {
          setClueRank(parseInt(cached));
        } else {
          const { data: rank, error } = await supabase.rpc("get_pyhunt_round_rank", { target_student_id: studentId });
          if (!error && rank) {
            setClueRank(rank);
            localStorage.setItem("pyhunt_clue_rank_cache", rank.toString());
          }
        }
      } catch (err) {
        console.warn("Rank assignment failed:", err);
      }
    }
    setShowingClue(true);
  }, [round, mcqStartTime, studentId]);

  // Clue unlocked → next round or finish
  const handleUnlock = useCallback(() => {
    setShowingClue(false);
    if (round === 3) {
      // Round 4 complete -> Finish!
      const totalDuration = Math.floor((Date.now() - startTime) / 60000);
      setFinishStats(prev => ({
        ...prev,
        minutes: totalDuration,
        wrongs: totalWrongs,
        warnings: warningCount
      }));
      setFinished(true);
    } else {
      setRound(r => r + 1);
    }
  }, [round, startTime, totalWrongs, warningCount]);

  if (pyhuntLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.stars} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <PyHuntOrb label="Initialising PyHunt…" sublabel="Loading your Python adventure…" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.stars} />
      <div className={styles.nebula1} /><div className={styles.nebula2} />

      <AntiCheat
        sessionId={sessionStorage.getItem("exam_student") ? JSON.parse(sessionStorage.getItem("exam_student")!).id : "pyhunt"}
        authToken={sessionStorage.getItem("exam_token") || ""}
        studentId={studentId || "PYHUNT_GUEST"}
        studentName={studentName || "PyHunter"}
        isSubmitted={finished}
        extraMetadata={{ pyhunt: true }}
        onAutoSubmit={() => {
          setWarningCount(3);
          setLastViolation("TERMINATED");
          setTerminated(true);
          setFinished(true);
          const duration = Math.floor((Date.now() - startTime) / 60000);
          setFinishStats({ minutes: duration, wrongs: totalWrongs, warnings: 3 });
        }}
        onViolation={(type, meta) => {
          setLastViolation(type);
          if (meta && typeof meta.strike === "number") setWarningCount(meta.strike);
          else setWarningCount(prev => Math.min(prev + 1, 3));
        }}
        initialWarningCount={warningCount}
      >
        {finished ? (
          /* ── Finished: show congratulations if not terminated ── */
          <FinishScreen 
            message={cfg.finishMessage} 
            stats={finishStats} 
            timerSeconds={resultTimerSeconds} 
            terminated={terminated} 
            studentName={studentName} 
          />
        ) : !isFullscreen ? (
          <div className={styles.fsOverlay}>
            <div className={styles.fsCard} style={{ background: "rgba(10, 15, 30, 0.95)", border: "1px solid rgba(40, 215, 214, 0.3)", boxShadow: "0 20px 50px rgba(0,0,0,0.6)", padding: "40px", borderRadius: "24px" }}>
              <div className={styles.fsIcon} style={{ fontSize: "48px", marginBottom: "20px" }}>🛡️</div>
              <h2 style={{ fontSize: "24px", fontWeight: 900, color: "#fff", marginBottom: "12px" }}>Secure Environment Required</h2>
              <p style={{ color: "rgba(255,255,255,0.6)", marginBottom: "32px", fontSize: "15px", lineHeight: "1.5" }}>PyHunt requires mandatory full-screen mode to ensure assessment integrity.</p>
              <div style={{ display: "flex", gap: 12, width: "100%", marginTop: 12 }}>
                <button className={styles.secondaryBtn} onClick={() => router.replace("/dashboard")} style={{ flex: 1, padding: "14px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", fontWeight: 600, cursor: "pointer" }}>
                  Back to Dashboard
                </button>
                <button className={styles.primaryBtn} onClick={enterFullscreen} style={{ flex: 1, padding: "14px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #28D7D6, #0066cc)", color: "#000", fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(40, 215, 214, 0.2)" }}>
                  Enter Secure Mode
                </button>
              </div>
              <div style={{ marginTop: "24px", fontSize: "11px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em", fontWeight: 700 }}>
                VIOLATIONS ARE RECORDED IN REAL-TIME
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <header className={styles.header}>
              <div className={styles.logo}>
                <span className={styles.logoIcon}>🐍</span>
                <div>
                  <div className={styles.logoTitle}>PYHUNT</div>
                  <div className={styles.logoSub}>Python Treasure Hunt</div>
                </div>
              </div>
              <ProgressBar round={round} showingClue={showingClue} />
              <div className={styles.headerRight}>
                <div className={styles.statsBadge}>
                  <span className={styles.statLabel}>Tries:</span>
                  <span className={styles.statValue}>{totalWrongs}</span>
                </div>
                <span className={styles.studentBadge}>👤 {studentName}</span>
              </div>
            </header>

            {/* Content */}
            <main className={styles.content}>
              {/* ENTRY GATE */}
              {!entryUnlocked && round === 0 && (
                <EntryGate correctCode={cfg.entryAccessCode} onUnlock={() => setEntryUnlocked(true)} />
              )}

              {/* CLUE SCREEN (ORBITAL DISTRIBUTION FOR ROUND 1) */}
              {showingClue && (
                (() => {
                  let activeClue: ClueConfig | null = null;
                  const getDynamicClue = (clues: ClueConfig[]) => {
                    if (!clues || clues.length === 0) return null;
                    const idx = clueRank ? (clueRank - 1) % clues.length : 0;
                    return clues[idx];
                  };

                  if (round === 0) activeClue = getDynamicClue(cfg.round1Clues);
                  else if (round === 1) activeClue = getDynamicClue(cfg.round2Clues);
                  else if (round === 2) activeClue = getDynamicClue(cfg.round3Clues);
                  else if (round === 3) activeClue = getDynamicClue(cfg.round4Clues);

                  return activeClue ? <ClueScreen clue={activeClue} onUnlock={handleUnlock} /> : null;
                })()
              )}

              {/* ROUND 1 — MCQ */}
              {!showingClue && entryUnlocked && round === 0 && (
                <RoundMCQ questions={cfg.mcqQuestions} onComplete={handleRoundComplete} onWrong={recordWrong} />
              )}

              {/* ROUND 2 — DUAL JUMBLE (Part A + Part B) */}
              {!showingClue && round === 1 && (
                <RoundJumbleDual
                  problemA={cfg.jumbleProblem}
                  problemB={cfg.jumbleProblemB || cfg.jumbleProblem}
                  onComplete={handleRoundComplete}
                  onWrong={recordWrong}
                />
              )}

              {/* ROUND 3 — DUAL CODING (Part A + Part B) */}
              {!showingClue && round === 2 && (
                <RoundCodingDual
                  problemA={cfg.round3}
                  problemB={cfg.round3b || cfg.round3}
                  roundNum={3}
                  onComplete={handleRoundComplete}
                  onWrong={recordWrong}
                />
              )}

              {/* ROUND 4 — SINGLE CODING */}
              {!showingClue && round === 3 && (
                <RoundCoding
                  problem={cfg.round4}
                  roundNum={4}
                  onComplete={handleRoundComplete}
                  onWrong={recordWrong}
                />
              )}

              {/* Round 4 Complete → Final results are triggered via handleUnlock */}
            </main>
          </>
        )}
      </AntiCheat>
    </div>
  );
}
