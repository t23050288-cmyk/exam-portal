"use client";
/**
 * PyHuntAdminTab.tsx
 * Admin panel for managing PyHunt questions, problems, and clues.
 * All data stored in localStorage (no DB needed — facilitator device).
 */
import React, { useState, useEffect } from "react";

interface MCQOption { label: string; text: string; }
interface MCQQuestion { id: string; question: string; options: MCQOption[]; correct: string; explanation: string; }
interface CodingProblem { title: string; description: string; starterCode: string; testCases: { input: string; expected: string; }[]; }
interface JumbleProblem { title: string; description: string; lines: string[]; }
interface PyHuntConfig {
  mcqQuestions: MCQQuestion[];
  jumbleProblem: JumbleProblem;
  round3: CodingProblem;
  round4: CodingProblem;
  clues: string[];
}

const DEFAULT_CONFIG: PyHuntConfig = {
  mcqQuestions: [
    { id: "q1", question: "What is the output of: print(type([]).__name__)?", options: [{label:"A",text:"list"},{label:"B",text:"array"},{label:"C",text:"List"},{label:"D",text:"tuple"}], correct: "A", explanation: "type([]) returns <class 'list'>, and .__name__ gives 'list'." },
    { id: "q2", question: "Which keyword defines a generator function?", options: [{label:"A",text:"return"},{label:"B",text:"async"},{label:"C",text:"yield"},{label:"D",text:"lambda"}], correct: "C", explanation: "yield makes a function a generator." },
    { id: "q3", question: "What does list(range(2, 10, 3)) produce?", options: [{label:"A",text:"[2, 5, 8]"},{label:"B",text:"[2, 4, 6, 8]"},{label:"C",text:"[3, 6, 9]"},{label:"D",text:"[2, 5, 8, 11]"}], correct: "A", explanation: "range(2,10,3) → 2, 5, 8." },
    { id: "q4", question: "What is the result of 'hello'[::-1]?", options: [{label:"A",text:"hello"},{label:"B",text:"olleh"},{label:"C",text:"Error"},{label:"D",text:"h"}], correct: "B", explanation: "[::-1] reverses a string." },
    { id: "q5", question: "Which creates a set in Python?", options: [{label:"A",text:"{}"},{label:"B",text:"set()"},{label:"C",text:"[]"},{label:"D",text:"()"}], correct: "B", explanation: "{} creates an empty dict. set() creates an empty set." },
  ],
  jumbleProblem: {
    title: "Fix the Fibonacci!",
    description: "Drag lines into the correct order so the function returns the nth Fibonacci number.",
    lines: ["def fibonacci(n):","    if n <= 1:","        return n","    return fibonacci(n-1) + fibonacci(n-2)","","print(fibonacci(7))  # should print 13"],
  },
  round3: {
    title: "Palindrome Checker",
    description: "Write a function `is_palindrome(s: str) -> bool` that returns True if the string is a palindrome (case-insensitive, ignore spaces), False otherwise.",
    starterCode: "def is_palindrome(s: str) -> bool:\n    # Your code here\n    pass\n\nprint(is_palindrome(\"racecar\"))   # True\nprint(is_palindrome(\"Hello\"))     # False\n",
    testCases: [{input:"racecar",expected:"True"},{input:"Hello",expected:"False"},{input:"A man a plan a canal Panama",expected:"True"},{input:"abcba",expected:"True"}],
  },
  round4: {
    title: "FizzBuzz Remix",
    description: "Write a function fizzbuzz(n: int) -> list that returns a list of strings 1 to n.",
    starterCode: "def fizzbuzz(n: int) -> list:\n    # Your code here\n    pass\n\nresult = fizzbuzz(15)\nprint(result)\n",
    testCases: [{input:"5",expected:"['1', '2', 'Fizz', '4', 'Buzz']"},{input:"15",expected:"['1', '2', 'Fizz', '4', 'Buzz', 'Fizz', '7', '8', 'Fizz', 'Buzz', '11', 'Fizz', '13', '14', 'FizzBuzz']"}],
  },
  clues: [
    "🗝️ Clue 1: Head to the room where knowledge is stored — find the book with a blue spine on the third shelf.",
    "🗝️ Clue 2: The whiteboard at the back of Lab-2 holds your next puzzle. Look for the sticky note marked 'PY-2'.",
    "🗝️ Clue 3: Walk to the corridor near Room 301. There's a locker with the number '42'.",
    "🗝️ Clue 4: Return to the starting room. Under the facilitator's desk there is an envelope.",
    "🎉 Congratulations! You've completed all 5 rounds of PyHunt! Show this screen to the facilitator.",
  ],
};

