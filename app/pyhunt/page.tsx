"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./pyhunt.module.css";

/* ═══════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════ */
interface MCQOption { label: string; text: string; }
interface MCQQuestion {
  id: string; question: string; options: MCQOption[]; correct: string;
  explanation?: string;
}
interface CodingProblem {
  title: string; description: string; starterCode: string;
  testCases: { input: string; expected: string; }[];
}
interface JumbleProblem {
  title: string; description: string;
  lines: string[];
}

/* ═══════════════════════════════════════════════
   ROUND DATA
═══════════════════════════════════════════════ */
const MCQ_QUESTIONS: MCQQuestion[] = [
  {
    id: "q1",
    question: "What is the output of: print(type([]).__name__)?",
    options: [
      { label: "A", text: "list" },
      { label: "B", text: "array" },
      { label: "C", text: "List" },
      { label: "D", text: "tuple" },
    ],
    correct: "A",
    explanation: "type([]) returns <class 'list'>, and .__name__ gives 'list'.",
  },
  {
    id: "q2",
    question: "Which keyword is used to define a generator function in Python?",
    options: [
      { label: "A", text: "return" },
      { label: "B", text: "async" },
      { label: "C", text: "yield" },
      { label: "D", text: "lambda" },
    ],
    correct: "C",
    explanation: "yield makes a function a generator.",
  },
  {
    id: "q3",
    question: "What does `list(range(2, 10, 3))` produce?",
    options: [
      { label: "A", text: "[2, 5, 8]" },
      { label: "B", text: "[2, 4, 6, 8]" },
      { label: "C", text: "[3, 6, 9]" },
      { label: "D", text: "[2, 5, 8, 11]" },
    ],
    correct: "A",
    explanation: "range(2,10,3) → 2, 5, 8.",
  },
  {
    id: "q4",
    question: "What is the result of `'hello'[::-1]`?",
    options: [
      { label: "A", text: "hello" },
      { label: "B", text: "olleh" },
      { label: "C", text: "Error" },
      { label: "D", text: "h" },
    ],
    correct: "B",
    explanation: "[::-1] reverses a string.",
  },
  {
    id: "q5",
    question: "Which of these creates a set in Python?",
    options: [
      { label: "A", text: "{}" },
      { label: "B", text: "set()" },
      { label: "C", text: "[]" },
      { label: "D", text: "()" },
    ],
    correct: "B",
    explanation: "{} creates an empty dict. set() creates an empty set.",
  },
];

const JUMBLE_PROBLEM: JumbleProblem = {
  title: "Fix the Fibonacci!",
  description:
    "The lines of a Fibonacci function have been jumbled. Drag them into the correct order so the function returns the nth Fibonacci number.",
  lines: [
    "def fibonacci(n):",
    "    if n <= 1:",
    "        return n",
    "    return fibonacci(n-1) + fibonacci(n-2)",
    "",
    "print(fibonacci(7))  # should print 13",
  ],
};

const CODING_ROUND3: CodingProblem = {
  title: "Palindrome Checker",
  description:
    "Write a function `is_palindrome(s: str) -> bool` that returns True if the string is a palindrome (case-insensitive, ignore spaces), False otherwise.",
  starterCode: `def is_palindrome(s: str) -> bool:
    # Your code here
    pass

# Test
print(is_palindrome("racecar"))   # True
print(is_palindrome("Hello"))     # False
print(is_palindrome("A man a plan a canal Panama"))  # True
`,
  testCases: [
    { input: "racecar", expected: "True" },
    { input: "Hello", expected: "False" },
    { input: "A man a plan a canal Panama", expected: "True" },
    { input: "abcba", expected: "True" },
  ],
};

const CODING_ROUND4: CodingProblem = {
  title: "FizzBuzz Remix",
  description:
    "Write a function `fizzbuzz(n: int) -> list` that returns a list of strings from 1 to n. Multiples of 3 → 'Fizz', multiples of 5 → 'Buzz', both → 'FizzBuzz', else the number as a string.",
  starterCode: `def fizzbuzz(n: int) -> list:
    # Your code here
    pass

# Test
result = fizzbuzz(15)
print(result)
`,
  testCases: [
    { input: "5", expected: "['1', '2', 'Fizz', '4', 'Buzz']" },
    { input: "15", expected: "['1', '2', 'Fizz', '4', 'Buzz', 'Fizz', '7', '8', 'Fizz', 'Buzz', '11', 'Fizz', '13', '14', 'FizzBuzz']" },
  ],
};

