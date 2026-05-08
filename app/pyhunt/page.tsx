"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./pyhunt.module.css";

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
   AI HELPERS
═══════════════════════════════════════════════ */
async function aiCheckCode(problem: CodingProblem, code: string, roundNum: number) {
  try {
    const res = await fetch("/api/ai/check-code", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ problem_title:problem.title, problem_description:problem.description, code, test_cases:problem.testCases, round_num:roundNum }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function aiGetHint(problemTitle: string, code: string, error?: string) {
  try {
    const res = await fetch("/api/ai/hint", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ problem_title:problemTitle, code, error }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.hint as string;
  } catch { return null; }
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
      }, 20000);
      cbRef.current.set(id, (data) => {
        clearTimeout(timeout);
        const results = (data.results || []).map((r:any, i:number) => ({
          pass: r.pass ?? (r.stdout?.trim() === testCases[i]?.expected?.trim()),
          got: r.stdout || r.output || r.got || "",
          expected: testCases[i]?.expected || "",
        }));
        resolve({ results, allPass: results.every((r:any) => r.pass) });
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
function RoundMCQ({ questions, onComplete }: { questions: MCQQuestion[]; onComplete: () => void }) {
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

function RoundJumble({ problem, onComplete }: { problem: JumbleProblem; onComplete: () => void }) {
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
    if (!ok) setAttempts(a=>a+1);
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
function RoundCoding({ problem, roundNum, onComplete }: { problem: CodingProblem; roundNum: number; onComplete: () => void }) {
  const { ready, loadError, runCode, runTests } = usePyodide();
  const [code, setCode] = useState(problem.starterCode);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{stdout:string;stderr:string;error?:string}|null>(null);
  const [testResults, setTestResults] = useState<{pass:boolean;got:string;expected:string}[]>([]);
  const [allPass, setAllPass] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string|null>(null);
  const [aiHint, setAiHint] = useState<string|null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleRun = async () => {
    if (!ready || running) return;
    setRunning(true); setOutput(null); setTestResults([]); setAiFeedback(null); setAiHint(null);
    try {
      // Run tests
      const { results, allPass: ap } = await runTests(code, problem.testCases);
      setTestResults(results); setAllPass(ap);
      // Also get stdout
      const out = await runCode(code);
      setOutput(out);
      // AI feedback
      setAiLoading(true);
      const ai = await aiCheckCode(problem, code, roundNum);
      if (ai) setAiFeedback(ai.feedback || ai.message || null);
      if (!ap) {
        const hint = await aiGetHint(problem.title, code, results.map((r,i)=>`Test ${i+1}: got "${r.got}", expected "${r.expected}"`).join("; "));
        setAiHint(hint);
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
function RoundTurtle({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const drawStar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const cx = canvas.width/2, cy = canvas.height/2;
    const size = 100;
    const angleStep = (Math.PI*4)/5;
    let x = cx, y = cy - size;
    ctx.beginPath(); ctx.moveTo(x,y);
    ctx.strokeStyle = "#00dcff"; ctx.lineWidth = 3;
    for (let i=0;i<5;i++) {
      const angle = (-Math.PI/2) + (i+1)*angleStep;
      const nx = cx + size*Math.cos(angle);
      const ny = cy + size*Math.sin(angle);
      ctx.lineTo(nx, ny);
    }
    ctx.closePath(); ctx.stroke();
    setTimeout(() => { setDrawing(false); setDone(true); }, 800);
  };

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round 5 · Turtle Art</span>
      </div>
      <div className={styles.questionCard}>
        <div className={styles.problemTitle}>Draw a Star with Turtle</div>
        <div className={styles.problemDesc}>
          Using Python's turtle module, draw a 5-pointed star with side length 100. Click the button below to see the result!
        </div>
        <canvas ref={canvasRef} width={320} height={240} className={styles.turtleCanvas} />
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button className={styles.runBtn} onClick={drawStar} disabled={drawing}>
            {drawing ? "Drawing…" : "🐢 Draw Star"}
          </button>
          {done && <button className={styles.primaryBtn} onClick={onComplete}>Get Final Clue →</button>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   FINISH SCREEN
═══════════════════════════════════════════════ */
function FinishScreen({ message }: { message: string }) {
  const router = useRouter();
  return (
    <div className={styles.finishScreen}>
      <div className={styles.finishEmoji}>🏆</div>
      <div className={styles.finishTitle}>PYHUNT COMPLETE!</div>
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

  useEffect(() => {
    setCfg(loadPyHuntConfig());
    try { const n = localStorage.getItem("nexus_student_name"); if (n) setStudentName(n); } catch {}
  }, []);

  const handleRoundComplete = () => setShowingClue(true);

  const handleUnlock = () => {
    if (round >= 4) { setFinished(true); return; }
    setShowingClue(false);
    setRound(r => r + 1);
  };

  if (finished) return (
    <div className={styles.page}>
      <div className={styles.stars} />
      <div className={styles.nebula1} /><div className={styles.nebula2} />
      <FinishScreen message={cfg.finishMessage} />
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
        {!showingClue && round === 0 && <RoundMCQ questions={cfg.mcqQuestions} onComplete={handleRoundComplete} />}
        {!showingClue && round === 1 && <RoundJumble problem={cfg.jumbleProblem} onComplete={handleRoundComplete} />}
        {!showingClue && round === 2 && <RoundCoding problem={cfg.round3} roundNum={3} onComplete={handleRoundComplete} />}
        {!showingClue && round === 3 && <RoundCoding problem={cfg.round4} roundNum={4} onComplete={handleRoundComplete} />}
        {!showingClue && round === 4 && <RoundTurtle onComplete={handleRoundComplete} />}
      </main>
    </div>
  );
}
