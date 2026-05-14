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

/* ─── Types ─────────────────────────────────── */
interface MCQOption { label: string; text: string; }
interface MCQQuestion { id: string; question: string; options: MCQOption[]; correct: string; explanation: string; }
interface JumbleProblem { title: string; description: string; lines: string[]; }
interface CodingProblem { title: string; description: string; starterCode: string; testCases: {input:string;expected:string}[]; }
interface ClueConfig { clueText: string; unlockCode: string; }
interface TurtleProblem { title: string; description: string; starterCode: string; }
interface PyHuntConfig {
  mcqQuestions: MCQQuestion[];
  jumbleProblem: JumbleProblem;
  jumbleProblemB: JumbleProblem;
  round3: CodingProblem;
  round3b: CodingProblem;        // Round 3 Part 2
  round4: CodingProblem;
  round4UnlockCode: string;
  clues: ClueConfig[];
  finishMessage: string;
}

/* ─── Defaults ───────────────────────────────── */
const DEFAULT: PyHuntConfig = {
  mcqQuestions: [
    { id:"q1", question:"What is the output of: print(type([]).__name__)?", options:[{label:"A",text:"list"},{label:"B",text:"array"},{label:"C",text:"List"},{label:"D",text:"tuple"}], correct:"A", explanation:"type([]) → <class 'list'>, .__name__ → 'list'." },
    { id:"q2", question:"Which keyword defines a generator function?", options:[{label:"A",text:"return"},{label:"B",text:"async"},{label:"C",text:"yield"},{label:"D",text:"lambda"}], correct:"C", explanation:"yield makes a function a generator." },
  ],
  jumbleProblem: { title:"Fibonacci! (Round 2 Part 1)", description:"Drag lines into correct order so the function prints 13.", lines:["def fibonacci(n):","    if n <= 1:","        return n","    return fibonacci(n-1) + fibonacci(n-2)","","print(fibonacci(7))  # should print 13"] },
  jumbleProblemB: { title:"Factorial! (Round 2 Part 2)", description:"Drag lines into correct order so the function prints 120.", lines:["def factorial(n):","    if n <= 1:","        return 1","    return n * factorial(n-1)","","print(factorial(5))  # should print 120"] },
  round3: { title:"Palindrome Checker (Part 1)", description:"Write is_palindrome(s) → bool", starterCode:"def is_palindrome(s: str) -> bool:\n    pass\n", testCases:[{input:"racecar",expected:"True"},{input:"Hello",expected:"False"}] },
  round3b: { title:"Count Vowels (Part 2)", description:"Write count_vowels(s) → int", starterCode:"def count_vowels(s: str) -> int:\n    pass\n", testCases:[{input:"hello",expected:"2"}] },
  round4: { title:"FizzBuzz Remix (Round 4)", description:"Write fizzbuzz(n) → list", starterCode:"def fizzbuzz(n: int) -> list:\n    pass\n\nprint(fizzbuzz(15))\n", testCases:[{input:"5",expected:"['1', '2', 'Fizz', '4', 'Buzz']"}] },
  clues: [
    { clueText:"🗝️ Round 1 Complete! Find your next code in the Library.", unlockCode:"LIBRARY" },
    { clueText:"🗝️ Round 2 Complete! Find your next code in Lab-2.", unlockCode:"LAB2" },
    { clueText:"🗝️ Round 3 Complete! Find your next code in Locker 301.", unlockCode:"LOCKER301" },
    { clueText:"🗝️ Round 4 Complete! Hunt Over! Enter code to see your Results.", unlockCode:"FINISH" },
  ],
  round4UnlockCode: "FINISH",
  finishMessage:"🏆 Congratulations on completion of 4th round! Now proceed to the 5th offline round.",
};

const STORAGE_KEY = "nexus_pyhunt_config_v2";