const TURTLE_ROUND5 = {
  title: "Draw a Star with Turtle",
  description:
    "Using Python's turtle module, write code that draws a 5-pointed star. The turtle should end up at the starting position. Use forward(100) for each side.",
  starterCode: `import turtle

t = turtle.Turtle()
t.speed(0)

# Draw a 5-pointed star
for i in range(5):
    t.forward(100)
    t.right(144)

turtle.done()
`,
};

const ROUND_CLUES = [
  "🗝️ Clue 1: Head to the room where knowledge is stored — find the book with a blue spine on the third shelf. Your next challenge awaits inside it.",
  "🗝️ Clue 2: The whiteboard at the back of Lab-2 holds your next puzzle. Look for the sticky note marked 'PY-2'.",
  "🗝️ Clue 3: Walk to the corridor near Room 301. There's a locker with the number '42' — the combination is the answer to life, the universe, and everything.",
  "🗝️ Clue 4: Return to the starting room. Under the facilitator's desk there is an envelope. Open it to find Round 5.",
  "🎉 Congratulations! You've completed all 5 rounds of PyHunt! Show this screen to the facilitator.",
];

/* ═══════════════════════════════════════════════
   LOAD CONFIG FROM ADMIN (localStorage)
═══════════════════════════════════════════════ */
function getStoredConfig() {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem("nexus_pyhunt_config");
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}
function usePyHuntConfig() {
  const stored = typeof window !== "undefined" ? getStoredConfig() : null;
  return {
    mcqQuestions: stored?.mcqQuestions || MCQ_QUESTIONS,
    jumbleProblem: stored?.jumbleProblem || JUMBLE_PROBLEM,
    round3: stored?.round3 || CODING_ROUND3,
    round4: stored?.round4 || CODING_ROUND4,
    clues: stored?.clues || ROUND_CLUES,
  };
}

/* ═══════════════════════════════════════════════
   NVIDIA AI HELPERS
═══════════════════════════════════════════════ */
async function aiCheckCode(problem: CodingProblem, code: string, roundNum: number) {
  try {
    const res = await fetch("/api/ai/check-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problem_title: problem.title,
        problem_description: problem.description,
        code,
        test_cases: problem.testCases,
        round_num: roundNum,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function aiGetHint(problemTitle: string, code: string, error?: string) {
  try {
    const res = await fetch("/api/ai/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem_title: problemTitle, code, error }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.hint as string;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════
   PYODIDE HOOK — Fixed to match worker format
═══════════════════════════════════════════════ */
function usePyodide() {
  const workerRef = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cbRef = useRef<Map<string, (r: any) => void>>(new Map());

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
      w.onerror = (err) => {
        setLoadError("Worker crashed: " + err.message);
      };
    } catch (err: any) {
      setLoadError("Failed to start worker: " + err.message);
    }
    return () => { try { w?.terminate(); } catch {} };
  }, []);

  /* runCode: sends { type:"run", code, stdin } and returns { stdout, stderr, error } */
  const runCode = useCallback((code: string, stdin = ""): Promise<{ stdout: string; stderr: string; error: string | null }> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve({ stdout: "", stderr: "Worker not initialized", error: "Worker not initialized" });
        return;
      }
      const id = Math.random().toString(36).slice(2);
      // 15s client-side timeout
      const timer = setTimeout(() => {
        cbRef.current.delete(id);
        resolve({ stdout: "", stderr: "Timeout: code took too long", error: "Timeout" });
      }, 15000);

      cbRef.current.set(id, (data) => {
        clearTimeout(timer);
        resolve({
          stdout: data.stdout || "",
          stderr: data.stderr || "",
          error: data.error || null,
        });
      });
      workerRef.current.postMessage({ id, type: "run", code, stdin });
    });
  }, []);

  return { ready, loadError, runCode };
}

/* ═══════════════════════════════════════════════
   COMPONENTS
═══════════════════════════════════════════════ */
function Stars() {
  return <div className={styles.stars} />;
}

function RoundProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className={styles.progressWrap}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`${styles.progressDot} ${i < current ? styles.progressDone : i === current ? styles.progressActive : ""}`}>
          {i < current ? "✓" : i + 1}
        </div>
      ))}
      <div className={styles.progressLine}>
        <div className={styles.progressLineFill} style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  );
}

