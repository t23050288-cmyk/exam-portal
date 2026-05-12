"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./pyhunt.module.css";
import { getAICompletion, streamAICompletion } from "@/lib/ai-client";
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
  mcqQuestions: MCQQuestion[];
  jumbleProblem: JumbleProblem;
  round3: CodingProblem;
  round4: CodingProblem;
  turtleProblem: TurtleProblem;
  clues: ClueConfig[];   // 5 entries, one per round
  finishMessage: string;
}

/* ═══════════════════════════════════════════════
   DEFAULTS
═══════════════════════════════════════════════ */
const DEFAULT_CONFIG: PyHuntConfig = {
  mcqQuestions: [
    { id:"q1", question:"What is the output of: print(type([]).__name__)?", options:[{label:"A",text:"list"},{label:"B",text:"array"},{label:"C",text:"List"},{label:"D",text:"tuple"}], correct:"A", explanation:"type([]) → <class 'list'>, .__name__ → 'list'." },
    { id:"q2", question:"Which keyword defines a generator function in Python?", options:[{label:"A",text:"return"},{label:"B",text:"async"},{label:"C",text:"yield"},{label:"D",text:"lambda"}], correct:"C", explanation:"yield makes a function a generator." },
    { id:"q3", question:"What does list(range(2, 10, 3)) produce?", options:[{label:"A",text:"[2, 5, 8]"},{label:"B",text:"[2, 4, 6, 8]"},{label:"C",text:"[3, 6, 9]"},{label:"D",text:"[2, 5, 8, 11]"}], correct:"A", explanation:"range(2,10,3) → 2, 5, 8." },
    { id:"q4", question:"What is the result of 'hello'[::-1]?", options:[{label:"A",text:"hello"},{label:"B",text:"olleh"},{label:"C",text:"Error"},{label:"D",text:"h"}], correct:"B", explanation:"[::-1] reverses the string." },
    { id:"q5", question:"Which of these creates a set in Python?", options:[{label:"A",text:"{}"},{label:"B",text:"set()"},{label:"C",text:"[]"},{label:"D",text:"()"}], correct:"B", explanation:"{} creates an empty dict. set() creates an empty set." },
  ],
  jumbleProblem: {
    title:"Fix the Fibonacci!",
    description:"The lines of a Fibonacci function have been jumbled. Drag them into the correct order so the function prints 13.",
    lines:["def fibonacci(n):","    if n <= 1:","        return n","    return fibonacci(n-1) + fibonacci(n-2)","","print(fibonacci(7))  # should print 13"],
  },
  round3: {
    title:"Palindrome Checker",
    description:"Write a function `is_palindrome(s: str) -> bool` that returns True if the string is a palindrome (case-insensitive, ignore spaces).",
    starterCode:"def is_palindrome(s: str) -> bool:\n    # Your code here\n    pass\n\nprint(is_palindrome(\"racecar\"))   # True\nprint(is_palindrome(\"Hello\"))     # False\n",
    testCases:[{input:"racecar",expected:"True"},{input:"Hello",expected:"False"},{input:"A man a plan a canal Panama",expected:"True"},{input:"abcba",expected:"True"}],
  },
  round4: {
    title:"FizzBuzz Remix",
    description:"Write a function `fizzbuzz(n: int) -> list` that returns a list of strings 1 to n. Multiples of 3 → 'Fizz', 5 → 'Buzz', both → 'FizzBuzz'.",
    starterCode:"def fizzbuzz(n: int) -> list:\n    # Your code here\n    pass\n\nresult = fizzbuzz(15)\nprint(result)\n",
    testCases:[{input:"5",expected:"['1', '2', 'Fizz', '4', 'Buzz']"},{input:"15",expected:"['1', '2', 'Fizz', '4', 'Buzz', 'Fizz', '7', '8', 'Fizz', 'Buzz', '11', 'Fizz', '13', '14', 'FizzBuzz']"}],
  },
  turtleProblem: {
    title: "Final Challenge: Sketch the Star",
    description: "Use the turtle module to recreate the star shown below. A 5-pointed star has an internal angle of 144 degrees.",
    starterCode: "import turtle\nt = turtle.Turtle()\n",
  },
  clues:[
    { clueText:"🗝️ Round 1 Complete! ROUND 1 COMPLETE", unlockCode:"LIBRARY" },
    { clueText:"🗝️ Round 2 Complete! GOOD JUB NOW FOR 3", unlockCode:"LAB2CO" },
    { clueText:"🗝️ Round 3 Complete! Proceed to Round 4.", unlockCode:"ROUND3CODE" },
    { clueText:"🗝️ Round 4 Complete! Final round awaits.", unlockCode:"ROUND4CODE" },
    { clueText:"🎉 You did it! All rounds complete. Show this screen to the facilitator!", unlockCode:"" },
  ],
  finishMessage:"🏆 Congratulations! You've conquered PyHunt! You are a true Python treasure hunter. Show this screen to your facilitator!",
};

/* ═══════════════════════════════════════════════
   CONFIG LOADER
═══════════════════════════════════════════════ */
// Always use relative path to avoid CORS — Vercel routes /api/* to Python backend