const STORAGE_KEY = "nexus_pyhunt_config";

function loadConfig(): PyHuntConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? { ...DEFAULT_CONFIG, ...JSON.parse(s) } : DEFAULT_CONFIG;
  } catch { return DEFAULT_CONFIG; }
}
function saveConfig(cfg: PyHuntConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

const s: Record<string, React.CSSProperties> = {
  wrap: { padding: 24, color: "#c8daf0", fontFamily: "Inter, sans-serif" },
  h2: { fontSize: 22, fontWeight: 900, color: "#d0f0ff", marginBottom: 4, display: "flex", alignItems: "center", gap: 10 },
  sub: { fontSize: 12, color: "#3a5578", marginBottom: 28 },
  tabs: { display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" as const },
  tab: { padding: "8px 18px", borderRadius: 10, border: "1.5px solid rgba(0,220,255,0.15)", background: "rgba(0,220,255,0.04)", color: "#4a7090", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  tabActive: { background: "rgba(0,220,255,0.14)", borderColor: "rgba(0,220,255,0.4)", color: "#00dcff" },
  card: { background: "rgba(8,14,35,0.85)", border: "1px solid rgba(0,220,255,0.1)", borderRadius: 16, padding: 22, marginBottom: 16 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: "#3a5578", marginBottom: 6, display: "block" },
  input: { width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,220,255,0.12)", borderRadius: 8, padding: "10px 14px", color: "#c8daf0", fontSize: 13, fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box" as const, marginBottom: 12 },
  textarea: { width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,220,255,0.12)", borderRadius: 8, padding: "10px 14px", color: "#c8daf0", fontSize: 12, fontFamily: "monospace", outline: "none", boxSizing: "border-box" as const, resize: "vertical" as const, marginBottom: 12 },
  btn: { padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#00dcff,#0066cc)", color: "#000", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  btnDanger: { padding: "8px 16px", borderRadius: 8, border: "1.5px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  btnAdd: { padding: "8px 16px", borderRadius: 8, border: "1.5px solid rgba(0,220,255,0.2)", background: "rgba(0,220,255,0.06)", color: "#00dcff", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  saved: { color: "#10b981", fontSize: 13, fontWeight: 700, marginLeft: 12 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  tcRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8 },
};

type SubTab = "mcq" | "jumble" | "round3" | "round4" | "clues";

export default function PyHuntAdminTab() {
  const [cfg, setCfg] = useState<PyHuntConfig>(DEFAULT_CONFIG);
  const [subTab, setSubTab] = useState<SubTab>("mcq");
  const [saved, setSaved] = useState(false);
  const [editMCQ, setEditMCQ] = useState<number | null>(null);

  useEffect(() => { setCfg(loadConfig()); }, []);

  const handleSave = () => {
    saveConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateMCQ = (idx: number, field: keyof MCQQuestion, val: any) => {
    setCfg(c => {
      const qs = [...c.mcqQuestions];
      qs[idx] = { ...qs[idx], [field]: val };
      return { ...c, mcqQuestions: qs };
    });
  };

  const updateMCQOption = (qi: number, oi: number, val: string) => {
    setCfg(c => {
      const qs = [...c.mcqQuestions];
      const opts = [...qs[qi].options];
      opts[oi] = { ...opts[oi], text: val };
      qs[qi] = { ...qs[qi], options: opts };
      return { ...c, mcqQuestions: qs };
    });
  };

  const addMCQ = () => {
    const newQ: MCQQuestion = { id: `q${Date.now()}`, question: "New question?", options: [{label:"A",text:"Option A"},{label:"B",text:"Option B"},{label:"C",text:"Option C"},{label:"D",text:"Option D"}], correct: "A", explanation: "" };
    setCfg(c => ({ ...c, mcqQuestions: [...c.mcqQuestions, newQ] }));
    setEditMCQ(cfg.mcqQuestions.length);
  };

  const deleteMCQ = (idx: number) => {
    setCfg(c => ({ ...c, mcqQuestions: c.mcqQuestions.filter((_, i) => i !== idx) }));
    setEditMCQ(null);
  };

  const updateClue = (idx: number, val: string) => {
    setCfg(c => { const cl = [...c.clues]; cl[idx] = val; return { ...c, clues: cl }; });
  };

  const updateTC = (round: "round3" | "round4", idx: number, field: "input" | "expected", val: string) => {
    setCfg(c => {
      const tcs = [...c[round].testCases];
      tcs[idx] = { ...tcs[idx], [field]: val };
      return { ...c, [round]: { ...c[round], testCases: tcs } };
    });
  };

  const addTC = (round: "round3" | "round4") => {
    setCfg(c => ({ ...c, [round]: { ...c[round], testCases: [...c[round].testCases, { input: "", expected: "" }] } }));
  };

  const deleteTC = (round: "round3" | "round4", idx: number) => {
    setCfg(c => ({ ...c, [round]: { ...c[round], testCases: c[round].testCases.filter((_,i)=>i!==idx) } }));
  };

  const SUBTABS: { id: SubTab; label: string }[] = [
    { id: "mcq", label: "📝 MCQ Questions" },
    { id: "jumble", label: "🔀 Code Jumble" },
    { id: "round3", label: "🐍 Round 3 Coding" },
    { id: "round4", label: "🔢 Round 4 Coding" },
    { id: "clues", label: "🗝️ Clues" },
  ];

  return (
    <div style={s.wrap}>
      <div style={s.h2}>🐍 PyHunt Configuration</div>
      <div style={s.sub}>Edit questions, problems, and clues. Changes apply immediately for students on this device.</div>

      <div style={s.tabs}>
        {SUBTABS.map(t => (
          <button key={t.id} style={subTab === t.id ? { ...s.tab, ...s.tabActive } : s.tab} onClick={() => setSubTab(t.id)}>{t.label}</button>
        ))}
        <button style={{ ...s.btn, marginLeft: "auto" }} onClick={handleSave}>💾 Save Changes</button>
        {saved && <span style={s.saved}>✓ Saved!</span>}
      </div>

      {/* MCQ TAB */}
      {subTab === "mcq" && (
        <div>
          {cfg.mcqQuestions.map((q, qi) => (
            <div key={q.id} style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ color: "#00dcff", fontWeight: 700, fontSize: 13 }}>Q{qi + 1}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={s.btnAdd} onClick={() => setEditMCQ(editMCQ === qi ? null : qi)}>{editMCQ === qi ? "▲ Collapse" : "✏️ Edit"}</button>
                  <button style={s.btnDanger} onClick={() => deleteMCQ(qi)}>✕ Delete</button>
                </div>
              </div>
              <div style={{ fontSize: 14, color: "#a0c0e0", marginBottom: editMCQ === qi ? 12 : 0 }}>{q.question}</div>
              {editMCQ === qi && (
                <>
                  <label style={s.label}>Question</label>
                  <textarea style={s.textarea} rows={2} value={q.question} onChange={e => updateMCQ(qi, "question", e.target.value)} />
                  <label style={s.label}>Options</label>
                  {q.options.map((opt, oi) => (
                    <div key={opt.label} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span style={{ color: "#00dcff", fontWeight: 700, width: 20, flexShrink: 0 }}>{opt.label}.</span>
                      <input style={{ ...s.input, margin: 0, flex: 1 }} value={opt.text} onChange={e => updateMCQOption(qi, oi, e.target.value)} />
                    </div>
                  ))}
                  <label style={s.label}>Correct Answer</label>
                  <select style={{ ...s.input, width: "auto" }} value={q.correct} onChange={e => updateMCQ(qi, "correct", e.target.value)}>
                    {q.options.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                  </select>
                  <label style={s.label}>Explanation</label>
                  <input style={s.input} value={q.explanation} onChange={e => updateMCQ(qi, "explanation", e.target.value)} />
                </>
              )}
            </div>
          ))}
          <button style={s.btnAdd} onClick={addMCQ}>+ Add Question</button>
        </div>
      )}

      {/* JUMBLE TAB */}
      {subTab === "jumble" && (
        <div style={s.card}>
          <label style={s.label}>Title</label>
          <input style={s.input} value={cfg.jumbleProblem.title} onChange={e => setCfg(c => ({ ...c, jumbleProblem: { ...c.jumbleProblem, title: e.target.value } }))} />
          <label style={s.label}>Description</label>
          <textarea style={s.textarea} rows={2} value={cfg.jumbleProblem.description} onChange={e => setCfg(c => ({ ...c, jumbleProblem: { ...c.jumbleProblem, description: e.target.value } }))} />
          <label style={s.label}>Code Lines (correct order — one per line)</label>
          <textarea
            style={s.textarea} rows={8}
            value={cfg.jumbleProblem.lines.join("\n")}
            onChange={e => setCfg(c => ({ ...c, jumbleProblem: { ...c.jumbleProblem, lines: e.target.value.split("\n") } }))}
          />
          <div style={{ fontSize: 12, color: "#3a5578" }}>Students will see these lines in a random order and drag to reorder them.</div>
        </div>
      )}

      {/* ROUND 3 & 4 CODING */}
      {(subTab === "round3" || subTab === "round4") && (
        <div>
          <div style={s.card}>
            <label style={s.label}>Problem Title</label>
            <input style={s.input} value={cfg[subTab].title} onChange={e => setCfg(c => ({ ...c, [subTab]: { ...c[subTab], title: e.target.value } }))} />
            <label style={s.label}>Description</label>
            <textarea style={s.textarea} rows={3} value={cfg[subTab].description} onChange={e => setCfg(c => ({ ...c, [subTab]: { ...c[subTab], description: e.target.value } }))} />
            <label style={s.label}>Starter Code</label>
            <textarea style={{ ...s.textarea, minHeight: 160 }} rows={8} value={cfg[subTab].starterCode} onChange={e => setCfg(c => ({ ...c, [subTab]: { ...c[subTab], starterCode: e.target.value } }))} />
          </div>
          <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ color: "#00dcff", fontWeight: 700, fontSize: 13 }}>Test Cases</span>
              <button style={s.btnAdd} onClick={() => addTC(subTab)}>+ Add Test</button>
            </div>
            {cfg[subTab].testCases.map((tc, i) => (
              <div key={i} style={s.tcRow}>
                <input style={{ ...s.input, margin: 0, flex: 1 }} placeholder="Input" value={tc.input} onChange={e => updateTC(subTab, i, "input", e.target.value)} />
                <span style={{ color: "#3a5578", flexShrink: 0 }}>→</span>
                <input style={{ ...s.input, margin: 0, flex: 1 }} placeholder="Expected output" value={tc.expected} onChange={e => updateTC(subTab, i, "expected", e.target.value)} />
                <button style={s.btnDanger} onClick={() => deleteTC(subTab, i)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CLUES TAB */}
      {subTab === "clues" && (
        <div>
          {cfg.clues.map((clue, i) => (
            <div key={i} style={s.card}>
              <label style={s.label}>After Round {i + 1}</label>
              <textarea style={s.textarea} rows={2} value={clue} onChange={e => updateClue(i, e.target.value)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
