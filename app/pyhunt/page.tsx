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
  lines: string[]; /* correct order */
}

/* ═══════════════════════════════════════════════
   ROUND DATA  (admin can later move to DB)
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
   PYODIDE HOOK
═══════════════════════════════════════════════ */
function usePyodide() {
  const workerRef = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);
  const cbRef = useRef<Map<string, (r: any) => void>>(new Map());

  useEffect(() => {
    const w = new Worker("/pyodide-worker.js");
    workerRef.current = w;
    w.onmessage = (e) => {
      const { id, type } = e.data;
      if (type === "ready") { setReady(true); return; }
      const cb = cbRef.current.get(id);
      if (cb) { cb(e.data); cbRef.current.delete(id); }
    };
    return () => w.terminate();
  }, []);

  const runCode = useCallback((code: string, testInput = ""): Promise<any> => {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      cbRef.current.set(id, resolve);
      workerRef.current?.postMessage({ id, type: "run", code, stdin: testInput });
    });
  }, []);

  return { ready, runCode };
}

/* ═══════════════════════════════════════════════
   COMPONENTS
═══════════════════════════════════════════════ */

/** Stars background */
function Stars() {
  return <div className={styles.stars} />;
}

/** Progress bar */
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

/** MCQ Round */
function RoundMCQ({ onComplete }: { onComplete: () => void }) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const q = MCQ_QUESTIONS[idx];

  const handleCheck = () => {
    if (!selected) return;
    setChecked(true);
    if (selected === q.correct) setScore(s => s + 1);
  };

  const handleNext = () => {
    if (idx + 1 < MCQ_QUESTIONS.length) {
      setIdx(i => i + 1);
      setSelected(null);
      setChecked(false);
    } else {
      setDone(true);
    }
  };

  if (done) {
    return (
      <div className={styles.roundDone}>
        <div className={styles.doneIcon}>🎯</div>
        <h2>Round 1 Complete!</h2>
        <p className={styles.scoreText}>Score: <strong>{score}/{MCQ_QUESTIONS.length}</strong></p>
        <p className={styles.clueBox}>{ROUND_CLUES[0]}</p>
        <button className={styles.primaryBtn} onClick={onComplete}>I found the clue → Round 2</button>
      </div>
    );
  }

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round 1 · MCQ</span>
        <span className={styles.questionCount}>Q {idx + 1} / {MCQ_QUESTIONS.length}</span>
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
              <button key={opt.label} className={cls}
                disabled={checked}
                onClick={() => setSelected(opt.label)}>
                <span className={styles.optionLabel}>{opt.label}</span>
                {opt.text}
              </button>
            );
          })}
        </div>
        {checked && q.explanation && (
          <div className={styles.explanation}>💡 {q.explanation}</div>
        )}
        {!checked
          ? <button className={styles.primaryBtn} disabled={!selected} onClick={handleCheck}>Check Answer</button>
          : <button className={styles.primaryBtn} onClick={handleNext}>
              {idx + 1 < MCQ_QUESTIONS.length ? "Next Question →" : "Finish Round 1 →"}
            </button>
        }
      </div>
    </div>
  );
}