function parseCfg(parsed: any): PyHuntConfig {
  return {
    mcqQuestions: parsed.mcqQuestions || DEFAULT_CONFIG.mcqQuestions,
    jumbleProblem: parsed.jumbleProblem || DEFAULT_CONFIG.jumbleProblem,
    round3: parsed.round3 || DEFAULT_CONFIG.round3,
    round4: parsed.round4 || DEFAULT_CONFIG.round4,
    turtleProblem: parsed.turtleProblem || DEFAULT_CONFIG.turtleProblem,
    clues: parsed.clues || DEFAULT_CONFIG.clues,
    finishMessage: parsed.finishMessage || DEFAULT_CONFIG.finishMessage,
  };
}

async function loadPyHuntConfigAsync(): Promise<PyHuntConfig> {
  // ── Route through backend (bypasses Supabase RLS) ──
  // Always fetch fresh from backend — never trust stale localStorage
  try {
    const res = await fetch(`/api/admin/pyhunt/config`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
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
   CLUE UNLOCK SCREEN
═══════════════════════════════════════════════ */
function ClueScreen({ clue, onUnlock }: { clue: ClueConfig; onUnlock: () => void }) {
  const [input, setInput] = useState("");
  const [shaking, setShaking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [attempts, setAttempts] = useState(0);

  // If no unlock code needed (last round), auto-show unlock button
  if (!clue.unlockCode) {
    return (
      <div className={styles.clueScreen}>
        <div className={styles.clueCard}>
          <div className={styles.clueEmoji}>🎉</div>
          <div className={styles.clueText}>{clue.clueText}</div>
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
function RoundMCQ({ questions, onComplete, onWrong }: { questions: MCQQuestion[]; onComplete: () => void; onWrong: () => void }) {
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
      <h2>Round 1 Complete!</h2>
      <p className={styles.scoreText}>You scored <strong>{score}/{questions.length}</strong></p>
      <button className={styles.primaryBtn} onClick={onComplete}>Get Clue →</button>
    </div>
  );

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round 1 · MCQ</span>
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
            : <button className={styles.primaryBtn} onClick={handleNext}>{idx+1<questions.length?"Next →":"Finish Round 1 →"}</button>
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

function RoundJumble({ problem, onComplete, onWrong }: { problem: JumbleProblem; onComplete: () => void; onWrong: () => void }) {
  const correct = problem.lines;
  const [lines, setLines] = useState<string[]>(() => shuffle(correct));
  const [dragging, setDragging] = useState<number|null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const handleDragStart = (i: number) => setDragging(i);
  const handleDrop = (i: number) => {
    if (dragging === null || dragging === i) return;
    const next = [...lines];
    [next[dragging], next[i]] = [next[i], next[dragging]];
    setLines(next);
    setDragging(null);
  };
  const handleSubmit = () => {
    const ok = lines.join("\n") === correct.join("\n");
    setSubmitted(true); setIsCorrect(ok);
    if (!ok) { setAttempts(a=>a+1); onWrong(); }
  };
  const handleRetry = () => { setSubmitted(false); setIsCorrect(false); setLines(shuffle(correct)); };

  if (submitted && isCorrect) return (
    <div className={styles.roundDone}>
      <div className={styles.doneIcon}>🔀</div>
      <h2>Round 2 Complete!</h2>
      <p className={styles.scoreText}>You unscrambled the code correctly!</p>
      <button className={styles.primaryBtn} onClick={onComplete}>Get Clue →</button>
    </div>
  );

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round 2 · Code Jumble</span>
      </div>
      <div className={styles.questionCard}>
        <div className={styles.problemTitle}>{problem.title}</div>
        <div className={styles.problemDesc}>{problem.description}</div>
        <div className={styles.jumbleBoard}>
          {lines.map((line, i) => (
            <div
              key={i}
              className={`${styles.jumbleLine} ${dragging===i?styles.jumbleDragging:""}`}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(i)}
            >
              <span className={styles.lineNum}>{i+1}</span>
              <code>{line || "​"}</code>
              <span className={styles.dragHandle}>⠿</span>
            </div>
          ))}
        </div>
        {submitted && !isCorrect && (
          <div className={styles.wrongMsg}>❌ Not quite — the logic isn't right yet. Try reordering!</div>
        )}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
          {submitted && !isCorrect && <button className={styles.secondaryBtn} onClick={handleRetry}>🔄 Reset</button>}
          <button className={styles.primaryBtn} onClick={submitted&&!isCorrect?handleRetry:handleSubmit}>
            {submitted&&!isCorrect?"Try Again":"✓ Submit Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROUND 3 & 4 — CODING
═══════════════════════════════════════════════ */
function RoundCoding({ problem, roundNum, onComplete, onWrong }: { problem: CodingProblem; roundNum: number; onComplete: () => void; onWrong: () => void }) {
  const { ready, loadError, runCode, runTests } = usePyodide();
  const [code, setCode] = useState(problem.starterCode);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{stdout:string;stderr:string;error?:string}|null>(null);
  const [testResults, setTestResults] = useState<{pass:boolean;got:string;expected:string}[]>([]);
  const [allPass, setAllPass] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string|null>(null);
  const [aiHint, setAiHint] = useState<string|null>(null);
  const [aiReasoning, setAiReasoning] = useState<string|null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const handleRun = async () => {
    if (!ready || running) return;
    setRunning(true); setOutput(null); setTestResults([]); setAiFeedback(null); setAiHint(null);
    try {
      // Run tests
      const { results, allPass: ap } = await runTests(code, problem.testCases);
      setTestResults(results); setAllPass(ap);
      // Also get stdout for display
      const out = await runCode(code);
      setOutput(out);
      // AI feedback (Streaming)
      setAiLoading(true); setAiReasoning(null);
      const prompt = `Review this Python solution for round ${roundNum}.
Problem Title: ${problem.title}
Description: ${problem.description}
Code:
\`\`\`python
${code}
\`\`\`
Test Cases: ${JSON.stringify(problem.testCases)}

Please provide a brief, encouraging review of the logic. If it works, congratulate them. If it has issues, explain why without giving the full answer immediately. Keep it under 3 sentences.`;

      try {
        await streamAICompletion(
          [{ role: "user", content: prompt }],
          (token) => setAiFeedback(prev => (prev || "") + token),
          (reasoningToken) => setAiReasoning(prev => (prev || "") + reasoningToken)
        );

        if (!ap) {
          const hintPrompt = `The student is stuck on the Python problem: "${problem.title}".
Code:
\`\`\`python
${code}
\`\`\`
Errors/Issues: ${results.map((r,i)=>`Test ${i+1}: got "${r.got}", expected "${r.expected}"`).join("; ")}

Provide a subtle, helpful hint to guide them toward the solution. Do not provide the full code. Keep it one sentence.`;

          await streamAICompletion(
            [{ role: "user", content: hintPrompt }],
            (token) => setAiHint(prev => (prev || "") + token)
          );
          onWrong();
        }
      } catch (err) {
        console.error("AI Error:", err);
        setAiFeedback("🤖 AI currently unavailable — keep going!");
      }
    } finally { setRunning(false); setAiLoading(false); }
  };

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round {roundNum} · Coding</span>
        {loadError && <span className={styles.errorTag}>⚠ Pyodide: {loadError}</span>}
        {!loadError && !ready && <span className={styles.loadingTag}>⟳ Loading Python…</span>}
        {!loadError && ready && <span className={styles.readyTag}>✓ Python Ready</span>}
      </div>
      <div className={styles.codingLayout}>
        <div className={styles.problemPane}>
          <div className={styles.problemTitle}>{problem.title}</div>
          <div className={styles.problemDesc}>{problem.description}</div>
          <div className={styles.testCasesList}>
            <div className={styles.tcHeader}>Test Cases</div>
            {problem.testCases.slice(0,3).map((tc,i) => (
              <div key={i} className={styles.tcRow}>
                <span className={styles.tcLabel}>input:</span>
                <code>"{tc.input}"</code>
                <span className={styles.tcArrow}>→</span>
                <code>{tc.expected}</code>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.editorPane}>
          <textarea
            className={styles.codeEditor}
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
          />
          <button className={styles.runBtn} onClick={handleRun} disabled={!ready||running}>
            {running ? "⟳ Processing..." : "EXECUTE LOGIC PROTOCOL"}
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
          {aiLoading && <div className={styles.aiLoading}>🤖 DeepSeek is reviewing your code…</div>}
          
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
              <p>All tests passed!</p>
              <button className={styles.primaryBtn} onClick={onComplete}>Get Clue →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROUND 5 — TURTLE
═══════════════════════════════════════════════ */
function RoundTurtle({ problem, onComplete, onWrong, onDrawUpdate }: { problem: TurtleProblem; onComplete: (dataUrl?: string) => void; onWrong: () => void; onDrawUpdate?: (img: string) => void }) {
  const { ready, loadError, runCode } = usePyodide();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [code, setCode] = useState(problem.starterCode || `import turtle\nt = turtle.Turtle()\n`);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [turtleErr, setTurtleErr] = useState<string>("");

  const handleRun = async () => {
    if (!ready || running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setRunning(true);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTurtleErr("");

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // ── Full Python→Canvas Turtle Bridge ──
    // Turtle emits JSON drawing commands to stdout.
    // Supports: forward/fd, backward/bk, left/lt, right/rt,
    //           goto/setpos, setheading/seth, home,
    //           penup/pu, pendown/pd, pensize/width,
    //           color, pencolor, fillcolor, begin_fill, end_fill,
    //           circle, dot, hideturtle/ht, showturtle/st,
    //           speed, clear, reset, bgcolor, title, setup,
    //           done/mainloop/exitonclick (no-ops)
    const bridgeScript = `
import json as _json
import sys as _sys
from math import radians as _rad, cos as _cos, sin as _sin
from types import ModuleType as _Mod

def _emit(**kw):
    print(_json.dumps(kw))

def _parse_color(c):
    if isinstance(c, (list, tuple)) and len(c) == 3:
        r,g,b = [int(x*255) if x<=1 else int(x) for x in c]
        return f"rgb({r},{g},{b})"
    return str(c)

class Turtle:
    def __init__(self):
        self._x = \${CX}
        self._y = \${CY}
        self._angle = -90.0   # heading: 0=East, -90=North (canvas coords)
        self._pen = True
        self._color = "cyan"
        self._fill_color = "cyan"
        self._fill_pts = None
        self._lw = 1
        _emit(type="init", x=self._x, y=self._y)

    # ── Movement ──
    def _move(self, dist):
        nx = self._x + dist * _cos(_rad(self._angle))
        ny = self._y + dist * _sin(_rad(self._angle))
        if self._pen:
            _emit(type="line", x1=self._x, y1=self._y, x2=nx, y2=ny,
                  color=self._color, lw=self._lw)
        else:
            _emit(type="move", x=nx, y=ny)
        if self._fill_pts is not None:
            self._fill_pts.append((nx, ny))
        self._x, self._y = nx, ny

    def forward(self, d): self._move(float(d))
    def fd(self, d): self._move(float(d))
    def backward(self, d): self._move(-float(d))
    def bk(self, d): self._move(-float(d))
    def back(self, d): self._move(-float(d))

    # ── Turning ──
    def left(self, deg): self._angle -= float(deg)
    def lt(self, deg): self._angle -= float(deg)
    def right(self, deg): self._angle += float(deg)
    def rt(self, deg): self._angle += float(deg)
    def setheading(self, deg): self._angle = float(deg) - 90
    def seth(self, deg): self.setheading(deg)

    # ── Position ──
    def goto(self, x, y=None):
        if y is None: x, y = x
        nx, ny = float(x) + \${CX}, -float(y) + \${CY}
        if self._pen:
            _emit(type="line", x1=self._x, y1=self._y, x2=nx, y2=ny,
                  color=self._color, lw=self._lw)
        else:
            _emit(type="move", x=nx, y=ny)
        self._x, self._y = nx, ny
    def setpos(self, x, y=None): self.goto(x, y)
    def setposition(self, x, y=None): self.goto(x, y)
    def home(self):
        self.goto(0, 0)
        self._angle = -90.0
    def xcor(self): return self._x - \${CX}
    def ycor(self): return -(self._y - \${CY})
    def pos(self): return (self.xcor(), self.ycor())
    def position(self): return self.pos()
    def heading(self): return (self._angle + 90) % 360

    # ── Pen ──
    def penup(self): self._pen = False
    def pu(self): self._pen = False
    def up(self): self._pen = False
    def pendown(self): self._pen = True
    def pd(self): self._pen = True
    def down(self): self._pen = True
    def isdown(self): return self._pen
    def pensize(self, w): self._lw = float(w)
    def width(self, w): self._lw = float(w)
    def pencolor(self, *args):
        self._color = _parse_color(args[0] if len(args)==1 else args)
    def fillcolor(self, *args):
        self._fill_color = _parse_color(args[0] if len(args)==1 else args)
    def color(self, *args):
        if len(args) == 1:
            self._color = _parse_color(args[0])
            self._fill_color = self._color
        elif len(args) == 2:
            self._color = _parse_color(args[0])
            self._fill_color = _parse_color(args[1])
        elif len(args) == 3:
            c = _parse_color(args)
            self._color = c; self._fill_color = c

    # ── Fill ──
    def begin_fill(self):
        self._fill_pts = [(self._x, self._y)]
    def end_fill(self):
        if self._fill_pts:
            _emit(type="fill", pts=self._fill_pts, color=self._fill_color)
            self._fill_pts = None

    # ── Shapes ──
    def circle(self, r, extent=360, steps=None):
        steps = steps or max(int(abs(r) * abs(extent) / 20), 12)
        step_angle = extent / steps
        step_len = 2 * 3.14159265 * abs(r) * (extent / 360) / steps
        for _ in range(steps):
            self._move(step_len)
            self.left(step_angle)

    def dot(self, size=None, *args):
        sz = size if size else self._lw + 4
        c = _parse_color(args[0]) if args else self._color
        _emit(type="dot", x=self._x, y=self._y, r=sz/2, color=c)

    def stamp(self): pass
    def clearstamp(self, *a): pass
    def write(self, txt, *a, **kw):
        _emit(type="text", x=self._x, y=self._y, text=str(txt), color=self._color)

    # ── Misc no-ops ──
    def speed(self, s): pass
    def hideturtle(self): pass
    def ht(self): pass
    def showturtle(self): pass
    def st(self): pass
    def isvisible(self): return True
    def clear(self): pass
    def reset(self): pass
    def tracer(self, *a, **kw): pass
    def update(self): pass
    def shape(self, *a): pass
    def shapesize(self, *a): pass
    def turtlesize(self, *a): pass
    def ondrag(self, *a, **kw): pass
    def onclick(self, *a, **kw): pass
    def onrelease(self, *a, **kw): pass

_t_instance = None
def _get_screen(): return type("Screen", (), {
    "bgcolor": lambda s,*a: None, "title": lambda s,*a: None,
    "setup": lambda s,*a: None, "tracer": lambda s,*a: None,
    "update": lambda s: None,
})()

_t_mod = _Mod("turtle")
_t_mod.Turtle = Turtle
_t_mod.RawTurtle = Turtle
_t_mod.Pen = Turtle
_t_mod.RawPen = Turtle
_t_mod.Screen = _get_screen
_t_mod.getscreen = _get_screen

# Module-level convenience functions (turtle.forward(), turtle.right(), etc.)
_t_global = Turtle()
_t_mod.forward = _t_global.forward;  _t_mod.fd = _t_global.fd
_t_mod.backward = _t_global.backward; _t_mod.bk = _t_global.bk
_t_mod.left = _t_global.left;        _t_mod.lt = _t_global.lt
_t_mod.right = _t_global.right;      _t_mod.rt = _t_global.rt
_t_mod.goto = _t_global.goto;        _t_mod.setpos = _t_global.setpos
_t_mod.setheading = _t_global.setheading; _t_mod.seth = _t_global.seth
_t_mod.home = _t_global.home
_t_mod.penup = _t_global.penup;      _t_mod.pu = _t_global.pu
_t_mod.pendown = _t_global.pendown;  _t_mod.pd = _t_global.pd
_t_mod.pensize = _t_global.pensize;  _t_mod.width = _t_global.width
_t_mod.color = _t_global.color
_t_mod.pencolor = _t_global.pencolor
_t_mod.fillcolor = _t_global.fillcolor
_t_mod.begin_fill = _t_global.begin_fill
_t_mod.end_fill = _t_global.end_fill
_t_mod.circle = _t_global.circle
_t_mod.dot = _t_global.dot
_t_mod.speed = _t_global.speed
_t_mod.hideturtle = _t_global.hideturtle; _t_mod.ht = _t_global.ht
_t_mod.showturtle = _t_global.showturtle; _t_mod.st = _t_global.st
_t_mod.write = _t_global.write
_t_mod.done = lambda: None
_t_mod.mainloop = lambda: None
_t_mod.exitonclick = lambda: None
_t_mod.tracer = lambda *a,**kw: None
_t_mod.update = lambda: None
_t_mod.bgcolor = lambda *a: None
_t_mod.title = lambda *a: None
_t_mod.setup = lambda *a,**kw: None
_t_mod.xcor = _t_global.xcor; _t_mod.ycor = _t_global.ycor
_t_mod.pos = _t_global.pos; _t_mod.position = _t_global.position
_t_mod.heading = _t_global.heading
_sys.modules["turtle"] = _t_mod
`;

    // Replace template placeholders with actual canvas center
    const bridge = bridgeScript
      .replace(/\$\{CX\}/g, String(cx))
      .replace(/\$\{CY\}/g, String(cy));

    try {
      const res = await runCode(bridge + "\n" + code);

      // Render all drawing commands
      let curColor = "#00dcff";
      let curLw = 2;
      let curX = cx, curY = cy;

      const lines = (res.stdout || "").split("\n");
      for (const line of lines) {
        const tl = line.trim();
        if (!tl.startsWith("{")) continue;
        try {
          const cmd = JSON.parse(tl);
          if (cmd.type === "init" || cmd.type === "move") {
            curX = cmd.x; curY = cmd.y;
          } else if (cmd.type === "line") {
            ctx.beginPath();
            ctx.strokeStyle = cmd.color || curColor;
            ctx.lineWidth = cmd.lw || curLw;
            ctx.moveTo(cmd.x1, cmd.y1);
            ctx.lineTo(cmd.x2, cmd.y2);
            ctx.stroke();
            curX = cmd.x2; curY = cmd.y2;
          } else if (cmd.type === "fill") {
            if (cmd.pts && cmd.pts.length > 1) {
              ctx.beginPath();
              ctx.moveTo(cmd.pts[0][0], cmd.pts[0][1]);
              for (let i = 1; i < cmd.pts.length; i++) {
                ctx.lineTo(cmd.pts[i][0], cmd.pts[i][1]);
              }
              ctx.closePath();
              ctx.fillStyle = cmd.color || curColor;
              ctx.fill();
            }
          } else if (cmd.type === "dot") {
            ctx.beginPath();
            ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2);
            ctx.fillStyle = cmd.color || curColor;
            ctx.fill();
          } else if (cmd.type === "text") {
            ctx.fillStyle = cmd.color || curColor;
            ctx.font = "14px monospace";
            ctx.fillText(cmd.text, cmd.x, cmd.y);
          }
        } catch { /* ignore non-JSON lines */ }
      }

      // Check if they drew something meaningful
      const stderr = (res.stderr || "").trim();
      const hasError = stderr && !stderr.includes("UserWarning") && !stderr.includes("DeprecationWarning");
      if (hasError) console.warn("Turtle stderr:", stderr);

      // Count actual line drawing commands
      const drawCmds = (res.stdout || "").split("\n").filter(l => {
        try { const c = JSON.parse(l.trim()); return c.type === "line" || c.type === "fill" || c.type === "dot"; }
        catch { return false; }
      });

      if (hasError && drawCmds.length === 0) {
        setTurtleErr(stderr);
        onWrong();
      } else if (drawCmds.length === 0 && !code.trim()) {
        setTurtleErr("Write some turtle code first!");
        onWrong();
      } else {
        if (hasError) setTurtleErr(stderr); // show warning but still complete
        setDone(true);
      }
    } catch (err: any) {
      console.error("Turtle Error:", err);
      onWrong();
    } finally {
      setRunning(false);
      if (canvasRef.current && onDrawUpdate) {
        onDrawUpdate(canvasRef.current.toDataURL("image/png"));
      }
    }
  };

  const handleFinish = () => {
    if (canvasRef.current) {
      onComplete(canvasRef.current.toDataURL("image/png"));
    } else {
      onComplete();
    }
  };

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round 5 · Turtle Art</span>
        {loadError && <span className={styles.errorTag}>⚠ {loadError}</span>}
        {!ready && <span className={styles.loadingTag}>⟳ Initializing Turtle Engine…</span>}
      </div>
      <div className={styles.codingLayout}>
        <div className={styles.problemPane}>
          <div className={styles.problemTitle}>{problem.title}</div>
          <div className={styles.problemDesc}>
            {problem.description}
          </div>
          {/* Reference Image */}
          <div className={styles.referenceBox}>
            <div className={styles.tcHeader}>Reference Target</div>
            <div style={{ padding: 10, background: "rgba(0,0,0,0.3)", borderRadius: 12, textAlign: "center" }}>
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#00dcff" strokeWidth="1">
                 <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>Goal: 5-Pointed Star</div>
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
          <button className={styles.runBtn} onClick={handleRun} disabled={!ready||running}>
            {running ? "🐢 Drawing…" : "▶ Run Turtle Code"}
          </button>
          
          <div className={styles.outputBox} style={{ height: "auto" }}>
             <div className={styles.outputLabel}>Canvas Output</div>
             <canvas 
               id="turtle-canvas"
               ref={canvasRef} 
               width={400} 
               height={300} 
               className={styles.turtleCanvas} 
               style={{ background: "#0c1117", borderRadius: 8, marginTop: 8, display: "block", width: "100%" }}
             />
             {turtleErr && (
               <pre style={{ marginTop: 8, padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                 ⚠ {turtleErr}
               </pre>
             )}
          </div>

          {done && (
            <div className={styles.roundDone} style={{marginTop:24, background:"rgba(0,220,255,0.05)", border:"1px solid rgba(0,220,255,0.2)"}}>
              <div className={styles.doneIcon}>🌟</div>
              <h3>Star Captured!</h3>
              <p>Your cosmic sketch is complete. The treasure hunt is over!</p>
              <button className={styles.primaryBtn} onClick={handleFinish}>Finish PyHunt & View Results →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   FINISH SCREEN
═══════════════════════════════════════════════ */
function FinishScreen({ message, stats, timerSeconds, terminated }: { message: string; stats: { minutes: number; wrongs: number; warnings: number }; timerSeconds: number; terminated?: boolean }) {
  const router = useRouter();
  return (
    <div className={styles.finishScreen} style={terminated ? { border: "2px solid #ef4444", background: "rgba(239, 68, 68, 0.05)", boxShadow: "0 0 40px rgba(239, 68, 68, 0.2)" } : {}}>
      <div className={styles.finishEmoji}>{terminated ? "⛔" : "🏆"}</div>
      <div className={styles.finishTitle} style={terminated ? { color: "#ef4444", textShadow: "0 0 20px rgba(239, 68, 68, 0.5)" } : {}}>
        {terminated ? "SESSION TERMINATED" : "PYHUNT COMPLETE!"}
      </div>
      
      <div className={styles.statsCard}>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{stats.minutes}m</div>
          <div className={styles.statLabel}>Total Time</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{stats.wrongs}</div>
          <div className={styles.statLabel}>Wrong Attempts</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statValue} style={terminated ? { color: "#ef4444" } : {}}>{stats.warnings}/3</div>
          <div className={styles.statLabel}>Warnings</div>
        </div>
      </div>

      <div className={styles.finishSub} style={terminated ? { color: "#fca5a5", fontWeight: 600 } : {}}>
        {terminated ? "Your PyHunt session was automatically terminated due to excessive security violations. Please contact your facilitator." : message}
      </div>
      <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <button className={styles.primaryBtn} onClick={() => router.replace("/dashboard?tab=History")} style={terminated ? { background: "linear-gradient(135deg, #ef4444, #991b1b)" } : {}}>
          ← GO TO HISTORY DASHBOARD
        </button>
        <div style={{ fontSize: 12, opacity: 0.5 }}>
          Auto-redirecting in {timerSeconds}s...
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PROGRESS BAR
═══════════════════════════════════════════════ */
function ProgressBar({ round, showingClue }: { round: number; showingClue: boolean }) {
  const ROUNDS = ["MCQ","Jumble","Palindrome","FizzBuzz","Turtle"];
  const filled = showingClue ? round + 1 : round;
  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressLine}>
        <div className={styles.progressLineFill} style={{width:`${(filled/5)*100}%`}} />
      </div>
      {ROUNDS.map((label, i) => {
        const isActive = i === round && !showingClue;
        const isDone = i < filled;
        
        return (
          <div key={i} title={label} className={`${styles.progressDot} ${isDone ? styles.progressDone : ""} ${isActive ? styles.progressActive : ""}`}>
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
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:18, userSelect:"none" }}>
        <div style={{ animation:"ph-float 3s ease-in-out infinite", position:"relative", width:s*1.8, height:s*1.8, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ position:"absolute", width:s*1.7, height:s*1.7, borderRadius:"50%", background:"radial-gradient(circle, rgba(100,60,255,0.22) 0%, rgba(60,0,160,0.1) 45%, transparent 70%)", animation:"ph-pulse 2.4s ease-in-out infinite", pointerEvents:"none" }} />
          <div style={{ position:"absolute", width:s*1.65, height:s*1.65, borderRadius:"50%", border:"1.5px solid rgba(140,80,255,0.35)", animation:"ph-ring-a 4s linear infinite", transformStyle:"preserve-3d" as React.CSSProperties["transformStyle"] }} />
          <div style={{ position:"absolute", width:s*1.35, height:s*1.35, borderRadius:"50%", border:"1px solid rgba(80,160,255,0.3)", animation:"ph-ring-b 6s linear infinite", transformStyle:"preserve-3d" as React.CSSProperties["transformStyle"] }} />
          <div style={{ position:"absolute", width:s*1.1, height:s*1.1, borderRadius:"50%", border:"1px dashed rgba(200,100,255,0.2)", animation:"ph-ring-c 9s linear infinite", transformStyle:"preserve-3d" as React.CSSProperties["transformStyle"] }} />
          <div style={{ position:"relative", width:s, height:s, borderRadius:"50%", perspective:s*3, perspectiveOrigin:"50% 50%" }}>
            <div style={{ width:"100%", height:"100%", borderRadius:"50%", background:"radial-gradient(circle at 35% 35%, rgba(180,100,255,0.9) 0%, rgba(80,40,200,0.85) 30%, rgba(20,10,80,0.95) 65%, rgba(40,20,120,1) 100%)", animation:"ph-spin 5s linear infinite", willChange:"transform", boxShadow:`0 0 ${s*0.3}px rgba(120,60,255,0.6), 0 0 ${s*0.6}px rgba(80,40,200,0.25), inset 0 0 ${s*0.2}px rgba(200,150,255,0.3)` }}>
              <svg viewBox="0 0 100 100" style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.55, borderRadius:"50%" }}>
                <path d="M30 70 Q20 50 35 35 Q50 20 65 35 Q80 50 65 65 Q50 80 35 65" fill="none" stroke="rgba(255,220,100,0.7)" strokeWidth="5" strokeLinecap="round"/>
                <circle cx="30" cy="70" r="6" fill="rgba(255,220,80,0.8)" />
                <circle cx="28" cy="68" r="1.5" fill="#1a0a30" />
                <text x="18" y="28" fontSize="12" fill="rgba(180,220,255,0.6)" fontFamily="monospace" fontWeight="bold">&lt;/&gt;</text>
              </svg>
            </div>
          </div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ color:"#c0a8ff", fontSize:15, fontWeight:700, letterSpacing:"0.06em", textShadow:"0 0 12px rgba(120,60,255,0.6)" }}>{label}</div>
          {sublabel && <div style={{ color:"#6040a0", fontSize:12, marginTop:4 }}>{sublabel}</div>}
        </div>
      </div>
    </>
  );
}

export default function PyHuntPage() {
  const router = useRouter();
  const [cfg, setCfg] = useState<PyHuntConfig>(DEFAULT_CONFIG);
  const [round, setRound] = useState(0);           // 0–4 = active round
  const [showingClue, setShowingClue] = useState(false);
  const [finished, setFinished] = useState(false);
  const [terminated, setTerminated] = useState(false);
  const [studentName, setStudentName] = useState("Student");
  const [turtleImage, setTurtleImage] = useState("");
  
  // Stats tracking
  const [startTime] = useState(Date.now());
  const [totalWrongs, setTotalWrongs] = useState(0);
  const [finishStats, setFinishStats] = useState({ minutes: 0, wrongs: 0, warnings: 0 });
  const [warningCount, setWarningCount] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [lastViolation, setLastViolation] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pyhuntLoading, setPyhuntLoading] = useState(false);
  const [resultTimerSeconds, setResultTimerSeconds] = useState(10);
  const [studentId, setStudentId] = useState("");
  const lastWarningTimeRef = useRef(0);

  const recordWrong = useCallback(() => setTotalWrongs(w => w + 1), []);

  useEffect(() => {
    // Show loading orb — extend to 3s to ensure config loads before game starts
    setPyhuntLoading(true);
    const t = setTimeout(() => setPyhuntLoading(false), 3000);

    // 1. Always clear stale config cache — students must get fresh config from backend
    if (typeof window !== "undefined") {
      localStorage.removeItem("nexus_pyhunt_config_v2");
    }

    // 2. Fetch fresh config from backend FIRST, then release loading state
    loadPyHuntConfigAsync().then(c => {
      setCfg(c);
      console.log("[PyHunt] Config loaded:", c.mcqQuestions?.length, "MCQ questions, clue[0]:", c.clues?.[0]?.unlockCode);
    }).catch(e => {
      console.error("[PyHunt] Config load failed, using DEFAULT (LIBRARY42 may be wrong!):", e);
    });
    
    try { 
      const examStudent = sessionStorage.getItem("exam_student"); const examStudentData = examStudent ? JSON.parse(examStudent) : {};
      const n = examStudentData.name || null;
      const sid = examStudentData.id || null;
      const sessionStudent = JSON.parse(sessionStorage.getItem("exam_student") || "{}");

      if (n) setStudentName(n); 
      else if (sessionStudent.name) setStudentName(sessionStudent.name);

      if (sid) setStudentId(sid);
      else if (sessionStudent.id) setStudentId(sessionStudent.id);
      
      const effectiveId = sid || sessionStudent.id;
      if (effectiveId) {
        supabase.from("pyhunt_progress")
          .select("warnings, turtle_image, current_round")
          .eq("student_id", effectiveId)
          .maybeSingle()
          .then(({ data }: { data: any }) => {
            if (data) {
              setWarningCount(data.warnings || 0);
              if (data.turtle_image) setTurtleImage(data.turtle_image);
              // Optionally restore round if they refreshed
              if (data.current_round && data.current_round.startsWith("Round")) {
                 const r = parseInt(data.current_round.replace("Round ", ""));
                 if (!isNaN(r)) setRound(r - 1);
              }
            }
          });
      }
    } catch {}

    // 2. Subscribe to Supabase Realtime for instant push updates when admin saves
    const channel = supabase
      .channel('pyhunt-realtime-config')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_config', filter: "exam_title=eq.PYHUNT_GLOBAL_CONFIG" },
        (payload: any) => {
          console.log("[PyHunt] Realtime config update received — re-fetching from backend");
          // Re-fetch from backend (not from payload) to ensure RLS-safe, consistent data
          loadPyHuntConfigAsync().then(fresh => {
            setCfg(fresh);
            console.log("[PyHunt] Config hot-reloaded from backend after realtime event");
          }).catch(e => {
            // Fallback: parse payload directly
            if (payload.new && (payload.new as any).category) {
              try {
                const parsed = JSON.parse((payload.new as any).category);
                localStorage.setItem("nexus_pyhunt_config_v2", JSON.stringify(parsed));
                setCfg(parseCfg(parsed));
              } catch (err) {
                console.error("[PyHunt] Failed to parse realtime payload", err);
              }
            }
          });
        }
      )
      .subscribe();

    return () => {
      clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Track Progress to Supabase ──
  useEffect(() => {
    const updateProgress = async () => {
      try {
        const examStudent2 = sessionStorage.getItem("exam_student"); const sid2 = examStudent2 ? JSON.parse(examStudent2).id : null;
        const studentId = sid2 || "anonymous";
        const name = studentName || "Student";
        const currentRound = finished ? (terminated ? `Round ${round + 1}` : "COMPLETED") : `Round ${round + 1}`;
        
        // Important: Fetch the latest image from state
        // If it's empty, try to get it from local storage as a last resort
        const imgToSend = turtleImage || localStorage.getItem("nexus_turtle_temp");

        const token = sessionStorage.getItem("exam_token") || "";
        if (!token) return;

        await fetch("/api/exam/pyhunt/sync-progress", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            current_round: currentRound,
            turtle_image: imgToSend || undefined,
            finished: finished,
            terminated: terminated,
            warning_count: warningCount,
            last_violation: lastViolation || undefined
          })
        });
      } catch (err) {
        console.error("Failed to update progress:", err);
      }
    };
    updateProgress();
  }, [round, finished, terminated, warningCount, lastViolation, turtleImage, studentName]);

  // ── Violation Handling ──
  // Fullscreen Watcher
  useEffect(() => {
    const handleFsChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const enterFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen()
        .then(() => {
          console.log("[PyHunt] Fullscreen entered successfully");
          setIsFullscreen(true);
        })
        .catch((err) => {
          console.warn("[PyHunt] Fullscreen blocked:", err.message);
        });
    }
  }, []);

  // Fullscreen is requested by the gate button click (user gesture required).
  // Do not attempt requestFullscreen() in useEffect — browser blocks it.
  // The isFullscreen gate handles re-entry when fullscreen is lost.

  // ── Auto-Redirect Timer ──
  useEffect(() => {
    if (!finished) return;
    
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
  }, [finished, router]);

  // ── Proctoring Restrictions ──
  // Grace period ref: violations ignored for 8 seconds after mount (fullscreen dialog causes blur)
  const gracePeriodRef = useRef(true);
  useEffect(() => {
    // Give 1.5 seconds before proctoring starts (fullscreen dialog grace)
    const graceTimer = setTimeout(() => { gracePeriodRef.current = false; }, 1500);
    return () => clearTimeout(graceTimer);
  }, []);

    // Active fullscreen enforcement is handled by AntiCheat component.
  // PyHunt does not independently re-enter fullscreen to avoid browser errors.

  const handleRoundComplete = (dataUrl?: string) => {
    if (dataUrl) {
      setTurtleImage(dataUrl);
      localStorage.setItem("nexus_turtle_temp", dataUrl);
    }
    setShowingClue(true);
  };

  const handleUnlock = () => {
    if (round >= 4) { 
      const duration = Math.floor((Date.now() - startTime) / 60000);
      setFinishStats({ minutes: duration, wrongs: totalWrongs, warnings: warningCount });
      setFinished(true); 
      return; 
    }
    setShowingClue(false);
    setRound(r => r + 1);
  };

  if (pyhuntLoading) return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999,
      background:"radial-gradient(ellipse at 50% 40%, #0d0820 0%, #06040e 100%)",
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:["radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.4), transparent)","radial-gradient(1px 1px at 35% 65%, rgba(255,255,255,0.3), transparent)","radial-gradient(1px 1px at 70% 30%, rgba(255,255,255,0.35), transparent)","radial-gradient(1px 1px at 88% 75%, rgba(255,255,255,0.25), transparent)"].join(",") }} />
      <PyHuntOrb size={120} label="Initialising PyHunt…" sublabel="Decrypting round data" />
    </div>
  );

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
          if (meta && typeof meta.strike === 'number') {
            setWarningCount(meta.strike);
          } else {
            setWarningCount(prev => Math.min(prev + 1, 3));
          }
        }}
        initialWarningCount={warningCount}
      >
        {finished ? (
          <FinishScreen message={cfg.finishMessage} stats={finishStats as any} timerSeconds={resultTimerSeconds} terminated={terminated} />
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
              {/* CLUE SCREEN */}
              {showingClue && cfg.clues[round] && (
                <ClueScreen clue={cfg.clues[round]} onUnlock={handleUnlock} />
              )}

              {/* ROUNDS */}
              {!showingClue && round === 0 && <RoundMCQ questions={cfg.mcqQuestions} onComplete={handleRoundComplete} onWrong={recordWrong} />}
              {!showingClue && round === 1 && <RoundJumble problem={cfg.jumbleProblem} onComplete={handleRoundComplete} onWrong={recordWrong} />}
              {!showingClue && round === 2 && <RoundCoding problem={cfg.round3} roundNum={3} onComplete={handleRoundComplete} onWrong={recordWrong} />}
              {!showingClue && round === 3 && <RoundCoding problem={cfg.round4} roundNum={4} onComplete={handleRoundComplete} onWrong={recordWrong} />}
              {!showingClue && round === 4 && <RoundTurtle problem={cfg.turtleProblem} onComplete={handleRoundComplete} onWrong={recordWrong} onDrawUpdate={(img) => setTurtleImage(img)} />}
            </main>
          </>
        )}
      </AntiCheat>
    </div>
  );
}