/* MCQ Round */
function RoundMCQ({ questions, clue, onComplete }: { questions: MCQQuestion[]; clue: string; onComplete: () => void }) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = questions[idx];

  const handleCheck = () => {
    if (!selected) return;
    setChecked(true);
    if (selected === q.correct) setScore(s => s + 1);
  };

  const handleNext = () => {
    if (idx + 1 < questions.length) {
      setIdx(i => i + 1); setSelected(null); setChecked(false);
    } else { setDone(true); }
  };

  if (done) {
    return (
      <div className={styles.roundDone}>
        <div className={styles.doneIcon}>🎯</div>
        <h2>Round 1 Complete!</h2>
        <p className={styles.scoreText}>Score: <strong>{score}/{questions.length}</strong></p>
        <p className={styles.clueBox}>{clue}</p>
        <button className={styles.primaryBtn} onClick={onComplete}>I found the clue → Round 2</button>
      </div>
    );
  }

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round 1 · MCQ</span>
        <span className={styles.questionCount}>Q {idx + 1} / {questions.length}</span>
      </div>
      <div className={styles.questionCard}>
        <p className={styles.questionText}>{q.question}</p>
        <div className={styles.optionsList}>
          {q.options.map(opt => {
            let cls = styles.option;
            if (checked) {
              if (opt.label === q.correct) cls = `${styles.option} ${styles.optionCorrect}`;
              else if (opt.label === selected) cls = `${styles.option} ${styles.optionWrong}`;
            } else if (opt.label === selected) {
              cls = `${styles.option} ${styles.optionSelected}`;
            }
            return (
              <button key={opt.label} className={cls} disabled={checked} onClick={() => setSelected(opt.label)}>
                <span className={styles.optionLabel}>{opt.label}</span>{opt.text}
              </button>
            );
          })}
        </div>
        {checked && q.explanation && <div className={styles.explanation}>💡 {q.explanation}</div>}
        {!checked
          ? <button className={styles.primaryBtn} disabled={!selected} onClick={handleCheck}>Check Answer</button>
          : <button className={styles.primaryBtn} onClick={handleNext}>{idx + 1 < questions.length ? "Next Question →" : "Finish Round 1 →"}</button>
        }
      </div>
    </div>
  );
}