async function loadCfgAsync(): Promise<PyHuntConfig> {
  // Always load from backend DB — centralized, works across all devices
  try {
    const json = await adminFetch<any>("/admin/pyhunt/config");
    if (json.ok && json.config) {
      return { ...DEFAULT, ...json.config };
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
  lbl: { fontSize:11, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase" as const, color:"rgba(216, 234, 242, 0.4)", marginBottom:8, display:"block" },
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

  useEffect(() => { 
    loadCfgAsync().then(c => setCfg(c)); 
  }, []);

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
  const setClue = (i: number, f: keyof ClueConfig, v: string) =>
    setCfg(c => { const cl=[...c.clues]; cl[i]={...cl[i],[f]:v}; return {...c,clues:cl}; });

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
          <div style={$.info}>
            After each round completes, students see the <strong>Clue Text</strong> — a physical location hint. They go find the code in the real world, type the <strong>Unlock Code</strong> here, and get access to the next round. Leave Unlock Code blank for the last round.
          </div>

          {cfg.clues.map((clue, i) => (
            <div key={i} style={$.card}>
              <div style={$.cardTitle}>
                <span>
                  <span style={{color:"#7090b0",marginRight:8}}>After</span>
                  {ROUND_NAMES[i]}
                </span>
              </div>

              <label style={$.lbl}>Clue Text (shown to student after round)</label>
              <textarea
                style={{...$.ta, minHeight:72}}
                value={clue.clueText}
                onChange={e=>setClue(i,"clueText",e.target.value)}
                placeholder="e.g. 🗝️ Head to the library, look for the book with a red spine..."
              />

              <label style={$.lbl}>Unlock Code (student must type this to proceed)</label>
              <input
                style={$.inp}
                value={clue.unlockCode}
                onChange={e=>setClue(i,"unlockCode",e.target.value.toUpperCase())}
                placeholder="e.g. PYTHON42 (case-insensitive)"
              />
              <div style={{...$.info, marginBottom:0}}>
                💡 Tip: Use a short memorable word. Students enter it case-insensitively.
              </div>
            </div>
          ))}

          <div style={$.card}>
            <label style={$.lbl}>🏆 Finish Message (shown after all rounds)</label>
            <textarea
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
                  <label style={$.lbl}>Question</label>
                  <textarea style={{...$.ta,minHeight:60}} value={q.question} onChange={e=>setMCQ(qi,"question",e.target.value)} />

                  <label style={$.lbl}>Options</label>
                  {q.options.map((opt, oi) => (
                    <div key={opt.label} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                      <span style={{color:"#00dcff",fontWeight:800,width:20,flexShrink:0}}>{opt.label}.</span>
                      <input style={{...$.inp,margin:0,flex:1}} value={opt.text} onChange={e=>setOpt(qi,oi,e.target.value)} />
                    </div>
                  ))}

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div>
                      <label style={$.lbl}>Correct Answer</label>
                      <select style={{...$.inp,width:"auto"}} value={q.correct} onChange={e=>setMCQ(qi,"correct",e.target.value)}>
                        {q.options.map(o=><option key={o.label} value={o.label}>{o.label} — {o.text}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={$.lbl}>Explanation (shown after answer)</label>
                      <input style={$.inp} value={q.explanation} onChange={e=>setMCQ(qi,"explanation",e.target.value)} placeholder="Why is this the right answer?" />
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
            <label style={$.lbl}>Title</label>
            <input style={$.inp} value={cfg.jumbleProblem.title} onChange={e=>setCfg(c=>({...c,jumbleProblem:{...c.jumbleProblem,title:e.target.value}}))} />
            <label style={$.lbl}>Description</label>
            <textarea style={{...$.ta,minHeight:60}} value={cfg.jumbleProblem.description} onChange={e=>setCfg(c=>({...c,jumbleProblem:{...c.jumbleProblem,description:e.target.value}}))} />
            <label style={$.lbl}>Code Lines — enter in CORRECT order (one per line). Students see them shuffled.</label>
            <textarea
              style={{...$.ta,minHeight:180}}
              value={cfg.jumbleProblem.lines.join("\n")}
              onChange={e=>setCfg(c=>({...c,jumbleProblem:{...c.jumbleProblem,lines:e.target.value.split("\n")}}))}
            />
          </div>

          <div style={$.card}>
            <div style={{...$.cardTitle, color: "#a78bfa"}}>Round 2 — Problem 2 (Part B)</div>
            <label style={$.lbl}>Title</label>
            <input style={$.inp} value={cfg.jumbleProblemB.title} onChange={e=>setCfg(c=>({...c,jumbleProblemB:{...c.jumbleProblemB,title:e.target.value}}))} />
            <label style={$.lbl}>Description</label>
            <textarea style={{...$.ta,minHeight:60}} value={cfg.jumbleProblemB.description} onChange={e=>setCfg(c=>({...c,jumbleProblemB:{...c.jumbleProblemB,description:e.target.value}}))} />
            <label style={$.lbl}>Code Lines — enter in CORRECT order (one per line). Students see them shuffled.</label>
            <textarea
              style={{...$.ta,minHeight:180}}
              value={cfg.jumbleProblemB.lines.join("\n")}
              onChange={e=>setCfg(c=>({...c,jumbleProblemB:{...c.jumbleProblemB,lines:e.target.value.split("\n")}}))}
            />
          </div>
        </div>
      )}

      {/* ══ ROUND 3 / 4 CODING ══ */}
      {(sub==="round3"||sub==="round4") && (() => {
        const rk1 = sub as "round3"|"round4";
        const isR3 = sub==="round3";
        const rk2 = isR3 ? "round3b" : null;
        const rn = isR3?3:4;
        
        return (
          <div>
            <div style={$.card}>
              <div style={{...$.cardTitle}}>Round {rn} — {isR3 ? "Problem 1" : "Coding Problem"}</div>
              <label style={$.lbl}>Title</label>
              <input style={$.inp} value={cfg[rk1].title} onChange={e=>setCfg(c=>({...c,[rk1]:{...c[rk1],title:e.target.value}}))} />
              <label style={$.lbl}>Description</label>
              <textarea style={{...$.ta,minHeight:80}} value={cfg[rk1].description} onChange={e=>setCfg(c=>({...c,[rk1]:{...c[rk1],description:e.target.value}}))} />
              <label style={$.lbl}>Starter Code</label>
              <textarea style={{...$.ta,minHeight:150}} value={cfg[rk1].starterCode} onChange={e=>setCfg(c=>({...c,[rk1]:{...c[rk1],starterCode:e.target.value}}))} />
              
              <div style={{...$.cardTitle, marginTop: 24}}>Test Cases <button style={$.btnAdd} onClick={()=>addTC(rk1)}>+ Add Test</button></div>
              {cfg[rk1].testCases.map((tc,i)=>(
                <div key={i} style={$.row}>
                  <div style={{flex:1}}><input style={{...$.inp,margin:0}} value={tc.input} onChange={e=>setTC(rk1,i,"input",e.target.value)} placeholder="Input" /></div>
                  <div style={{flex:1}}><input style={{...$.inp,margin:0}} value={tc.expected} onChange={e=>setTC(rk1,i,"expected",e.target.value)} placeholder="Expected" /></div>
                  <button style={$.btnDel} onClick={()=>delTC(rk1,i)}>✕</button>
                </div>
              ))}
            </div>

            {rk2 && (
              <div style={$.card}>
                <div style={{...$.cardTitle, color: "#a78bfa"}}>Round {rn} — Problem 2</div>
                <label style={$.lbl}>Title</label>
                <input style={$.inp} value={cfg[rk2].title} onChange={e=>setCfg(c=>({...c,[rk2]:{...c[rk2],title:e.target.value}}))} />
                <label style={$.lbl}>Description</label>
                <textarea style={{...$.ta,minHeight:80}} value={cfg[rk2].description} onChange={e=>setCfg(c=>({...c,[rk2]:{...c[rk2],description:e.target.value}}))} />
                <label style={$.lbl}>Starter Code</label>
                <textarea style={{...$.ta,minHeight:150}} value={cfg[rk2].starterCode} onChange={e=>setCfg(c=>({...c,[rk2]:{...c[rk2],starterCode:e.target.value}}))} />
                
                <div style={{...$.cardTitle, marginTop: 24, color: "#a78bfa"}}>Test Cases (Part 2) <button style={{...$.btnAdd, color: "#a78bfa", borderColor: "rgba(167,139,250,0.3)"}} onClick={()=>addTC(rk2)}>+ Add Test</button></div>
                {cfg[rk2].testCases.map((tc,i)=>(
                  <div key={i} style={$.row}>
                    <div style={{flex:1}}><input style={{...$.inp,margin:0}} value={tc.input} onChange={e=>setTC(rk2,i,"input",e.target.value)} placeholder="Input" /></div>
                    <div style={{flex:1}}><input style={{...$.inp,margin:0}} value={tc.expected} onChange={e=>setTC(rk2,i,"expected",e.target.value)} placeholder="Expected" /></div>
                    <button style={$.btnDel} onClick={()=>delTC(rk2,i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ LIVE STATUS TAB ══ */}
      {sub==="status" && <LiveStatusView />}
      {sub==="marks" && <MarksView cfg={cfg} />}
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
                  <div style={{fontSize:10, opacity:0.6}}>{s.student_usn}</div>
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

  const removeStudent = async (studentId: string) => {
    if (!confirm("Permanently remove this student from the progress board?")) return;
    try {
      const res = await adminFetch<any>(`/admin/pyhunt/progress/${studentId}`, {
        method: "DELETE"
      });
      if (res.ok) fetchStatus();
      else alert("Failed to remove student.");
    } catch (err) {
      console.error("Remove error:", err);
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
        <button style={$.btnAdd} onClick={() => { fetchStatus(); setCountdown(60); }}>🔄 Refresh Now</button>
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
                      <div style={{fontSize:10, opacity:0.6, color: "#00dcff", fontWeight: 700}}>{s.student_usn || s.student_id || "Anonymous"}</div>
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