/** Jumble Round */
function RoundJumble({ onComplete }: { onComplete: () => void }) {
  const correctLines = JUMBLE_PROBLEM.lines;
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
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round 2 · Code Jumble</span>
      </div>
      <div className={styles.questionCard}>
        <h3 className={styles.problemTitle}>{JUMBLE_PROBLEM.title}</h3>
        <p className={styles.problemDesc}>{JUMBLE_PROBLEM.description}</p>

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
            <p className={styles.clueBox}>{ROUND_CLUES[1]}</p>
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

/** Coding Round (Round 3 or 4) */
function RoundCoding({
  problem, roundNum, clue, onComplete,
}: {
  problem: CodingProblem; roundNum: number; clue: string; onComplete: () => void;
}) {
  const { ready, runCode } = usePyodide();
  const [code, setCode] = useState(problem.starterCode);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [passed, setPassed] = useState(false);
  const [results, setResults] = useState<{ label: string; ok: boolean; got: string; expected: string }[]>([]);

  const handleRun = async () => {
    if (!ready) return;
    setRunning(true);
    setOutput("");

    // Run all test cases
    const testResults: typeof results = [];
    let allPassed = true;

    for (const tc of problem.testCases) {
      // Inject test call based on function name
      const fnMatch = code.match(/^def (\w+)\(/m);
      const fnName = fnMatch ? fnMatch[1] : null;
      let runnable = code;
      if (fnName) {
        // Check if test input is a number or string
        const inputVal = isNaN(Number(tc.input)) ? `"${tc.input}"` : tc.input;
        runnable += `\n_result = str(${fnName}(${inputVal}))\nprint("TESTRESULT:" + _result)`;
      }

      const res = await runCode(runnable, tc.input);
      const stdout: string = res.stdout || "";
      const lines = stdout.split("\n");
      const resultLine = lines.find((l: string) => l.startsWith("TESTRESULT:"));
      const got = resultLine ? resultLine.replace("TESTRESULT:", "").trim() : stdout.trim();
      const ok = got === tc.expected;
      if (!ok) allPassed = false;
      testResults.push({ label: tc.input, ok, got, expected: tc.expected });
    }

    // Also just run the code for stdout
    const fullRes = await runCode(code);
    setOutput(fullRes.stdout || fullRes.stderr || "");
    setResults(testResults);
    if (allPassed) setPassed(true);
    setRunning(false);
  };

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round {roundNum} · Python Coding</span>
        {!ready && <span className={styles.loadingTag}>⏳ Loading Python…</span>}
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
          />
          <button className={styles.runBtn} onClick={handleRun} disabled={!ready || running}>
            {running ? "▶ Running…" : "▶ Run Code"}
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

/** Turtle Round */
function RoundTurtle({ onComplete }: { onComplete: () => void }) {
  const { ready, runCode } = usePyodide();
  const [code, setCode] = useState(TURTLE_ROUND5.starterCode);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // We use a simplified turtle renderer via canvas
  const handleRun = async () => {
    if (!ready) return;
    setRunning(true);

    // Intercept turtle calls — we parse the output and draw on canvas
    const shimCode = `
import sys

class _TurtleShim:
    def __init__(self):
        self.x = 0.0
        self.y = 0.0
        self.angle = 0.0
        self.pen = True
        self.moves = []
    def speed(self, s): pass
    def penup(self): self.pen = False
    def pendown(self): self.pen = True
    def forward(self, d):
        import math
        nx = self.x + d * math.cos(math.radians(self.angle))
        ny = self.y + d * math.sin(math.radians(self.angle))
        if self.pen:
            self.moves.append(('line', self.x, self.y, nx, ny))
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
            self.forward(2 * math.pi * abs(r) / 36)
            self.right(10 if r > 0 else -10)
    def color(self, *a): pass
    def fillcolor(self, *a): pass
    def pencolor(self, *a): pass
    def begin_fill(self): pass
    def end_fill(self): pass
    def hideturtle(self): pass
    def showturtle(self): pass
    def pensize(self, s): pass
    def width(self, s): pass
    def reset(self): self.__init__()
    def clear(self): self.moves = []
    def home(self): self.x=0;self.y=0;self.angle=0
    def position(self): return (self.x, self.y)
    def heading(self): return self.angle

class _TurtleModule:
    def __init__(self):
        self._t = _TurtleShim()
    def Turtle(self): return _TurtleShim()
    def done(self): pass
    def mainloop(self): pass
    def speed(self,s): self._t.speed(s)

sys.modules['turtle'] = _TurtleModule()

${code.replace(/turtle\.done\(\)/g, "pass").replace(/turtle\.mainloop\(\)/g, "pass")}

# Collect moves
_all_moves = []
import sys as _sys
_tm = _sys.modules['turtle']
_inst = None
# find turtle instances in locals/globals
for _k, _v in list(globals().items()):
    if hasattr(_v, 'moves'):
        _all_moves.extend(_v.moves)
if not _all_moves and hasattr(_tm, '_t'):
    _all_moves = _tm._t.moves

print("TURTLEMOVES:" + str(_all_moves))
`;
    const res = await runCode(shimCode);
    const stdout: string = res.stdout || "";
    const movesLine = stdout.split("\n").find((l: string) => l.startsWith("TURTLEMOVES:"));
    if (movesLine && canvasRef.current) {
      try {
        const rawMoves = movesLine.replace("TURTLEMOVES:", "").trim();
        // Parse python tuple list safely
        const moves: any[] = eval(rawMoves.replace(/\(/g, "[").replace(/\)/g, "]").replace(/'/g, '"'));
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d")!;
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.strokeStyle = "#a0c8ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        moves.forEach((m: any) => {
          if (m[0] === "line") {
            const x1 = W/2 + m[1], y1 = H/2 - m[2];
            const x2 = W/2 + m[3], y2 = H/2 - m[4];
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
          }
        });
        ctx.stroke();
        setOutput(`✓ Turtle drew ${moves.length} line segments.`);
      } catch (e) {
        setOutput(res.stderr || "Could not render turtle output.");
      }
    } else {
      setOutput(res.stderr || res.stdout || "No turtle output.");
    }
    setRunning(false);
  };

  return (
    <div className={styles.roundWrap}>
      <div className={styles.roundHeader}>
        <span className={styles.roundTag}>Round 5 · Turtle Graphics</span>
        {!ready && <span className={styles.loadingTag}>⏳ Loading Python…</span>}
        {ready && <span className={styles.readyTag}>🐢 Turtle Ready</span>}
      </div>
      <div className={styles.codingLayout}>
        <div className={styles.problemPane}>
          <h3 className={styles.problemTitle}>{TURTLE_ROUND5.title}</h3>
          <p className={styles.problemDesc}>{TURTLE_ROUND5.description}</p>
          <div className={styles.turtleCanvas}>
            <canvas ref={canvasRef} width={300} height={300} className={styles.canvas} />
          </div>
          {output && <div className={styles.outputBox} style={{ marginTop: 8 }}><pre>{output}</pre></div>}
        </div>
        <div className={styles.editorPane}>
          <textarea
            className={styles.codeEditor}
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
          />
          <button className={styles.runBtn} onClick={handleRun} disabled={!ready || running}>
            {running ? "🐢 Drawing…" : "🐢 Run Turtle"}
          </button>
          {!submitted && (
            <button className={styles.primaryBtn} style={{ marginTop: 10 }} onClick={() => setSubmitted(true)}>
              Submit & Finish
            </button>
          )}
        </div>
      </div>

      {submitted && (
        <div className={styles.roundDone} style={{ marginTop: 20 }}>
          <div className={styles.doneIcon}>🏆</div>
          <h2>PyHunt Complete!</h2>
          <p>{ROUND_CLUES[4]}</p>
          <button className={styles.primaryBtn} onClick={onComplete}>🎉 Finish</button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════ */
const STORAGE_KEY = "pyhunt_round";

export default function PyHuntPage() {
  const router = useRouter();
  const [round, setRound] = useState<number>(-1); // -1 = landing
  const [finished, setFinished] = useState(false);
  const [studentName, setStudentName] = useState("Contestant");

  useEffect(() => {
    // Restore round from session (so F5 doesn't reset)
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved !== null) setRound(parseInt(saved));
    // Get student name
    try {
      const s = JSON.parse(sessionStorage.getItem("exam_student") || "{}");
      if (s.name) setStudentName(s.name.split(" ")[0]);
    } catch { /* empty */ }
  }, []);

  const goToRound = (r: number) => {
    setRound(r);
    sessionStorage.setItem(STORAGE_KEY, String(r));
  };

  const handleComplete = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setFinished(true);
  };

  const ROUNDS = [
    <RoundMCQ key="r1" onComplete={() => goToRound(1)} />,
    <RoundJumble key="r2" onComplete={() => goToRound(2)} />,
    <RoundCoding key="r3" problem={CODING_ROUND3} roundNum={3} clue={ROUND_CLUES[2]} onComplete={() => goToRound(3)} />,
    <RoundCoding key="r4" problem={CODING_ROUND4} roundNum={4} clue={ROUND_CLUES[3]} onComplete={() => goToRound(4)} />,
    <RoundTurtle key="r5" onComplete={handleComplete} />,
  ];

  return (
    <div className={styles.page}>
      <Stars />
      <div className={styles.nebula1} />
      <div className={styles.nebula2} />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🐍</span>
          <div>
            <div className={styles.logoTitle}>PyHunt</div>
            <div className={styles.logoSub}>Python Treasure Hunt</div>
          </div>
        </div>
        {round >= 0 && !finished && (
          <RoundProgress current={round} total={5} />
        )}
        <div className={styles.headerRight}>
          <span className={styles.studentBadge}>👤 {studentName}</span>
        </div>
      </header>

      <main className={styles.main}>

        {/* Landing */}
        {round === -1 && !finished && (
          <div className={styles.landing}>
            <div className={styles.landingBadge}>🔐 5-Round Challenge</div>
            <h1 className={styles.landingTitle}>Welcome to PyHunt!</h1>
            <p className={styles.landingDesc}>
              A Python treasure hunt with 5 progressive rounds. Solve each challenge to unlock a
              physical clue that leads you to the next problem.
            </p>
            <div className={styles.roundsPreview}>
              {[
                { num: 1, icon: "📋", name: "MCQ", desc: "5 Python multiple-choice questions" },
                { num: 2, icon: "🔀", name: "Code Jumble", desc: "Rearrange jumbled code lines" },
                { num: 3, icon: "💻", name: "Coding — Easy", desc: "Write a Python function" },
                { num: 4, icon: "⚡", name: "Coding — Medium", desc: "Another Python challenge" },
                { num: 5, icon: "🐢", name: "Turtle", desc: "Draw with Python turtle" },
              ].map(r => (
                <div key={r.num} className={styles.roundPreviewCard}>
                  <span className={styles.roundPreviewIcon}>{r.icon}</span>
                  <div>
                    <div className={styles.roundPreviewName}>Round {r.num}: {r.name}</div>
                    <div className={styles.roundPreviewDesc}>{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button className={styles.startBtn} onClick={() => goToRound(0)}>
              🚀 Start PyHunt
            </button>
          </div>
        )}

        {/* Active rounds */}
        {round >= 0 && round < 5 && !finished && ROUNDS[round]}

        {/* Finished */}
        {finished && (
          <div className={styles.finishedWrap}>
            <div className={styles.trophyAnim}>🏆</div>
            <h1 className={styles.finishedTitle}>You Completed PyHunt!</h1>
            <p className={styles.finishedSub}>All 5 rounds completed. Show this screen to your facilitator.</p>
            <div className={styles.finishedBadge}>
              <div>🐍 PyHunt Champion</div>
              <div className={styles.finishedName}>{studentName}</div>
            </div>
            <button className={styles.primaryBtn} onClick={() => router.push("/dashboard")}>
              ← Back to Dashboard
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
