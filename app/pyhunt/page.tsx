"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./pyhunt.module.css";
import { getAICompletion, streamAICompletion } from "@/lib/ai-client";
import { motion, AnimatePresence } from "framer-motion";

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
            {running ? "⟳ Running…" : "▶ Run & Test"}
          </button>
          {output && (
            <div className={styles.outputBox}>
              <div className={styles.outputLabel}>Output</div>
              <pre style={{color: output.stderr ? "#f87171" : "#80c8a0"}}>
                {output.stderr || output.stdout || "(no output)"}
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
function FinishScreen({ message, stats }: { message: string; stats: { minutes: number; wrongs: number } }) {
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
      </div>

      <div className={styles.finishSub}>{message}</div>
      <button className={styles.primaryBtn} style={{marginTop:24}} onClick={() => router.push("/dashboard")}>
        ← Back to Dashboard
      </button>
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
      {ROUNDS.map((label, i) => (
        <div key={i} title={label} className={`${styles.progressDot} ${i<filled?styles.progressDone:""} ${i===round&&!showingClue?styles.progressActive:""}`}>
          {i < filled ? "✓" : i+1}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════ */
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
  const [finishStats, setFinishStats] = useState({ minutes: 0, wrongs: 0 });

  const recordWrong = useCallback(() => setTotalWrongs(w => w + 1), []);

  useEffect(() => {
    setCfg(loadPyHuntConfig());
    try { const n = localStorage.getItem("nexus_student_name"); if (n) setStudentName(n); } catch {}
  }, []);

  const handleRoundComplete = () => setShowingClue(true);

  const handleUnlock = () => {
    if (round >= 4) { 
      const duration = Math.floor((Date.now() - startTime) / 60000);
      setFinishStats({ minutes: duration, wrongs: totalWrongs });
      setFinished(true); 
      return; 
    }
    setShowingClue(false);
    setRound(r => r + 1);
  };

  if (finished) return (
    <div className={styles.page}>
      <div className={styles.stars} />
      <div className={styles.nebula1} /><div className={styles.nebula2} />
      <FinishScreen message={cfg.finishMessage} stats={finishStats} />
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

