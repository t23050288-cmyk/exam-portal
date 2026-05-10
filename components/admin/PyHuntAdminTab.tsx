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
  round3: CodingProblem;
  round4: CodingProblem;
  turtleProblem: TurtleProblem;
  clues: ClueConfig[];
  finishMessage: string;
}

/* ─── Defaults ───────────────────────────────── */
const DEFAULT: PyHuntConfig = {
  mcqQuestions: [
    { id:"q1", question:"What is the output of: print(type([]).__name__)?", options:[{label:"A",text:"list"},{label:"B",text:"array"},{label:"C",text:"List"},{label:"D",text:"tuple"}], correct:"A", explanation:"type([]) → <class 'list'>, .__name__ → 'list'." },
    { id:"q2", question:"Which keyword defines a generator function?", options:[{label:"A",text:"return"},{label:"B",text:"async"},{label:"C",text:"yield"},{label:"D",text:"lambda"}], correct:"C", explanation:"yield makes a function a generator." },
  ],
  jumbleProblem: { title:"Fix the Fibonacci!", description:"Drag lines into correct order so the function prints 13.", lines:["def fibonacci(n):","    if n <= 1:","        return n","    return fibonacci(n-1) + fibonacci(n-2)","","print(fibonacci(7))  # should print 13"] },
  round3: { title:"Palindrome Checker", description:"Write is_palindrome(s) → bool", starterCode:"def is_palindrome(s: str) -> bool:\n    pass\n", testCases:[{input:"racecar",expected:"True"},{input:"Hello",expected:"False"}] },
  round4: { title:"FizzBuzz Remix", description:"Write fizzbuzz(n) → list", starterCode:"def fizzbuzz(n: int) -> list:\n    pass\n\nprint(fizzbuzz(15))\n", testCases:[{input:"5",expected:"['1', '2', 'Fizz', '4', 'Buzz']"}] },
  turtleProblem: { title: "Final Challenge: Sketch the Star", description: "Use the turtle module to recreate the star shown below. A 5-pointed star has an internal angle of 144 degrees.", starterCode: "import turtle\nt = turtle.Turtle()\n" },
  clues: [
    { clueText:"🗝️ Round 1 Complete! Head to the Library — find the book with a red spine on shelf 2. Page 42 has a sticky note with your code.", unlockCode:"LIBRARY42" },
    { clueText:"🗝️ Round 2 Complete! Go to Lab-2 — check the whiteboard at the back of the room.", unlockCode:"LAB2CODE" },
    { clueText:"🗝️ Round 3 Complete! Walk to Room 301 corridor — locker 42 has a note taped inside.", unlockCode:"LOCKER301" },
    { clueText:"🗝️ Round 4 Complete! Return to the starting room — check under the facilitator's desk for an envelope.", unlockCode:"FINALENV" },
    { clueText:"🎉 ALL ROUNDS COMPLETE! Show this screen to your facilitator to claim your prize!", unlockCode:"" },
  ],
  finishMessage:"🏆 Congratulations! You've conquered PyHunt! You are a true Python treasure hunter!",
};

const STORAGE_KEY = "nexus_pyhunt_config_v2";

async function loadCfgAsync(): Promise<PyHuntConfig> {
  // Route through backend — bypasses Supabase RLS
  try {
    const json = await adminFetch<any>("/admin/pyhunt/config");
    if (json.ok && json.config) {
      const c = json.config;
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      }
      return { ...DEFAULT, ...c };
    }
  } catch (e) {
    console.warn("Backend load failed, falling back to localStorage:", e);
  }
  if (typeof window !== "undefined") {
    try { const s = localStorage.getItem(STORAGE_KEY); return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT; }
    catch { return DEFAULT; }
  }
  return DEFAULT;
}

async function saveCfgAsync(c: PyHuntConfig) {
  const str = JSON.stringify(c);
  // Always update localStorage so admin UI is snappy
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, str);
  }
  // Route save through backend (service role — bypasses RLS)
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

