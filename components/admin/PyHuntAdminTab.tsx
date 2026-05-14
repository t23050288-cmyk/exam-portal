"use client";
/**
 * PyHuntAdminTab.tsx  v2
 * Full admin control:
 *  - MCQ questions (add / edit / delete)
 *  - Code Jumble problem
 *  - Round 3 & 4 coding problems + test cases
 *  - Clue text + unlock code for each round
 *  - Finish message
 */
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { adminFetch } from "@/lib/api";
import { RoundCoding } from "@/app/pyhunt/page";

/* ─── Types ─────────────────────────────────── */
interface MCQOption { label: string; text: string; }
interface MCQQuestion { id: string; question: string; options: MCQOption[]; correct: string; explanation: string; }
interface JumbleProblem { title: string; description: string; lines: string[]; }
interface CodingProblem { 
  title: string; 
  description: string; 
  hint?: string; 
  starterCode: string; 
  testCases: {input:string;expected:string}[]; 
  imageUrl?: string;
  targetOutput?: string;
}
interface ClueConfig { clueText: string; unlockCode: string; }
interface TurtleProblem { title: string; description: string; starterCode: string; }
interface PyHuntConfig {
  competitionName: string;
  startTime: string;
  entryAccessCode: string;
  mcqQuestions: MCQQuestion[];
  jumbleProblem: JumbleProblem;
  jumbleProblemB: JumbleProblem;
  round3: CodingProblem;
  round3b: CodingProblem;        // Round 3 Part 2
  round4: CodingProblem;
  round4UnlockCode: string;
  round1Clues: ClueConfig[];
  round2Clues: ClueConfig[];
  round3Clues: ClueConfig[];
  round4Clues: ClueConfig[];
  finishMessage: string;
  isActive: boolean;
}

/* ─── Defaults ───────────────────────────────── */
const DEFAULT: PyHuntConfig = {
  competitionName: "PyHunt 2024",
  startTime: new Date().toISOString().slice(0, 16),
  entryAccessCode: "NEXUS24",
  mcqQuestions: [
    { id:"q1", question:"What is the output of: print(type([]).__name__)?", options:[{label:"A",text:"list"},{label:"B",text:"array"},{label:"C",text:"List"},{label:"D",text:"tuple"}], correct:"A", explanation:"type([]) → <class 'list'>, .__name__ → 'list'." },
    { id:"q2", question:"Which keyword defines a generator function?", options:[{label:"A",text:"return"},{label:"B",text:"async"},{label:"C",text:"yield"},{label:"D",text:"lambda"}], correct:"C", explanation:"yield makes a function a generator." },
  ],
  jumbleProblem: { title:"Fibonacci! (Round 2 Part 1)", description:"Drag lines into correct order so the function prints 13.", lines:["def fibonacci(n):","    if n <= 1:","        return n","    return fibonacci(n-1) + fibonacci(n-2)","","print(fibonacci(7))  # should print 13"] },
  jumbleProblemB: { title:"Factorial! (Round 2 Part 2)", description:"Drag lines into correct order so the function prints 120.", lines:["def factorial(n):","    if n <= 1:","        return 1","    return n * factorial(n-1)","","print(factorial(5))  # should print 120"] },
  round3: { title:"Palindrome Checker (Part 1)", description:"Write is_palindrome(s) → bool", hint: "", starterCode:"def is_palindrome(s: str) -> bool:\n    pass\n", testCases:[{input:"racecar",expected:"True"},{input:"Hello",expected:"False"}] },
  round3b: { title:"Count Vowels (Part 2)", description:"Write count_vowels(s) → int", hint: "", starterCode:"def count_vowels(s: str) -> int:\n    pass\n", testCases:[{input:"hello",expected:"2"}] },
  round4: { title:"FizzBuzz Remix (Round 4)", description:"Write fizzbuzz(n) → list", hint: "", starterCode:"def fizzbuzz(n: int) -> list:\n    pass\n\nprint(fizzbuzz(15))\n", testCases:[{input:"5",expected:"['1', '2', 'Fizz', '4', 'Buzz']"}] },
  round1Clues: [
    { clueText:"🗝️ Round 1 Complete! Find your next code in the Library.", unlockCode:"LIBRARY" }
  ],
  round2Clues: [
    { clueText:"🗝️ Round 2 Complete! Find your next code in Lab-2.", unlockCode:"LAB2" }
  ],
  round3Clues: [
    { clueText:"🗝️ Round 3 Complete! Find your next code in Locker 301.", unlockCode:"LOCKER301" }
  ],
  round4Clues: [
    { clueText:"🗝️ Round 4 Complete! Hunt Over! Enter code to see your Results.", unlockCode:"FINISH" }
  ],
  round4UnlockCode: "FINISH",
  finishMessage:"🏆 Congratulations on completion of 4th round! Now proceed to the 5th offline round.",
  isActive: true,
};

const STORAGE_KEY = "nexus_pyhunt_config_v2";

async function loadCfgAsync(): Promise<PyHuntConfig> {
  // Always load from backend DB — centralized, works across all devices
  try {
    const json = await adminFetch<any>("/admin/pyhunt/config");
    if (json.ok && json.config) {
      // Sync is_active from top-level response if provided
      const merged = { ...DEFAULT, ...json.config };
      if (json.is_active !== undefined) merged.isActive = json.is_active;
      return merged;
    }
  } catch (e) {
    console.warn("Backend config load failed:", e);
  }
  return DEFAULT;
}

async function saveCfgAsync(c: PyHuntConfig) {
  const str = JSON.stringify(c);
  // Save to backend DB — all devices see the update
  await adminFetch("/admin/pyhunt/config/save", {
    method: "POST",
    body: JSON.stringify({ config: str }),
  });
}