/* Jumble Round */
function RoundJumble({ problem: jumbleProblem, clue: jumbleClue, onComplete }: { problem: JumbleProblem; clue: string; onComplete: () => void }) {
  const correctLines = jumbleProblem.lines;
  const [lines, setLines] = useState<string[]>(() => [...correctLines].sort(() => Math.random() - 0.5));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);

  const handleDragStart = (i: number) => setDragIdx(i);
  const handleDrop = (i: number) => {
    if (dragIdx === null || dragIdx === i) return;
    const arr = [...lines];
    const [item] = arr.splice(dragIdx, 1);
    arr.splice(i, 0, item);
    setLines(arr);
    setDragIdx(null);
  };

  const handleSubmit = () => {
    const isCorrect = lines.every((l, i) => l === correctLines[i]);
    setCorrect(isCorrect);
    setSubmitted(true);
  };

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}><span className={styles.roundTag}>Round 2 · Code Jumble</span></div>
      <div className={styles.questionCard}>
        <h3 className={styles.problemTitle}>{jumbleProblem.title}</h3>
        <p className={styles.problemDesc}>{jumbleProblem.description}</p>
        <div className={styles.jumbleBoard}>
          {lines.map((line, i) => (
            <div key={i}
              className={`${styles.jumbleLine} ${dragIdx === i ? styles.jumbleDragging : ""}`}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(i)}>
              <span className={styles.lineNum}>{i + 1}</span>
              <code>{line || <em style={{ opacity: 0.35 }}>(blank line)</em>}</code>
              <span className={styles.dragHandle}>⠿</span>
            </div>
          ))}
        </div>
        {!submitted ? (
          <button className={styles.primaryBtn} onClick={handleSubmit}>Submit Order</button>
        ) : correct ? (
          <div className={styles.roundDone}>
            <div className={styles.doneIcon}>✅</div>
            <h3>Correct order!</h3>
            <p className={styles.clueBox}>{jumbleClue}</p>
            <button className={styles.primaryBtn} onClick={onComplete}>I found the clue → Round 3</button>
          </div>
        ) : (
          <div>
            <div className={styles.wrongMsg}>❌ Not quite right. Try again!</div>
            <button className={styles.secondaryBtn} onClick={() => setSubmitted(false)}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* Coding Round — Round 3 & 4 with REAL Pyodide execution + NVIDIA AI feedback */
function RoundCoding({
  problem, roundNum, clue, onComplete,
}: {
  problem: CodingProblem; roundNum: number; clue: string; onComplete: () => void;
}) {
  const { ready, loadError, runCode } = usePyodide();
  const [code, setCode] = useState(problem.starterCode);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [passed, setPassed] = useState(false);
  const [results, setResults] = useState<{ label: string; ok: boolean; got: string; expected: string }[]>([]);
  const [aiFeedback, setAiFeedback] = useState<string>("");
  const [aiHint, setAiHint] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState(false);

  const handleRun = async () => {
    if (!ready) return;
    setRunning(true);
    setOutput("");
    setResults([]);
    setAiFeedback("");
    setAiHint("");

    const testResults: typeof results = [];
    let allPassed = true;

    // Run each test case via Pyodide
    for (const tc of problem.testCases) {
      const fnMatch = code.match(/^def (\w+)\(/m);
      const fnName = fnMatch ? fnMatch[1] : null;
      let runnable = code;
      if (fnName) {
        const inputVal = isNaN(Number(tc.input)) ? `"${tc.input}"` : tc.input;
        runnable += `\n_result = str(${fnName}(${inputVal}))\nprint("TESTRESULT:" + _result)`;
      }

      const res = await runCode(runnable, tc.input);
      const stdout: string = res.stdout || "";
      const stderr: string = res.stderr || "";
      const lines = stdout.split("\n");
      const resultLine = lines.find((l: string) => l.startsWith("TESTRESULT:"));
      const got = resultLine ? resultLine.replace("TESTRESULT:", "").trim() : (res.error ? `Error: ${res.error}` : stdout.trim());
      const ok = got === tc.expected;
      if (!ok) allPassed = false;
      testResults.push({ label: tc.input, ok, got, expected: tc.expected });
    }

    // Also run plain for output display
    const fullRes = await runCode(code);
    const displayOut = fullRes.stderr ? `${fullRes.stdout}\n⚠️ ${fullRes.stderr}` : fullRes.stdout;
    setOutput(displayOut.trim());
    setResults(testResults);

    // NVIDIA AI feedback (non-blocking)
    setLoadingAi(true);
    if (allPassed) {
      setPassed(true);
      aiCheckCode(problem, code, roundNum).then(ai => {
        if (ai?.feedback) setAiFeedback("🤖 " + ai.feedback);
        setLoadingAi(false);
      });
    } else {
      aiGetHint(problem.title, code, fullRes.stderr || undefined).then(hint => {
        if (hint) setAiHint(hint);
        setLoadingAi(false);
      });
    }

    setRunning(false);
  };

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round {roundNum} · Python Coding</span>
        {loadError && <span className={styles.errorTag}>⚠️ {loadError}</span>}
        {!loadError && !ready && <span className={styles.loadingTag}>⏳ Loading Python…</span>}
        {ready && <span className={styles.readyTag}>🐍 Python Ready</span>}
      </div>
      <div className={styles.codingLayout}>
        <div className={styles.problemPane}>
          <h3 className={styles.problemTitle}>{problem.title}</h3>
          <p className={styles.problemDesc}>{problem.description}</p>
          <div className={styles.testCasesList}>
            <div className={styles.tcHeader}>Test Cases</div>
            {problem.testCases.map((tc, i) => (
              <div key={i} className={styles.tcRow}>
                <span className={styles.tcLabel}>Input:</span>
                <code>{tc.input}</code>
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
            rows={14}
          />
          <button
            className={styles.runBtn}
            onClick={handleRun}
            disabled={!ready || running}
          >
            {running ? "▶ Running…" : ready ? "▶ Run Code" : "⏳ Loading…"}
          </button>

          {results.length > 0 && (
            <div className={styles.testResults}>
              {results.map((r, i) => (
                <div key={i} className={`${styles.tcResult} ${r.ok ? styles.tcPass : styles.tcFail}`}>
                  {r.ok ? "✓" : "✗"} Input: <code>{r.label}</code> → got <code>{r.got}</code>
                  {!r.ok && <> (expected <code>{r.expected}</code>)</>}
                </div>
              ))}
            </div>
          )}

          {output && (
            <div className={styles.outputBox}>
              <div className={styles.outputLabel}>Output</div>
              <pre>{output}</pre>
            </div>
          )}

          {loadingAi && <div className={styles.aiLoading}>🤖 AI is thinking…</div>}
          {aiFeedback && <div className={styles.aiFeedback}>{aiFeedback}</div>}
          {aiHint && !passed && (
            <div className={styles.aiHint}>
              <span className={styles.aiHintLabel}>💡 AI Hint:</span> {aiHint}
            </div>
          )}
        </div>
      </div>

      {passed && (
        <div className={styles.roundDone} style={{ marginTop: 20 }}>
          <div className={styles.doneIcon}>🐍</div>
          <h3>All tests passed!</h3>
          <p className={styles.clueBox}>{clue}</p>
          <button className={styles.primaryBtn} onClick={onComplete}>I found the clue → Round {roundNum + 1}</button>
        </div>
      )}
    </div>
  );
}

/* Turtle Round */
function RoundTurtle({ clue: turtleClue, onComplete }: { clue: string; onComplete: () => void }) {
  const { ready, loadError, runCode } = usePyodide();
  const [code, setCode] = useState(TURTLE_ROUND5.starterCode);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleRun = async () => {
    if (!ready) return;
    setRunning(true);

    const shimCode = `
import sys

class _TurtleShim:
    def __init__(self):
        self.x = 0.0; self.y = 0.0; self.angle = 90.0; self.pen = True; self.moves = []
    def speed(self, s): pass
    def penup(self): self.pen = False
    def pendown(self): self.pen = True
    def forward(self, d):
        import math
        nx = self.x + d * math.cos(math.radians(self.angle))
        ny = self.y - d * math.sin(math.radians(self.angle))
        if self.pen: self.moves.append(('line', self.x, self.y, nx, ny))
        self.x, self.y = nx, ny
    def fd(self, d): self.forward(d)
    def right(self, a): self.angle -= a
    def left(self, a): self.angle += a
    def rt(self, a): self.right(a)
    def lt(self, a): self.left(a)
    def backward(self, d): self.forward(-d)
    def goto(self, x, y):
        if self.pen: self.moves.append(('line', self.x, self.y, x, y))
        self.x, self.y = x, y
    def circle(self, r):
        import math
        for _ in range(36):
            self.forward(2*math.pi*abs(r)/36)
            self.right(10 if r > 0 else -10)
    def color(self,*a): pass
    def fillcolor(self,*a): pass
    def pencolor(self,*a): pass
    def begin_fill(self): pass
    def end_fill(self): pass
    def hideturtle(self): pass
    def showturtle(self): pass
    def pensize(self,s): pass
    def width(self,s): pass
    def reset(self): self.__init__()
    def clear(self): self.moves=[]
    def home(self): self.x=0;self.y=0;self.angle=90

class _TurtleModule:
    def __init__(self): self._t=_TurtleShim()
    def Turtle(self): return _TurtleShim()
    def done(self): pass
    def mainloop(self): pass
    def speed(self,s): self._t.speed(s)

sys.modules['turtle'] = _TurtleModule()

${code.replace(/turtle\.done\(\)/g,"pass").replace(/turtle\.mainloop\(\)/g,"pass")}

_all_moves=[]
for _k,_v in list(globals().items()):
    if hasattr(_v,'moves'): _all_moves.extend(_v.moves)
_tm=sys.modules['turtle']
if not _all_moves and hasattr(_tm,'_t'): _all_moves=_tm._t.moves
print("TURTLEMOVES:"+str(_all_moves))
`;
    const res = await runCode(shimCode);
    const stdout: string = res.stdout || "";
    const movesLine = stdout.split("\n").find(l => l.startsWith("TURTLEMOVES:"));
    if (movesLine && canvasRef.current) {
      try {
        const movesStr = movesLine.replace("TURTLEMOVES:", "").trim();
        const moves: any[] = JSON.parse(
          movesStr
            .replace(/\(/g, "[").replace(/\)/g, "]")
            .replace(/'/g, '"')
        );
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#00dcff";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#00dcff";
        ctx.shadowBlur = 6;
        const cx = canvas.width / 2, cy = canvas.height / 2;
        moves.forEach(m => {
          if (m[0] === "line") {
            ctx.beginPath();
            ctx.moveTo(cx + m[1], cy + m[2]);
            ctx.lineTo(cx + m[3], cy + m[4]);
            ctx.stroke();
          }
        });
        setSubmitted(true);
      } catch (e) {
        setOutput("Parse error: " + e);
      }
    } else {
      setOutput(res.stderr || res.stdout || "No turtle output");
    }
    setRunning(false);
  };

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round 5 · Turtle Graphics</span>
        {loadError && <span className={styles.errorTag}>⚠️ {loadError}</span>}
        {!loadError && !ready && <span className={styles.loadingTag}>⏳ Loading Python…</span>}
        {ready && <span className={styles.readyTag}>🐍 Python Ready</span>}
      </div>
      <div className={styles.codingLayout}>
        <div className={styles.problemPane}>
          <h3 className={styles.problemTitle}>{TURTLE_ROUND5.title}</h3>
          <p className={styles.problemDesc}>{TURTLE_ROUND5.description}</p>
          <canvas ref={canvasRef} width={280} height={280} className={styles.turtleCanvas} />
        </div>
        <div className={styles.editorPane}>
          <textarea
            className={styles.codeEditor}
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            rows={14}
          />
          <button className={styles.runBtn} onClick={handleRun} disabled={!ready || running}>
            {running ? "▶ Running…" : ready ? "▶ Run & Draw" : "⏳ Loading…"}
          </button>
          {output && (
            <div className={styles.outputBox}>
              <div className={styles.outputLabel}>Output</div>
              <pre>{output}</pre>
            </div>
          )}
        </div>
      </div>
      {submitted && (
        <div className={styles.roundDone} style={{ marginTop: 20 }}>
          <div className={styles.doneIcon}>🎨</div>
          <h3>Star drawn! Nice work!</h3>
          <p className={styles.clueBox}>{turtleClue}</p>
          <button className={styles.primaryBtn} onClick={onComplete}>🏁 Finish PyHunt!</button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════ */
export default function PyHuntPage() {
  const router = useRouter();
  const cfg = usePyHuntConfig();
  const [round, setRound] = useState(0); // 0-indexed: 0=MCQ, 1=Jumble, 2=Coding3, 3=Coding4, 4=Turtle
  const [finished, setFinished] = useState(false);
  const [studentName, setStudentName] = useState("Student");

  useEffect(() => {
    const raw = sessionStorage.getItem("exam_student");
    if (raw) {
      try { setStudentName(JSON.parse(raw).name || "Student"); } catch {}
    }
  }, []);

  const next = useCallback(() => {
    if (round < 4) setRound(r => r + 1);
    else setFinished(true);
  }, [round]);

  if (finished) {
    return (
      <div className={styles.page}>
        <Stars />
        <div className={styles.nebula1} /><div className={styles.nebula2} />
        <div className={styles.finishScreen}>
          <div className={styles.finishEmoji}>🏆</div>
          <h1 className={styles.finishTitle}>PyHunt Complete!</h1>
          <p className={styles.finishSub}>You conquered all 5 rounds, {studentName}!</p>
          <p className={styles.clueBox}>{turtleClue}</p>
          <button className={styles.primaryBtn} onClick={() => router.push("/dashboard")}>← Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Stars />
      <div className={styles.nebula1} /><div className={styles.nebula2} />

      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🐍</span>
          <div>
            <div className={styles.logoTitle}>PyHunt</div>
            <div className={styles.logoSub}>Python Treasure Hunt</div>
          </div>
        </div>
        <RoundProgress current={round} total={5} />
        <div className={styles.headerRight}>
          <span className={styles.studentBadge}>👤 {studentName}</span>
        </div>
      </header>

      <main className={styles.content}>
        {round === 0 && <RoundMCQ questions={cfg.mcqQuestions} clue={cfg.clues[0]} onComplete={next} />}
        {round === 1 && <RoundJumble problem={cfg.jumbleProblem} clue={cfg.clues[1]} onComplete={next} />}
        {round === 2 && <RoundCoding problem={cfg.round3} roundNum={3} clue={cfg.clues[2]} onComplete={next} />}
        {round === 3 && <RoundCoding problem={cfg.round4} roundNum={4} clue={cfg.clues[3]} onComplete={next} />}
        {round === 4 && <RoundTurtle clue={cfg.clues[4]} onComplete={next} />}
      </main>
    </div>
  );
}