type SubTab = "clues" | "mcq" | "jumble" | "round3" | "round4" | "turtle" | "status";
const SUBTABS: { id:SubTab; label:string; icon:string }[] = [
  { id:"clues",  label:"Clues & Codes", icon:"🗝️" },
  { id:"mcq",    label:"MCQ Questions", icon:"📝" },
  { id:"jumble", label:"Code Jumble",   icon:"🔀" },
  { id:"round3", label:"Round 3 Code",  icon:"🐍" },
  { id:"round4", label:"Round 4 Code",  icon:"🔢" },
  { id:"turtle", label:"Round 5 Turtle",icon:"🐢" },
  { id:"status", label:"Live Status",   icon:"📡" },
];
const ROUND_NAMES = ["Round 1 (MCQ)", "Round 2 (Jumble)", "Round 3 (Coding)", "Round 4 (Coding)", "Round 5 (Turtle)"];

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
  const setTC = (r: "round3"|"round4", i: number, f: "input"|"expected", v: string) =>
    setCfg(c => { const tcs=[...c[r].testCases]; tcs[i]={...tcs[i],[f]:v}; return {...c,[r]:{...c[r],testCases:tcs}}; });
  const addTC = (r: "round3"|"round4") =>
    setCfg(c=>({...c,[r]:{...c[r],testCases:[...c[r].testCases,{input:"",expected:""}]}}));
  const delTC = (r: "round3"|"round4", i: number) =>
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
        Changes are saved to this device's localStorage and immediately visible to students using the same device / browser.
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
                {clue.unlockCode
                  ? <span style={$.codeBadge}>🔒 CODE: {clue.unlockCode}</span>
                  : <span style={$.clueBadge}>🔓 No code (final)</span>
                }
              </div>

              <label style={$.lbl}>Clue Text (shown to student after round)</label>
              <textarea
                style={{...$.ta, minHeight:72}}
                value={clue.clueText}
                onChange={e=>setClue(i,"clueText",e.target.value)}
                placeholder="e.g. 🗝️ Head to the library, look for the book with a red spine..."
              />

              {i < 4 && (
                <>
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
                </>
              )}
            </div>
          ))}

          <div style={$.card}>
            <label style={$.lbl}>🏆 Finish Message (shown after all 5 rounds)</label>
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
        <div style={$.card}>
          <div style={{...$.cardTitle}}>Round 2 — Code Jumble</div>
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
          <div style={$.info}>Students will drag these lines into order. They submit when they think it matches the correct sequence.</div>
        </div>
      )}

      {/* ══ ROUND 3 / 4 CODING ══ */}
      {(sub==="round3"||sub==="round4") && (() => {
        const rk = sub as "round3"|"round4";
        const rn = sub==="round3"?3:4;
        return (
          <div>
            <div style={$.card}>
              <div style={{...$.cardTitle}}>Round {rn} — Problem Statement</div>
              <label style={$.lbl}>Title</label>
              <input style={$.inp} value={cfg[rk].title} onChange={e=>setCfg(c=>({...c,[rk]:{...c[rk],title:e.target.value}}))} />
              <label style={$.lbl}>Description</label>
              <textarea style={{...$.ta,minHeight:80}} value={cfg[rk].description} onChange={e=>setCfg(c=>({...c,[rk]:{...c[rk],description:e.target.value}}))} />
              <label style={$.lbl}>Starter Code</label>
              <textarea style={{...$.ta,minHeight:200}} value={cfg[rk].starterCode} onChange={e=>setCfg(c=>({...c,[rk]:{...c[rk],starterCode:e.target.value}}))} />
            </div>
            <div style={$.card}>
              <div style={{...$.cardTitle}}>
                <span>Test Cases</span>
                <button style={$.btnAdd} onClick={()=>addTC(rk)}>+ Add Test</button>
              </div>
              <div style={{...$.info}}>
                Each test runs the student's code with the input piped to stdin, and compares output to expected. Input is the text passed to the function; expected is the exact stdout output.
              </div>
              {cfg[rk].testCases.map((tc,i)=>(
                <div key={i} style={$.row}>
                  <div style={{flex:1}}>
                    <label style={$.lbl}>Input (stdin / argument)</label>
                    <input style={{...$.inp,margin:0}} value={tc.input} onChange={e=>setTC(rk,i,"input",e.target.value)} placeholder="e.g. racecar" />
                  </div>
                  <div style={{flex:1}}>
                    <label style={$.lbl}>Expected Output (exact)</label>
                    <input style={{...$.inp,margin:0}} value={tc.expected} onChange={e=>setTC(rk,i,"expected",e.target.value)} placeholder="e.g. True" />
                  </div>
                  <div style={{paddingTop:24}}>
                    <button style={$.btnDel} onClick={()=>delTC(rk,i)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {sub==="turtle" && (
        <div>
          <div style={$.card}>
            <div style={$.cardTitle}>Round 5 — Problem Statement</div>
            <label style={$.lbl}>Title</label>
            <input style={$.inp} value={cfg.turtleProblem.title} onChange={e=>setCfg(c=>({...c,turtleProblem:{...c.turtleProblem,title:e.target.value}}))} />
            <label style={$.lbl}>Description</label>
            <textarea style={{...$.ta,minHeight:80}} value={cfg.turtleProblem.description} onChange={e=>setCfg(c=>({...c,turtleProblem:{...c.turtleProblem,description:e.target.value}}))} />
            <label style={$.lbl}>Starter Code</label>
            <textarea style={{...$.ta,minHeight:200}} value={cfg.turtleProblem.starterCode} onChange={e=>setCfg(c=>({...c,turtleProblem:{...c.turtleProblem,starterCode:e.target.value}}))} />
          </div>
          <div style={$.info}>
            💡 <strong>Round 5 Info:</strong> This round uses a Python Turtle interpreter (Pyodide). There are no automatic test cases because it is a creative round. Students are encouraged to draw the target but the system mainly checks if any drawing commands were executed.
          </div>
        </div>
      )}

      {/* ══ LIVE STATUS TAB ══ */}
      {sub==="status" && (
        <LiveStatusView />
      )}
    </div>
  );
}

function LiveStatusView() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArt, setSelectedArt] = useState<{id: string, name: string, img: string} | null>(null);

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('pyhunt_progress')
        .select('*')
        .order('last_active', { ascending: false });
      
      if (error) throw error;
      setStudents(data || []);
    } catch (err) {
      console.error("Fetch error:", err);
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

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
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
        <span>📡 Real-time Student Progress</span>
        <button style={$.btnAdd} onClick={fetchStatus}>🔄 Refresh</button>
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
              <th style={{padding:"12px 8px", color:"#3a5578"}}>ROUND STATUS</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>WARNINGS</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>LAST VIOLATION</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>LAST ACTIVE</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>STATUS</th>
              <th style={{padding:"12px 8px", color:"#3a5578"}}>TURTLE ART</th>
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
                      <div style={{fontSize:10, opacity:0.5}}>{s.student_id || "Anonymous"}</div>
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
                      background: isTerminated ? "rgba(239, 68, 68, 0.1)" : (isFinished ? "rgba(16,185,129,0.1)" : "rgba(0,220,255,0.1)"),
                      color: isTerminated ? "#ef4444" : (isFinished ? "#10b981" : "#00dcff"),
                      border: isTerminated ? "1px solid rgba(239, 68, 68, 0.2)" : (isFinished ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(0,220,255,0.2)")
                    }}>
                      {isTerminated ? "TERMINATED" : (isFinished ? "FINISHED" : "ACTIVE")}
                    </span>
                  </td>
                  <td style={{padding:"12px 8px"}}>
                    {s.turtle_image ? (
                     <div 
                        onClick={() => setSelectedArt({ id: s.student_id, name: s.student_name, img: s.turtle_image })}
                        style={{
                          width: 40, height: 30, background: "#000", borderRadius: 4, 
                          border: "1px solid rgba(0,220,255,0.3)", cursor: "pointer",
                          overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center"
                        }}
                      >
                        <img src={s.turtle_image} style={{ width: "100%", height: "100%", objectFit: "contain" }} alt="Art" />
                      </div>
                    ) : (
                      <span style={{ fontSize: 10, opacity: 0.3 }}>-</span>
                    )}
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
