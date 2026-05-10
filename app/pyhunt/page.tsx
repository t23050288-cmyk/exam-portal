"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./pyhunt.module.css";
import { getAICompletion, streamAICompletion } from "@/lib/ai-client";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import GoldenOrb from "@/components/GoldenOrb";

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
  clues:[
    { clueText:"🗝️ Round 1 Complete! Go to the Library — find the book with a RED spine on the second shelf. A sticky note on page 42 has your unlock code.", unlockCode:"LIBRARY42" },
    { clueText:"🗝️ Round 2 Complete! Head to Lab-2 — look at the whiteboard at the back of the room. Your code is written there.", unlockCode:"LAB2CODE" },
    { clueText:"🗝️ Round 3 Complete! Walk to the corridor near Room 301. There's a locker with the number 42. The code is taped inside.", unlockCode:"LOCKER301" },
    { clueText:"🗝️ Round 4 Complete! Return to the starting room. Check under the facilitator's desk — there's an envelope with your final code.", unlockCode:"FINALENV" },
    { clueText:"🎉 You did it! All 5 rounds complete. Show this screen to the facilitator to claim your prize!", unlockCode:"" },
  ],
  finishMessage:"🏆 Congratulations! You've conquered PyHunt! You are a true Python treasure hunter. Show this screen to your facilitator!",
};