/* ─── Styles ─────────────────────────────────── */
const $ = {
  wrap: { padding:"24px 32px", color:"#D8EAF2", fontFamily:"Inter,sans-serif", maxWidth:1000, background:"transparent" } as React.CSSProperties,
  topRow: { display:"flex", alignItems:"center", gap:16, marginBottom:12, flexWrap:"wrap" as const },
  h2: { fontSize:28, fontWeight:900, color:"#fff", margin:0, letterSpacing:"-0.02em" },
  sub: { fontSize:13, color:"rgba(216, 234, 242, 0.5)", marginBottom:32, letterSpacing:"0.01em" },
  tabs: { display:"flex", gap:10, marginBottom:32, flexWrap:"wrap" as const },
  tab: { padding:"10px 20px", borderRadius:12, border:"1px solid rgba(230, 180, 130, 0.1)", background:"rgba(255, 255, 255, 0.03)", color:"rgba(216, 234, 242, 0.6)", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"Inter,sans-serif", transition:"all 0.2s" } as React.CSSProperties,
  tabOn: { background:"rgba(40, 215, 214, 0.1)", borderColor:"rgba(40, 215, 214, 0.3)", color:"#28D7D6" } as React.CSSProperties,
  card: { background:"rgba(255, 255, 255, 0.04)", backdropFilter:"blur(24px)", border:"1px solid rgba(230, 180, 130, 0.08)", borderRadius:20, padding:"28px", marginBottom:20, boxShadow:"0 8px 32px rgba(0,0,0,0.3)" } as React.CSSProperties,
  cardTitle: { fontSize:14, fontWeight:800, color:"#28D7D6", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", letterSpacing:"0.05em", textTransform:"uppercase" as const } as React.CSSProperties,
  lbl: { fontSize:11, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase" as const, color:"rgba(216, 234, 242, 0.75)", marginBottom:8, display:"block" },
  inp: { width:"100%", background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255, 255, 255, 0.1)", borderRadius:10, padding:"12px 16px", color:"#fff", fontSize:14, fontFamily:"Inter,sans-serif", outline:"none", boxSizing:"border-box" as const, marginBottom:16, transition:"all 0.2s" } as React.CSSProperties,
  ta: { width:"100%", background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255, 255, 255, 0.1)", borderRadius:10, padding:"12px 16px", color:"#fff", fontSize:13, fontFamily:"'JetBrains Mono',monospace", outline:"none", boxSizing:"border-box" as const, resize:"vertical" as const, marginBottom:16, transition:"all 0.2s" } as React.CSSProperties,
  row: { display:"flex", gap:12, alignItems:"flex-start", marginBottom:12 } as React.CSSProperties,
  btnSave: { padding:"12px 28px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#28D7D6,#0066cc)", color:"#000", fontSize:14, fontWeight:900, cursor:"pointer", fontFamily:"Inter,sans-serif", boxShadow:"0 4px 15px rgba(40, 215, 214, 0.3)", transition:"all 0.2s" } as React.CSSProperties,
  btnAdd: { padding:"10px 20px", borderRadius:10, border:"1px solid rgba(40, 215, 214, 0.3)", background:"rgba(40, 215, 214, 0.05)", color:"#28D7D6", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"Inter,sans-serif", transition:"all 0.2s" } as React.CSSProperties,
  btnDel: { padding:"10px 18px", borderRadius:10, border:"1px solid rgba(239, 68, 68, 0.3)", background:"rgba(239, 68, 68, 0.05)", color:"#f87171", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"Inter,sans-serif", flexShrink:0, transition:"all 0.2s" } as React.CSSProperties,
  btnEdit: { padding:"8px 16px", borderRadius:10, border:"1px solid rgba(255, 255, 255, 0.15)", background:"rgba(255, 255, 255, 0.04)", color:"rgba(216, 234, 242, 0.7)", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Inter,sans-serif", transition:"all 0.2s" } as React.CSSProperties,
  saved: { color:"#34d399", fontSize:14, fontWeight:800, textShadow:"0 0 10px rgba(52, 211, 153, 0.3)" },
  clueBadge: { padding:"5px 14px", borderRadius:20, background:"rgba(255, 154, 76, 0.1)", border:"1px solid rgba(255, 154, 76, 0.25)", color:"#FF9A4C", fontSize:11, fontWeight:800 } as React.CSSProperties,
  codeBadge: { padding:"5px 14px", borderRadius:20, background:"rgba(40, 215, 214, 0.1)", border:"1px solid rgba(40, 215, 214, 0.25)", color:"#28D7D6", fontSize:11, fontWeight:800 } as React.CSSProperties,
  info: { fontSize:13, color:"rgba(216, 234, 242, 0.5)", lineHeight:1.6, marginBottom:16 },
};

type SubTab = "clues" | "mcq" | "jumble" | "round3" | "round4" | "status" | "marks";
const SUBTABS: { id:SubTab; label:string; icon:string }[] = [
  { id:"clues",    label:"Clues & Codes", icon:"🗝️" },
  { id:"mcq",      label:"Round 1 MCQ",  icon:"📝" },
  { id:"jumble",   label:"Round 2 Jumble",icon:"🔀" },
  { id:"round3",   label:"Round 3 Code",  icon:"🐍" },
  { id:"round4",   label:"Round 4 Code",  icon:"🔢" },
  { id:"status",   label:"Live Status",   icon:"📡" },
  { id:"marks",    label:"Final Marks",   icon:"📊" },
];
const ROUND_NAMES = ["Round 1 (MCQ)", "Round 2 (Jumble)", "Round 3 (Coding)", "Round 4 (Coding)"];

export default function PyHuntAdminTab() {
  const [cfg, setCfg] = useState<PyHuntConfig>(DEFAULT);
  const [sub, setSub] = useState<SubTab>("clues");
  const [saved, setSaved] = useState(false);
  const [editIdx, setEditIdx] = useState<number|null>(null);
  const [jsonStr, setJsonStr] = useState("");

  useEffect(() => { 
    loadCfgAsync().then(c => {
      setCfg(c);
      setJsonStr(JSON.stringify(c, null, 2));
    }); 
  }, []);

  useEffect(() => {
    // Live sync cfg -> json preview as the user edits the UI form
    setJsonStr(JSON.stringify(cfg, null, 2));
  }, [cfg]);

  const handleSave = async () => {
    await saveCfgAsync(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  /* ─ MCQ helpers ─ */
  const setMCQ = (qi: number, field: keyof MCQQuestion, v: any) =>
    setCfg(c => { const qs=[...c.mcqQuestions]; qs[qi]={...qs[qi],[field]:v}; return {...c,mcqQuestions:qs}; });
  const setOpt = (qi: number, oi: number, v: string) =>
    setCfg(c => { const qs=[...c.mcqQuestions]; const opts=[...qs[qi].options]; opts[oi]={...opts[oi],text:v}; qs[qi]={...qs[qi],options:opts}; return {...c,mcqQuestions:qs}; });
  const addMCQ = () => {
    const q: MCQQuestion = { id:`q${Date.now()}`, question:"New question?", options:[{label:"A",text:"Option A"},{label:"B",text:"Option B"},{label:"C",text:"Option C"},{label:"D",text:"Option D"}], correct:"A", explanation:"" };
    setCfg(c=>({...c,mcqQuestions:[...c.mcqQuestions,q]}));
    setEditIdx(cfg.mcqQuestions.length);
  };
  const delMCQ = (i: number) => { setCfg(c=>({...c,mcqQuestions:c.mcqQuestions.filter((_,j)=>j!==i)})); setEditIdx(null); };

  /* ─ TC helpers ─ */
  const setTC = (r: "round3"|"round3b"|"round4", i: number, f: "input"|"expected", v: string) =>
    setCfg(c => { const tcs=[...c[r].testCases]; tcs[i]={...tcs[i],[f]:v}; return {...c,[r]:{...c[r],testCases:tcs}}; });
  const addTC = (r: "round3"|"round3b"|"round4") =>
    setCfg(c=>({...c,[r]:{...c[r],testCases:[...c[r].testCases,{input:"",expected:""}]}}));
  const delTC = (r: "round3"|"round3b"|"round4", i: number) =>
    setCfg(c=>({...c,[r]:{...c[r],testCases:c[r].testCases.filter((_,j)=>j!==i)}}));

  /* ─ Clue helpers ─ */
  const setClue = (round: 1|2|3|4, i: number, f: keyof ClueConfig, v: string) =>
    setCfg(c => {
      const key = `round${round}Clues` as keyof PyHuntConfig;
      const cl = [...(c[key] as ClueConfig[])];
      cl[i] = { ...cl[i], [f]: v };
      return { ...c, [key]: cl };
    });

  const addClue = (round: 1|2|3|4) =>
    setCfg(c => {
      const key = `round${round}Clues` as keyof PyHuntConfig;
      return { ...c, [key]: [...(c[key] as ClueConfig[]), { clueText: "", unlockCode: "" }] };
    });

  const delClue = (round: 1|2|3|4, i: number) =>
    setCfg(c => {
      const key = `round${round}Clues` as keyof PyHuntConfig;
      return { ...c, [key]: (c[key] as ClueConfig[]).filter((_, j) => j !== i) };
    });

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.entryAccessCode) throw new Error("Invalid Config: Missing entryAccessCode");
      setCfg(parsed);
      alert("✅ Protocol Applied! Remember to 'Save All Changes' to persist.");
    } catch (e: any) {
      alert("❌ Invalid JSON Protocol: " + e.message);
    }
  };

  return (
    <div style={$.wrap}>
      <div style={$.topRow}>
        <div style={$.h2}>🐍 PyHunt Configuration</div>
        <button style={$.btnSave} onClick={handleSave}>💾 Save All Changes</button>
        {saved && <span style={$.saved}>✓ Saved to device!</span>}
      </div>
      <div style={$.sub}>
        Changes are saved to the central database and immediately visible to all students on any device.
      </div>

      {/* Sub-tabs */}
      <div style={$.tabs}>
        {SUBTABS.map(t => (
          <button key={t.id} style={sub===t.id?{...$.tab,...$.tabOn}:$.tab} onClick={()=>{setSub(t.id);setEditIdx(null);}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══ CLUES & CODES TAB ══ */}
      {sub==="clues" && (
        <div>
          <div style={$.card}>
            <div style={$.cardTitle}>⚙️ Competition Status</div>
            <div style={{ marginBottom: 24, padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Active Status</div>
                <div style={{ fontSize: 12, color: "rgba(216, 234, 242, 0.4)" }}>Enable or disable student access to the PyHunt competition.</div>
              </div>
              <button 
                onClick={() => setCfg(c => ({ ...c, isActive: !c.isActive }))}
                style={{
                  padding: "8px 24px", borderRadius: 12, fontSize: 13, fontWeight: 800, cursor: "pointer",
                  background: cfg.isActive ? "rgba(40, 215, 214, 0.2)" : "rgba(239, 68, 68, 0.2)",
                  color: cfg.isActive ? "#28D7D6" : "#ef4444",
                  border: `1px solid ${cfg.isActive ? "rgba(40, 215, 214, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
                  transition: "all 0.2s ease"
                }}
              >
                {cfg.isActive ? "✅ ACTIVE" : "🚫 INACTIVE"}
              </button>
            </div>
          </div>

          <div style={$.card}>
            <div style={$.cardTitle}>🚪 Competition Entrance</div>
            
            <label htmlFor="competitionName" style={$.lbl}>Competition Name</label>
            <input
              id="competitionName"
              style={$.inp}
              value={cfg.competitionName}
              onChange={e=>setCfg(c=>({...c,competitionName:e.target.value}))}
            />

            <label htmlFor="startTime" style={$.lbl}>Start Time</label>
            <input
              id="startTime"
              type="datetime-local"
              style={$.inp}
              value={cfg.startTime}
              onChange={e=>setCfg(c=>({...c,startTime:e.target.value}))}
            />

            <label htmlFor="entryAccessCode" style={$.lbl}>Entry Access Code (Required to start PyHunt)</label>
            <input
              id="entryAccessCode"
              style={$.inp}
              value={cfg.entryAccessCode}
              onChange={e=>setCfg(c=>({...c,entryAccessCode:e.target.value.toUpperCase()}))}
              placeholder="e.g. NEXUS24"
            />
            <div style={$.info}>Students must enter this code at the start of the hunt.</div>
          </div>

          {[1, 2, 3, 4].map(r => {
            const key = `round${r}Clues` as keyof PyHuntConfig;
            const clues = (cfg[key] as ClueConfig[]) || [];
            return (
              <div key={r} style={{ marginTop: 32 }}>
                <div style={{ ...$.h2, fontSize: 22, marginBottom: 16 }}>🛰️ Round {r} Distribution Nodes</div>
                <div style={$.info}>
                  Add multiple clues here to distribute students across different physical locations after Round {r}.
                </div>

                {clues.map((clue, i) => (
                  <div key={i} style={$.card}>
                    <div style={$.cardTitle}>
                      <span>Node {i + 1}</span>
                      <button style={$.btnDel} onClick={() => delClue(r as any, i)}>✕ Remove</button>
                    </div>

                    <label htmlFor={`clueText_${r}_${i}`} style={$.lbl}>Clue Text (Location Hint)</label>
                    <textarea
                      id={`clueText_${r}_${i}`}
                      style={{ ...$.ta, minHeight: 72 }}
                      value={clue.clueText}
                      onChange={e => setClue(r as any, i, "clueText", e.target.value)}
                    />

                    <label htmlFor={`unlockCode_${r}_${i}`} style={$.lbl}>Unlock Code (Found at Location)</label>
                    <input
                      id={`unlockCode_${r}_${i}`}
                      style={$.inp}
                      value={clue.unlockCode}
                      onChange={e => setClue(r as any, i, "unlockCode", e.target.value.toUpperCase())}
                    />
                  </div>
                ))}
                <button
                  style={{ ...$.btnAdd, marginBottom: 20, width: "100%", padding: 12 }}
                  onClick={() => addClue(r as any)}
                >
                  ➕ Add Distribution Node for Round {r}
                </button>
              </div>
            );
          })}

          <div style={$.card}>
            <label htmlFor="finishMessage" style={$.lbl}>🏆 Finish Message (shown after all rounds)</label>
            <textarea
              id="finishMessage"
              style={{...$.ta, minHeight:60}}
              value={cfg.finishMessage}
              onChange={e=>setCfg(c=>({...c,finishMessage:e.target.value}))}
            />
          </div>
        </div>
      )}

      {/* ══ MCQ TAB ══ */}
      {sub==="mcq" && (
        <div>
          {cfg.mcqQuestions.map((q, qi) => (
            <div key={q.id} style={$.card}>
              <div style={$.cardTitle}>
                <span style={{color:"#60b8e0"}}>Q{qi+1}</span>
                <div style={{display:"flex",gap:8}}>
                  <button style={$.btnEdit} onClick={()=>setEditIdx(editIdx===qi?null:qi)}>
                    {editIdx===qi?"▲ Collapse":"✏️ Edit"}
                  </button>
                  <button style={$.btnDel} onClick={()=>delMCQ(qi)}>✕</button>
                </div>
              </div>
              <div style={{fontSize:14,color:"#a0c0e0",marginBottom:editIdx===qi?12:0,lineHeight:1.5}}>{q.question}</div>

              {editIdx===qi && (
                <>
                  <label htmlFor={`mcq_q_${qi}`} style={$.lbl}>Question</label>
                  <textarea id={`mcq_q_${qi}`} style={{...$.ta,minHeight:60}} value={q.question} onChange={e=>setMCQ(qi,"question",e.target.value)} />

                  <label style={$.lbl}>Options</label>
                  {q.options.map((opt, oi) => (
                    <div key={opt.label} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                      <span style={{color:"#00dcff",fontWeight:800,width:20,flexShrink:0}}>{opt.label}.</span>
                      <input 
                        id={`mcq_q_${qi}_opt_${opt.label}`}
                        style={{...$.inp,margin:0,flex:1}} 
                        value={opt.text} 
                        onChange={e=>setOpt(qi,oi,e.target.value)} 
                        aria-label={`Option ${opt.label}`}
                      />
                    </div>
                  ))}

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div>
                      <label htmlFor={`mcq_q_${qi}_correct`} style={$.lbl}>Correct Answer</label>
                      <select id={`mcq_q_${qi}_correct`} style={{...$.inp,width:"auto"}} value={q.correct} onChange={e=>setMCQ(qi,"correct",e.target.value)}>
                        {q.options.map(o=><option key={o.label} value={o.label}>{o.label} — {o.text}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`mcq_q_${qi}_expl`} style={$.lbl}>Explanation (shown after answer)</label>
                      <input id={`mcq_q_${qi}_expl`} style={$.inp} value={q.explanation} onChange={e=>setMCQ(qi,"explanation",e.target.value)} placeholder="Why is this the right answer?" />
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
          <button style={$.btnAdd} onClick={addMCQ}>+ Add Question</button>
        </div>
      )}

      {/* ══ JUMBLE TAB ══ */}
      {sub==="jumble" && (
        <div>
          <div style={$.card}>
            <div style={{...$.cardTitle}}>Round 2 — Problem 1 (Part A)</div>
            <label htmlFor="jumble_title_a" style={$.lbl}>Title</label>
            <input id="jumble_title_a" style={$.inp} value={cfg.jumbleProblem.title} onChange={e=>setCfg(c=>({...c,jumbleProblem:{...c.jumbleProblem,title:e.target.value}}))} />
            <label htmlFor="jumble_desc_a" style={$.lbl}>Description</label>
            <textarea id="jumble_desc_a" style={{...$.ta,minHeight:60}} value={cfg.jumbleProblem.description} onChange={e=>setCfg(c=>({...c,jumbleProblem:{...c.jumbleProblem,description:e.target.value}}))} />
            <label htmlFor="jumble_lines_a" style={$.lbl}>Code Lines — enter in CORRECT order (one per line). Students see them shuffled.</label>
            <textarea
              id="jumble_lines_a"
              style={{...$.ta,minHeight:180}}
              value={cfg.jumbleProblem.lines.join("\n")}
              onChange={e=>setCfg(c=>({...c,jumbleProblem:{...c.jumbleProblem,lines:e.target.value.split("\n")}}))}
            />
          </div>

          <div style={$.card}>
            <div style={{...$.cardTitle, color: "#a78bfa"}}>Round 2 — Problem 2 (Part B)</div>
            <label htmlFor="jumble_title_b" style={$.lbl}>Title</label>
            <input id="jumble_title_b" style={$.inp} value={cfg.jumbleProblemB.title} onChange={e=>setCfg(c=>({...c,jumbleProblemB:{...c.jumbleProblemB,title:e.target.value}}))} />
            <label htmlFor="jumble_desc_b" style={$.lbl}>Description</label>
            <textarea id="jumble_desc_b" style={{...$.ta,minHeight:60}} value={cfg.jumbleProblemB.description} onChange={e=>setCfg(c=>({...c,jumbleProblemB:{...c.jumbleProblemB,description:e.target.value}}))} />
            <label htmlFor="jumble_lines_b" style={$.lbl}>Code Lines — enter in CORRECT order (one per line). Students see them shuffled.</label>
            <textarea
              id="jumble_lines_b"
              style={{...$.ta,minHeight:180}}
              value={cfg.jumbleProblemB.lines.join("\n")}
              onChange={e=>setCfg(c=>({...c,jumbleProblemB:{...c.jumbleProblemB,lines:e.target.value.split("\n")}}))}
            />
          </div>
        </div>
      )}

      {/* ══ ROUND 3 / 4 CODING — IDE EDITOR ══ */}
      {(sub==="round3"||sub==="round4") && (() => {
        const rk1 = sub as "round3"|"round4";
        const isR3 = sub==="round3";
        const rk2 = isR3 ? "round3b" as const : null;
        const rn = isR3?3:4;



        return (
          <div>
            <CodingProblemEditor cfg={cfg} setCfg={setCfg} rk={rk1} rn={rn} label={isR3 ? "Part 1 Problem" : "Coding Problem"} />
            {rk2 && <CodingProblemEditor cfg={cfg} setCfg={setCfg} rk={rk2} rn={rn} accentColor="#a78bfa" label="Part 2 Problem" />}
          </div>
        );
      })()}

      {/* ══ LIVE STATUS TAB ══ */}
      {sub==="status" && <LiveStatusView />}
      {sub==="marks" && <MarksView cfg={cfg} />}

      {/* ══ PROTOCOL JSON EDITOR ══ */}
      <div style={{ marginTop: 60, borderTop: "1px solid rgba(40, 215, 214, 0.1)", paddingTop: 40 }}>
        <div style={$.cardTitle}>
          <span>📡 PROTOCOL JSON (Direct Configuration)</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button 
              style={{ ...$.btnEdit, color: "#28D7D6", borderColor: "rgba(40,215,214,0.3)" }} 
              onClick={() => setJsonStr(JSON.stringify(cfg, null, 2))}
              title="Reset JSON editor to match the current UI state"
            >
              🔄 Refresh from UI
            </button>
            <button 
              style={{ ...$.btnSave, padding: "8px 20px", fontSize: 12, background: "linear-gradient(135deg,#28D7D6,#3b82f6)" }} 
              onClick={applyJson}
              title="Apply the JSON below to the UI fields above"
            >
              ⚡ Apply Protocol
            </button>
          </div>
        </div>
        <div style={$.info}>
          Preview as JSON (copy for manual import or direct modification). Changes applied here will update the fields above. 
          Use this for batch editing or transferring configurations between environments.
        </div>
        <textarea
          style={{
            ...$.ta,
            minHeight: 400,
            fontSize: 12,
            background: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(40,215,214,0.15)",
            color: "#28D7D6",
            boxShadow: "inset 0 4px 20px rgba(0,0,0,0.6)",
            lineHeight: 1.6,
            padding: "20px"
          }}
          value={jsonStr}
          onChange={e => setJsonStr(e.target.value)}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function MarksView({ cfg }: { cfg: PyHuntConfig }) {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const data = await adminFetch<any[]>("/admin/pyhunt/status");
      setStudents(data || []);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={$.card}>
      <div style={$.cardTitle}>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <span style={{fontSize: 20}}>📊</span>
          <span>Final Marks Dashboard</span>
        </div>
        <button style={$.btnAdd} onClick={fetchStatus}>🔄 Refresh</button>
      </div>

      {loading && students.length === 0 ? (
        <div style={$.info}>Loading performance metrics...</div>
      ) : (
        <table style={{width:"100%", borderCollapse:"collapse", color:"#c8daf0", fontSize:13}}>
          <thead>
            <tr style={{textAlign:"left", borderBottom:"1px solid rgba(0,220,255,0.1)"}}>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>STUDENT</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>MCQ SCORE</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>MCQ TIME</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>TOTAL TIME</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                <td style={{padding:"12px 8px"}}>
                  <div style={{fontWeight:700}}>{s.student_name}</div>
                  <div style={{fontSize:10, color: "#8ba3c7"}}>{s.student_usn}</div>
                </td>
                <td style={{padding:"12px 8px"}}>
                  <span style={{...$.clueBadge, background:"rgba(0,220,255,0.05)", color:"#00dcff"}}>
                    {s.round1_score || "0"} / {cfg.mcqQuestions.length}
                  </span>
                </td>
                <td style={{padding:"12px 8px", fontWeight: 700}}>{s.round1_time || "-"}</td>
                <td style={{padding:"12px 8px", color: "#f59e0b", fontWeight: 800}}>{s.total_time || "-"}</td>
                <td style={{padding:"12px 8px"}}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 10,
                    background: s.status === "finished" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                    color: s.status === "finished" ? "#10b981" : "#f59e0b"
                  }}>
                    {s.status?.toUpperCase() || "ACTIVE"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LiveStatusView() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArt, setSelectedArt] = useState<{id: string, name: string, img: string} | null>(null);
  const [countdown, setCountdown] = useState(60);

  const [lastSync, setLastSync] = useState<string>("");

  const fetchStatus = async () => {
    try {
      // Use our new hardened admin API for joined data (Name + USN)
      const data = await adminFetch<any[]>("/admin/pyhunt/status");
      setStudents(data || []);
      setLastSync(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Fetch error:", err);
      // Fallback to direct supabase if API fails (e.g. during migration)
      const { data } = await supabase.from('pyhunt_progress').select('*').order('last_active', { ascending: false });
      if (data) setStudents(data);
    } finally {
      setLoading(false);
    }
  };

  const deleteArt = async (studentId: string) => {
    if (!confirm("Are you sure you want to delete this student's artwork? This cannot be undone.")) return;
    try {
      const { error } = await supabase
        .from('pyhunt_progress')
        .update({ turtle_image: null })
        .eq('student_id', studentId);
      
      if (error) throw error;
      setSelectedArt(null);
      fetchStatus();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete artwork.");
    }
  };

  const resetProgress = async (studentId: string) => {
    if (!confirm("Reset this student's progress to Round 1?")) return;
    try {
      const res = await adminFetch<any>(`/admin/pyhunt/progress/reset?student_id=${studentId}`, {
        method: "POST"
      });
      if (res.ok) fetchStatus();
      else alert("Failed to reset progress.");
    } catch (err) {
      console.error("Reset error:", err);
    }
  };

  const removeStudent = async (student_id: string) => {
    if (!confirm("Permanently remove this student from the progress board?")) return;
    try {
      const res = await adminFetch<any>(`/admin/pyhunt/progress/${student_id}`, {
        method: "DELETE"
      });
      if (res.ok) fetchStatus();
      else alert("Failed to remove student.");
    } catch (err) {
      console.error("Remove error:", err);
    }
  };

  const globalReset = async () => {
    if (!confirm("⚠️ DANGER: This will PERMANENTLY WIPE all student progress for EVERYONE. Are you absolutely sure?")) return;
    try {
      const res = await adminFetch<any>("/admin/pyhunt/reset", {
        method: "POST"
      });
      if (res.ok) {
        alert("All progress has been wiped.");
        fetchStatus();
      } else {
        alert("Failed to perform global reset.");
      }
    } catch (err) {
      console.error("Global reset error:", err);
      alert("Error connecting to server.");
    }
  };

  useEffect(() => {
    fetchStatus();
    setCountdown(60);

    const interval = setInterval(() => {
      fetchStatus();
      setCountdown(60);
    }, 60000); // 1 minute as requested

    const cd = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    // REAL-TIME: Listen for any changes in the pyhunt_progress table
    const channel = supabase
      .channel('pyhunt-admin-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pyhunt_progress' },
        (payload: any) => {
          console.log("[PyHunt Admin] Realtime update detected:", payload.eventType);
          fetchStatus(); // Re-fetch to get consistent data
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      clearInterval(cd);
      supabase.removeChannel(channel);
    };
  }, []);

  // Parse round number from current_round field (e.g. "Round 3" → 3, "COMPLETED" → 5)
  const parseRound = (cr: string): number => {
    if (!cr) return 0;
    if (cr.toUpperCase() === "COMPLETED") return 5;
    const m = cr.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };

  return (
    <div style={$.card}>
      <div style={{...$.cardTitle, marginBottom:20}}>
        <div style={{display:"flex", alignItems:"center", gap:15}}>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <span style={{fontSize: 20}}>📡</span>
            <span>Live Monitor</span>
          </div>
          <div style={{fontSize:12, opacity:0.6, fontWeight: 400}}>
            Last Sync: <span style={{color:"#00dcff", fontWeight:700}}>{lastSync || "Waiting..." }</span>
          </div>
          <div style={{
            fontSize:10, background:"rgba(0,220,255,0.08)", padding:"2px 10px", 
            borderRadius:4, border:"1px solid rgba(0,220,255,0.2)", color:"#00dcff",
            fontWeight: 800, minWidth: 100, textAlign: "center", textTransform: "uppercase"
          }}>
            Refresh in {countdown}s
          </div>
        </div>
        <div style={{display:"flex", gap:10}}>
          <button 
            style={{...$.btnDel, padding: "8px 16px", fontSize: 12, fontWeight: 900}} 
            onClick={globalReset}
          >
            🔥 Global Purge
          </button>
          <button style={$.btnAdd} onClick={() => { fetchStatus(); setCountdown(60); }}>🔄 Refresh Now</button>
        </div>
      </div>

      {loading && students.length === 0 ? (
        <div style={$.info}>Connecting to transmission frequency...</div>
      ) : students.length === 0 ? (
        <div style={$.info}>No students have initiated the protocol yet.</div>
      ) : (
        <table style={{width:"100%", borderCollapse:"collapse", color:"#c8daf0", fontSize:13}}>
          <thead>
            <tr style={{textAlign:"left", borderBottom:"1px solid rgba(0,220,255,0.1)"}}>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>STUDENT NAME</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>ROUND</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>R1 SCORE</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>R1 TIME</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>ROUND STATUS</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>WARNINGS</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>LAST VIOLATION</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>LAST ACTIVE</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>STATUS</th>
              <th style={{padding:"12px 8px", color:"#3a5578", textAlign:"right"}}>ACTIONS</th>

            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const roundNum = parseRound(s.current_round);
              const isFinished = s.status === "finished" || s.current_round?.toUpperCase() === "COMPLETED";
              const isTerminated = s.status === "TERMINATED";
              
              return (
                <tr key={i} style={{
                  borderBottom:"1px solid rgba(255,255,255,0.03)",
                  background: s.warnings >= 2 ? "rgba(239, 68, 68, 0.05)" : "transparent"
                }}>
                    <td style={{padding:"12px 8px"}}>
                      <div style={{fontWeight:700}}>{s.student_name || "Unknown Name"}</div>
                      <div style={{fontSize:10, color: "#8ba3c7", fontWeight: 700}}>{s.student_usn || s.student_id || "Anonymous"}</div>
                    </td>
                  <td style={{padding:"12px 8px"}}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 32, height: 32, borderRadius: "50%", fontWeight: 800, fontSize: 14,
                      background: isTerminated ? "rgba(239, 68, 68, 0.15)" : (isFinished ? "rgba(16,185,129,0.15)" : "rgba(0,220,255,0.12)"),
                      color: isTerminated ? "#ef4444" : (isFinished ? "#10b981" : "#00dcff"),
                      border: isTerminated ? "1px solid rgba(239, 68, 68, 0.3)" : (isFinished ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(0,220,255,0.25)"),
                    }}>
                      {isFinished ? "✓" : (isTerminated ? "X" : roundNum)}
                    </span>
                  </td>
                  <td style={{padding:"12px 8px", fontWeight: 700, color: "#10b981"}}>
                    {s.round1_score || "-"}
                  </td>
                  <td style={{padding:"12px 8px", fontSize: 11, opacity: 0.8}}>
                    {s.round1_time || "-"}
                  </td>
                  <td style={{padding:"12px 8px"}}>
                    <span style={{
                      padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800,
                      background: isTerminated ? "rgba(239, 68, 68, 0.1)" : (isFinished ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)"),
                      color: isTerminated ? "#ef4444" : (isFinished ? "#10b981" : "#f59e0b"),
                      border: isTerminated ? "1px solid rgba(239, 68, 68, 0.2)" : (isFinished ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(245,158,11,0.2)"),
                    }}>
                      {isTerminated ? "TERMINATED" : (isFinished ? "COMPLETED" : "IN PROGRESS")}
                    </span>
                  </td>
                  <td style={{padding:"12px 8px"}}>
                     <span style={s.warnings >= 2 ? { ...$.clueBadge, background: "rgba(239, 68, 68, 0.1)", color: "#f87171", borderColor: "rgba(239, 68, 68, 0.3)" } : $.clueBadge}>
                       {s.warnings || 0} / 3
                     </span>
                  </td>
                  <td style={{padding:"12px 8px", fontSize: 11, color: "#f87171", fontWeight: 700}}>
                    {s.last_violation?.toUpperCase().replace(/_/g, ' ') || "-"}
                  </td>
                  <td style={{padding:"12px 8px", opacity:0.6}}>
                    {new Date(s.last_active).toLocaleTimeString()}
                  </td>
                  <td style={{padding:"12px 8px"}}>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 10,
                      background: isTerminated || s.warnings >= 3 ? "rgba(239, 68, 68, 0.1)" : (isFinished ? "rgba(16,185,129,0.1)" : "rgba(0,220,255,0.1)"),
                      color: isTerminated || s.warnings >= 3 ? "#ef4444" : (isFinished ? "#10b981" : "#00dcff"),
                      border: isTerminated || s.warnings >= 3 ? "1px solid rgba(239, 68, 68, 0.2)" : (isFinished ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(0,220,255,0.2)")
                    }}>
                      {isTerminated || s.warnings >= 3 ? "TERMINATED" : (isFinished ? "FINISHED" : "ACTIVE")}
                    </span>
                  </td>
                  <td style={{padding:"12px 8px", textAlign:"right"}}>
                    <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
                      {s.turtle_image && (
                        <button 
                          onClick={() => setSelectedArt({ id: s.student_id, name: s.student_name, img: s.turtle_image })}
                          style={{ ...$.btnEdit, padding: "4px 8px", fontSize: 10 }}
                        >View Art</button>
                      )}
                      <button 
                        onClick={() => resetProgress(s.student_id)}
                        style={{ ...$.btnAdd, padding: "4px 8px", fontSize: 10, borderColor: "rgba(245, 158, 11, 0.3)", color: "#f59e0b", background: "rgba(245, 158, 11, 0.05)" }}
                      >Reset</button>
                      <button 
                        onClick={() => removeStudent(s.student_id)}
                        style={{ ...$.btnDel, padding: "4px 8px", fontSize: 10 }}
                      >Remove</button>
                    </div>
                  </td>

                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selectedArt && (
        <div 
          onClick={() => setSelectedArt(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0c1117", border: "1px solid rgba(0,220,255,0.3)", 
              borderRadius: 20, padding: 32, maxWidth: 600, width: "100%", textAlign: "center"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>🎨 {selectedArt.name}'s Masterpiece</div>
              <button 
                onClick={() => setSelectedArt(null)}
                style={{ background: "none", border: "none", color: "#fff", fontSize: 24, cursor: "pointer" }}
              >✕</button>
            </div>
            <div style={{ background: "#000", borderRadius: 12, padding: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
              <img src={selectedArt.img} style={{ width: "100%", borderRadius: 8 }} alt="Turtle Art" />
            </div>
            <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
              <button 
                onClick={() => setSelectedArt(null)}
                style={{ ...$.btnEdit, flex: 1, padding: "12px" }}
              >Close</button>
              <button 
                onClick={() => deleteArt(selectedArt.id)}
                style={{ ...$.btnDel, flex: 1, padding: "12px" }}
              >Delete Submission</button>
            </div>
            <div style={{ marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              Round 5 · Student Generated Canvas Turtle Art
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Coding Problem Editor Component ───────────────── */
function CodingProblemEditor({ cfg, setCfg, rk, rn, accentColor = "#00dcff", label }: { 
  cfg: PyHuntConfig; 
  setCfg: React.Dispatch<React.SetStateAction<PyHuntConfig>>;
  rk: "round3"|"round3b"|"round4"; 
  rn: number;
  accentColor?: string; 
  label: string 
}) {
  const [tcJson, setTcJson] = useState(JSON.stringify(cfg[rk].testCases, null, 2));
  const [showPreview, setShowPreview] = useState(false);

  // Sync tcJson if cfg[rk].testCases changes from elsewhere
  useEffect(() => {
    try {
      const currentInCfg = JSON.stringify(cfg[rk].testCases, null, 2);
      // Only sync if they are actually different to avoid cursor jumps
      if (currentInCfg !== tcJson && JSON.stringify(JSON.parse(tcJson)) !== JSON.stringify(cfg[rk].testCases)) {
        setTcJson(currentInCfg);
      }
    } catch(e) {}
  }, [cfg[rk].testCases]);

  const handleTcChange = (val: string) => {
    setTcJson(val);
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        setCfg(c => ({
          ...c,
          [rk]: { ...c[rk], testCases: parsed }
        }));
      }
    } catch (err) {}
  };

  return (
    <div style={{...$.card, borderColor: `${accentColor}22`}}>
      {/* Header */}
      <div style={{...$.cardTitle, color: accentColor, display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <span>Round {rn} — {label}</span>
        <span style={{fontSize:10, color:"#3a5578", fontWeight:700, letterSpacing:1}}>IDE EDITOR</span>
      </div>

      {/* QUESTION / PROMPT */}
      <label htmlFor={`${rk}_desc`} style={{...$.lbl, textTransform:"uppercase", letterSpacing:1}}>Question / Prompt</label>
      <textarea id={`${rk}_desc`} style={{...$.ta, minHeight:100, marginBottom:20}} 
        placeholder="Enter the problem statement here..."
        value={cfg[rk].description}
        onChange={e=>setCfg(c=>({...c,[rk]:{...c[rk],description:e.target.value}}))} />
        
      {/* OPTIONAL IMAGE URL */}
      <label htmlFor={`${rk}_img`} style={{...$.lbl, textTransform:"uppercase", letterSpacing:1}}>Optional Image URL</label>
      <input id={`${rk}_img`} style={{...$.inp, marginBottom:20}} 
        placeholder="https://example.com/image.png"
        value={cfg[rk].imageUrl || ""}
        onChange={e=>setCfg(c=>({...c,[rk]:{...c[rk],imageUrl:e.target.value}}))} />

      {/* OPTIONAL TARGET OUTPUT (FALLBACK) */}
      <label htmlFor={`${rk}_target`} style={{...$.lbl, textTransform:"uppercase", letterSpacing:1}}>Optional Target Output (Fallback)</label>
      <textarea id={`${rk}_target`} style={{...$.ta, minHeight:80, marginBottom:20}} 
        placeholder="e.g., palindrome: true"
        value={cfg[rk].targetOutput || ""}
        onChange={e=>setCfg(c=>({...c,[rk]:{...c[rk],targetOutput:e.target.value}}))} />

      {/* TEST CASES (JSON ARRAY) */}
      <div style={{marginTop:20, marginBottom:8}}>
        <div style={{...$.cardTitle as any, color: accentColor, margin:0, fontSize:13, textTransform:"uppercase", letterSpacing:1}}>
          🧪 Test Cases (JSON Array)
        </div>
        <div style={{fontSize:11, color:"#3a5578", marginBottom:10}}>
          Format: <code>{`[{"input": "...", "expected": "..."}]`}</code>
        </div>
      </div>
      <textarea
        style={{
          ...$.ta,
          minHeight: 180,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          background: "rgba(0,0,0,0.45)",
          borderColor: `${accentColor}66`,
          color: accentColor,
          lineHeight: 1.5,
          padding: "12px",
          marginBottom:20
        }}
        value={tcJson}
        onChange={e => handleTcChange(e.target.value)}
        spellCheck={false}
        placeholder='[{"input": "5", "expected": "120"}]'
      />

      {/* STARTER CODE */}
      <label htmlFor={`${rk}_starter`} style={{...$.lbl, display:"flex", alignItems:"center", justifyContent:"space-between", textTransform:"uppercase", letterSpacing:1}}>
        <span>🐍 Starter Code</span>
        <span style={{fontSize:10, color:"#3a5578"}}>Python 3 · Tab = 4 spaces</span>
      </label>
      <textarea
        id={`${rk}_starter`}
        style={{
          width:"100%", minHeight:180,
          background:"#0d1117", color:"#e6edf3",
          fontFamily:"'JetBrains Mono','Fira Code',monospace",
          fontSize:13, lineHeight:1.7,
          padding:"14px 16px",
          border:`1px solid ${accentColor}22`,
          borderRadius:10, resize:"vertical",
          boxSizing:"border-box", outline:"none",
          tabSize:4,
          marginBottom:20
        }}
        value={cfg[rk].starterCode}
        onChange={e=>setCfg(c=>({...c,[rk]:{...c[rk],starterCode:e.target.value}}))}
        onKeyDown={e => {
          if (e.key === "Tab") {
            e.preventDefault();
            const ta = e.currentTarget;
            const s = ta.selectionStart, en = ta.selectionEnd;
            const val = ta.value;
            const newVal = val.substring(0, s) + "    " + val.substring(en);
            setCfg(c=>({...c,[rk]:{...c[rk],starterCode:newVal}}));
            requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 4; });
          }
        }}
        spellCheck={false}
      />

      {/* OPTIONAL HINT */}
      <label htmlFor={`${rk}_hint`} style={{...$.lbl, textTransform:"uppercase", letterSpacing:1}}>Optional Hint (Displayed during coding)</label>
      <textarea id={`${rk}_hint`} style={{...$.ta, minHeight:60, borderColor: "rgba(245, 158, 11, 0.3)", background: "rgba(245, 158, 11, 0.05)"}} 
        placeholder="e.g. You might want to use the .replace() string method..."
        value={cfg[rk].hint || ""}
        onChange={e=>setCfg(c=>({...c,[rk]:{...c[rk],hint:e.target.value}}))} />

      {/* Live Problem View (Student-Faced) */}
      <div style={{marginTop:32, padding:24, background:"rgba(0,0,0,0.3)", borderRadius:20, border:"1px solid rgba(255,255,255,0.05)", boxShadow:"0 10px 40px rgba(0,0,0,0.4)"}}>
        <div style={{fontSize:10, fontWeight:900, color:accentColor, letterSpacing:2, marginBottom:16, opacity:0.6, textTransform:"uppercase"}}>
          ✨ LIVE STUDENT PREVIEW
        </div>
        <h3 style={{fontSize:22, fontWeight:800, color:"#fff", marginBottom:12}}>{cfg[rk].title || "Untitled Problem"}</h3>
        
        {cfg[rk].imageUrl && (
          <div style={{marginBottom:20, borderRadius:12, overflow:"hidden", border:"1px solid rgba(255,255,255,0.1)"}}>
            <img src={cfg[rk].imageUrl} alt="Problem Visual" style={{width:"100%", display:"block"}} />
          </div>
        )}

        <div style={{fontSize:15, color:"#cbd5e1", lineHeight:1.7, marginBottom:24, whiteSpace:"pre-wrap"}}>
          {cfg[rk].description || "No description provided."}
        </div>
        
        {cfg[rk].targetOutput && (
          <div style={{marginBottom:24, padding:16, background:"rgba(255,255,255,0.03)", borderRadius:12, border:"1px solid rgba(255,255,255,0.05)"}}>
            <div style={{fontSize:10, fontWeight:800, color:"rgba(255,255,255,0.3)", textTransform:"uppercase", marginBottom:8}}>Expected Output Structure</div>
            <div style={{fontSize:13, color:accentColor, fontFamily:"'JetBrains Mono',monospace"}}>{cfg[rk].targetOutput}</div>
          </div>
        )}

        <div style={{marginBottom:24}}>
          <div style={{fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", marginBottom:10, textTransform:"uppercase"}}>Starter Code</div>
          <div style={{background:"#0d1117", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.1)"}}>
            <pre style={{margin:0, fontSize:12, fontFamily:"'JetBrains Mono',monospace", color:"#e2e8f0"}}>
              {cfg[rk].starterCode || "# No starter code"}
            </pre>
          </div>
        </div>

        <div>
          <div style={{fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", marginBottom:10, textTransform:"uppercase"}}>Verification Cases</div>
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            {cfg[rk].testCases.map((tc, idx) => (
              <div key={idx} style={{display:"flex", gap:12, alignItems:"center", background:"rgba(255,255,255,0.02)", padding:"10px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,0.05)"}}>
                <div style={{fontSize:10, fontWeight:900, color:accentColor, minWidth:20}}>#{idx+1}</div>
                <div style={{flex:1}}>
                  <span style={{fontSize:10, color:"rgba(255,255,255,0.3)", marginRight:8}}>IN:</span>
                  <code style={{fontSize:12, color:"#7adaa0"}}>{tc.input || "None"}</code>
                </div>
                <div style={{flex:1}}>
                  <span style={{fontSize:10, color:"rgba(255,255,255,0.3)", marginRight:8}}>OUT:</span>
                  <code style={{fontSize:12, color:accentColor}}>{tc.expected || "None"}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* JSON utility & Live Preview Trigger */}
      <div style={{marginTop:24, display:"flex", justifyContent:"flex-end", gap:12}}>
        <button 
          onClick={() => setShowPreview(true)}
          style={{
            padding: "10px 20px", borderRadius: 12, fontSize: 13, fontWeight: 800,
            background: "linear-gradient(135deg, #00dcff 0%, #0072ff 100%)", 
            border: "none", color: "#000", cursor: "pointer",
            boxShadow: "0 0 20px rgba(0, 220, 255, 0.3)",
            display: "flex", alignItems: "center", gap: 8
          }}
        >
          🚀 OPEN LIVE IDE PREVIEW
        </button>
        <button 
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(cfg[rk].testCases, null, 2));
            alert("Test cases copied to clipboard!");
          }}
          style={{
            padding: "10px 20px", borderRadius: 12, fontSize: 13, fontWeight: 700,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff", cursor: "pointer"
          }}
        >
          📋 Copy JSON
        </button>
      </div>

      {/* FULL-SCREEN LIVE PREVIEW MODAL */}
      {showPreview && (
        <div style={{
          position:"fixed", inset:0, zIndex:9999,
          background:"rgba(2, 6, 18, 0.98)",
          backdropFilter:"blur(12px)",
          display:"flex", flexDirection:"column",
          animation: "modalFadeIn 0.3s ease-out"
        }}>
          {/* Modal Header */}
          <div style={{
            padding:"16px 24px", 
            background:"rgba(13, 17, 23, 0.8)",
            borderBottom:"1px solid rgba(0, 220, 255, 0.1)",
            display:"flex", alignItems:"center", justifyContent:"space-between"
          }}>
            <div style={{display:"flex", alignItems:"center", gap:12}}>
              <div style={{width:12, height:12, borderRadius:"50%", background:"#ef4444"}} />
              <div style={{width:12, height:12, borderRadius:"50%", background:"#fbbf24"}} />
              <div style={{width:12, height:12, borderRadius:"50%", background:"#10b981"}} />
              <span style={{marginLeft:12, fontSize:14, fontWeight:800, color:"#00dcff", letterSpacing:1}}>
                LIVE IDE PREVIEW — ROUND {rn} ({label})
              </span>
            </div>
            <button 
              onClick={() => setShowPreview(false)}
              style={{
                background:"rgba(239, 68, 68, 0.1)", border:"1px solid rgba(239, 68, 68, 0.3)",
                color:"#f87171", padding:"8px 16px", borderRadius:10, fontSize:12, fontWeight:800,
                cursor:"pointer", transition:"all 0.2s"
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
            >
              ✕ CLOSE PREVIEW
            </button>
          </div>

          {/* Modal Content — Rendering the actual Student IDE component */}
          <div style={{flex:1, padding:32, overflowY:"auto"}}>
            <div style={{maxWidth:1400, margin:"0 auto"}}>
              <RoundCoding 
                problem={cfg[rk]}
                roundNum={rn}
                onComplete={() => alert("Success! This problem is fully solved and working.")}
                onWrong={() => {}} // No-op for admin preview
                showNextPartOnPass={false}
                isAdminPreview={true}
              />
            </div>
          </div>
          
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes modalFadeIn {
              from { opacity: 0; transform: scale(1.05); }
              to { opacity: 1; transform: scale(1); }
            }
          `}} />
        </div>
      )}
    </div>
  );
}