/* ═══════════════════════════════════════════════
   CONFIG LOADER
═══════════════════════════════════════════════ */
function loadPyHuntConfig(): PyHuntConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const s = localStorage.getItem("nexus_pyhunt_config_v2");
    if (!s) return DEFAULT_CONFIG;
    const parsed = JSON.parse(s);
    return {
      mcqQuestions: parsed.mcqQuestions || DEFAULT_CONFIG.mcqQuestions,
      jumbleProblem: parsed.jumbleProblem || DEFAULT_CONFIG.jumbleProblem,
      round3: parsed.round3 || DEFAULT_CONFIG.round3,
      round4: parsed.round4 || DEFAULT_CONFIG.round4,
      clues: parsed.clues || DEFAULT_CONFIG.clues,
      finishMessage: parsed.finishMessage || DEFAULT_CONFIG.finishMessage,
    };
  } catch { return DEFAULT_CONFIG; }
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

  const handleSubmit = () => {
    if (input.trim().toUpperCase() === clue.unlockCode.toUpperCase()) {
      setUnlocked(true);
      setTimeout(onUnlock, 1200);
    } else {
      setAttempts(a => a + 1);
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
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
                ❌ Wrong code — check again! ({attempts} attempt{attempts>1?"s":""})
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
function RoundTurtle({ onComplete, onWrong }: { onComplete: () => void; onWrong: () => void }) {
  const { ready, loadError, runCode } = usePyodide();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [code, setCode] = useState(`import turtle\n\nt = turtle.Turtle()\nt.speed(0)\n\n# Sketch your 5-pointed star here!\n# Hint: Use a loop and turn 144 degrees\n`);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const handleRun = async () => {
    if (!ready || running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setRunning(true);
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // ── Bridge Python Turtle to JS Canvas ──
    // This script mocks a basic turtle module using the JS context
    const bridgeScript = `
import js
from math import radians, cos, sin

class Turtle:
    def __init__(self):
        self.x = ${canvas.width/2}
        self.y = ${canvas.height/2}
        self.angle = -90  # Start facing up
        self.is_down = True
        self.ctx = js.document.getElementById("turtle-canvas").getContext("2d")
        self.ctx.beginPath()
        self.ctx.moveTo(self.x, self.y)
        self.ctx.strokeStyle = "#00dcff"
        self.ctx.lineWidth = 2

    def forward(self, dist):
        nx = self.x + dist * cos(radians(self.angle))
        ny = self.y + dist * sin(radians(self.angle))
        if self.is_down:
            self.ctx.lineTo(nx, ny)
            self.ctx.stroke()
        else:
            self.ctx.moveTo(nx, ny)
        self.x, self.y = nx, ny

    def left(self, deg):  self.angle -= deg
    def right(self, deg): self.angle += deg
    def penup(self):   self.is_down = False
    def pendown(self): self.is_down = True
    def speed(self, s): pass

# Mock the turtle module
import sys
from types import ModuleType
t_mod = ModuleType("turtle")
t_mod.Turtle = Turtle
sys.modules["turtle"] = t_mod
`;

    try {
      await runCode(bridgeScript + "\n" + code);
      // Basic heuristic to check if they actually tried to draw a star
      const hasStarLogic = code.includes("144") && code.includes("forward");
      if (hasStarLogic) {
        setDone(true);
      } else {
        // Just let them finish but don't mark as "verified" yet
        setDone(true); 
      }
    } catch (err) {
      console.error("Turtle Error:", err);
      onWrong();
    } finally {
      setRunning(false);
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
          <div className={styles.problemTitle}>Final Challenge: Sketch the Star</div>
          <div className={styles.problemDesc}>
            Use the <code>turtle</code> module to recreate the star shown below. 
            A 5-pointed star has an internal angle of 144 degrees.
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
               style={{ background: "#0c1117", borderRadius: 8, marginTop: 8 }}
             />
          </div>

          {done && (
            <div className={styles.roundDone} style={{marginTop:24, background:"rgba(0,220,255,0.05)", border:"1px solid rgba(0,220,255,0.2)"}}>
              <div className={styles.doneIcon}>🌟</div>
              <h3>Star Captured!</h3>
              <p>Your cosmic sketch is complete. The treasure hunt is over!</p>
              <button className={styles.primaryBtn} onClick={onComplete}>Finish PyHunt & View Results →</button>
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
function FinishScreen({ message, stats, timerSeconds }: { message: string; stats: { minutes: number; wrongs: number; warnings: number }; timerSeconds: number }) {
  const router = useRouter();
  return (
    <div className={styles.finishScreen}>
      <div className={styles.finishEmoji}>🏆</div>
      <div className={styles.finishTitle}>PYHUNT COMPLETE!</div>
      
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
          <div className={styles.statValue}>{stats.warnings}/3</div>
          <div className={styles.statLabel}>Warnings</div>
        </div>
      </div>

      <div className={styles.finishSub}>{message}</div>
      <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <button className={styles.primaryBtn} onClick={() => router.replace("/dashboard")}>
          ← Back to Dashboard
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
  const [studentName, setStudentName] = useState("Student");
  
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

  const recordWrong = useCallback(() => setTotalWrongs(w => w + 1), []);

  useEffect(() => {
    // Show loading orb for 2s on mount
    setPyhuntLoading(true);
    const t = setTimeout(() => setPyhuntLoading(false), 2000);
    setCfg(loadPyHuntConfig());
    try { 
      const n = localStorage.getItem("nexus_student_name"); 
      if (n) setStudentName(n); 
    } catch {}
    return () => clearTimeout(t);
  }, []);

  // ── Track Progress to Supabase ──
  useEffect(() => {
    const updateProgress = async () => {
      try {
        const studentId = localStorage.getItem("nexus_student_id") || "anonymous";
        const name = localStorage.getItem("nexus_student_name") || "Student";
        const currentRound = finished ? "COMPLETED" : `Round ${round + 1}`;
        
        await supabase
          .from('pyhunt_progress')
          .upsert({ 
            student_id: studentId,
            student_name: name,
            current_round: currentRound,
            last_active: new Date().toISOString(),
            status: finished ? 'finished' : 'active',
            warnings: warningCount,
            last_violation: lastViolation
          }, { onConflict: 'student_id' });
      } catch (err) {
        console.error("Failed to update progress:", err);
      }
    };
    updateProgress();
  }, [round, finished, warningCount, lastViolation]);

  // ── Fullscreen Watcher ──
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
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

  // ── Auto-Fullscreen Enforcement ──
  // Force fullscreen on mount and whenever it's exited
  useEffect(() => {
    if (finished) return;
    
    // Try fullscreen immediately
    enterFullscreen();
    
    // Retry after 500ms in case first was blocked
    const retry = setTimeout(enterFullscreen, 500);
    
    return () => clearTimeout(retry);
  }, [finished, enterFullscreen]);

  // Re-enter fullscreen whenever user exits it
  useEffect(() => {
    if (finished) return;
    if (!isFullscreen) {
      const timer = setTimeout(enterFullscreen, 300);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen, finished, enterFullscreen]);

  // ── Auto-Redirect Timer ──
  useEffect(() => {
    if (!finished) return;
    
    const interval = setInterval(() => {
      setResultTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          router.replace("/dashboard");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [finished, router]);

  // ── Proctoring Restrictions ──
  useEffect(() => {
    if (finished) return;

    const handleViolation = (reason: string) => {
      // Always record violation even if warning is visible
      setWarningCount(prev => {
        const next = prev + 1;
        setLastViolation(reason);
        if (next >= 4) {
          const duration = Math.floor((Date.now() - startTime) / 60000);
          setFinishStats({ minutes: duration, wrongs: totalWrongs, warnings: 3 });
          setFinished(true);
          return 4;
        }
        setShowWarning(true);
        return next;
      });
      // Force re-enter fullscreen after any violation
      setTimeout(() => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      }, 300);
    };

    const onVisibilityChange = () => { 
      if (document.visibilityState === "hidden") handleViolation("tab_switch"); 
    };
    const onBlur = () => handleViolation("window_blur");
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && !finished) handleViolation("fullscreen_exit");
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      handleViolation("right_click");
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      handleViolation("copy_attempt");
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      handleViolation("paste_attempt");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Check for common shortcuts like Ctrl+C, Ctrl+V, Alt+Tab, etc.
      if (e.ctrlKey || e.altKey || e.metaKey || (e.key >= 'F1' && e.key <= 'F12')) {
        if (["c", "v", "a", "x", "p", "s"].includes(e.key.toLowerCase())) {
          e.preventDefault();
          handleViolation("keyboard_shortcut");
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("copy", onCopy);
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [finished, startTime, totalWrongs, showWarning]);

  const handleRoundComplete = () => setShowingClue(true);

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

  if (!isFullscreen && !finished) return (
    <div className={styles.page}>
      <div className={styles.stars} />
      <div className={styles.nebula1} /><div className={styles.nebula2} />
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
    </div>
  );

  if (finished) return (
    <div className={styles.page}>
      <div className={styles.stars} />
      <div className={styles.nebula1} /><div className={styles.nebula2} />
      <FinishScreen message={cfg.finishMessage} stats={finishStats as any} timerSeconds={resultTimerSeconds} />
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.stars} />
      <div className={styles.nebula1} /><div className={styles.nebula2} />

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
      
      {/* Warning Overlay */}
      <AnimatePresence>
        {showWarning && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className={styles.warningOverlay}
          >
            <div className={styles.warningCard} style={{ border: "2px solid #ef4444" }}>
              <div className={styles.warningIcon} style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>⚠️</div>
              <h2 style={{ color: "#fff", fontSize: 24, marginBottom: 8 }}>Security Alert</h2>
              <div style={{ background: "rgba(239,68,68,0.05)", padding: "12px 16px", borderRadius: 12, marginBottom: 20, border: "1px solid rgba(239,68,68,0.1)" }}>
                <p style={{ color: "#fca5a5", fontSize: 13, textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.05em", margin: 0 }}>
                  DETECTED: {lastViolation.replace(/_/g, ' ')}
                </p>
              </div>
              <div className={styles.warningStats}>
                Warning <strong>{warningCount}</strong> of 3
              </div>
              <p className={styles.warningNote}>After 3 warnings, your session will be automatically terminated.</p>
              <button className={styles.primaryBtn} onClick={() => setShowWarning(false)}>
                I Understand — Resume Challenge
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
        {!showingClue && round === 4 && <RoundTurtle onComplete={handleRoundComplete} onWrong={recordWrong} />}
      </main>
    </div>
  );
}


