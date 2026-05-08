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

/* ─── Types ─────────────────────────────────── */
interface MCQOption { label: string; text: string; }
interface MCQQuestion { id: string; question: string; options: MCQOption[]; correct: string; explanation: string; }
interface JumbleProblem { title: string; description: string; lines: string[]; }
interface CodingProblem { title: string; description: string; starterCode: string; testCases: {input:string;expected:string}[]; }
interface ClueConfig { clueText: string; unlockCode: string; }
interface PyHuntConfig {
  mcqQuestions: MCQQuestion[];
  jumbleProblem: JumbleProblem;
  round3: CodingProblem;
  round4: CodingProblem;
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

function loadCfg(): PyHuntConfig {
  if (typeof window === "undefined") return DEFAULT;
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT; }
  catch { return DEFAULT; }
}
function saveCfg(c: PyHuntConfig) { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); }

/* ─── Styles ─────────────────────────────────── */
const $ = {
  wrap: { padding:"24px 28px", color:"#c8daf0", fontFamily:"Inter,sans-serif", maxWidth:900 } as React.CSSProperties,
  topRow: { display:"flex", alignItems:"center", gap:12, marginBottom:6, flexWrap:"wrap" as const },
  h2: { fontSize:22, fontWeight:900, color:"#d0f0ff", margin:0 },
  sub: { fontSize:12, color:"#3a5578", marginBottom:24 },
  tabs: { display:"flex", gap:8, marginBottom:24, flexWrap:"wrap" as const },
  tab: { padding:"8px 18px", borderRadius:10, border:"1.5px solid rgba(0,220,255,0.15)", background:"rgba(0,220,255,0.04)", color:"#4a7090", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Inter,sans-serif" } as React.CSSProperties,
  tabOn: { background:"rgba(0,220,255,0.14)", borderColor:"rgba(0,220,255,0.4)", color:"#00dcff" } as React.CSSProperties,
  card: { background:"rgba(8,14,35,0.9)", border:"1px solid rgba(0,220,255,0.1)", borderRadius:14, padding:"18px 20px", marginBottom:14 } as React.CSSProperties,
  cardTitle: { fontSize:13, fontWeight:700, color:"#00dcff", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" } as React.CSSProperties,
  lbl: { fontSize:11, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase" as const, color:"#3a5578", marginBottom:5, display:"block" },
  inp: { width:"100%", background:"rgba(0,0,0,0.4)", border:"1.5px solid rgba(0,220,255,0.12)", borderRadius:8, padding:"10px 14px", color:"#c8daf0", fontSize:13, fontFamily:"Inter,sans-serif", outline:"none", boxSizing:"border-box" as const, marginBottom:12, transition:"border-color .2s" } as React.CSSProperties,
  ta: { width:"100%", background:"rgba(0,0,0,0.4)", border:"1.5px solid rgba(0,220,255,0.12)", borderRadius:8, padding:"10px 14px", color:"#c8daf0", fontSize:12, fontFamily:"'JetBrains Mono','Fira Code',monospace", outline:"none", boxSizing:"border-box" as const, resize:"vertical" as const, marginBottom:12 } as React.CSSProperties,
  row: { display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 } as React.CSSProperties,
  btnSave: { padding:"10px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#00dcff,#0066cc)", color:"#000", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:"Inter,sans-serif" } as React.CSSProperties,
  btnAdd: { padding:"8px 16px", borderRadius:8, border:"1.5px solid rgba(0,220,255,0.2)", background:"rgba(0,220,255,0.06)", color:"#00dcff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Inter,sans-serif" } as React.CSSProperties,
  btnDel: { padding:"8px 14px", borderRadius:8, border:"1.5px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.07)", color:"#f87171", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"Inter,sans-serif", flexShrink:0 } as React.CSSProperties,
  btnEdit: { padding:"6px 14px", borderRadius:8, border:"1.5px solid rgba(0,220,255,0.2)", background:"rgba(0,220,255,0.06)", color:"#60b8e0", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"Inter,sans-serif" } as React.CSSProperties,
  saved: { color:"#10b981", fontSize:13, fontWeight:700 },
  clueBadge: { padding:"4px 12px", borderRadius:20, background:"rgba(255,140,0,0.1)", border:"1px solid rgba(255,140,0,0.25)", color:"#ff9a30", fontSize:11, fontWeight:700 } as React.CSSProperties,
  codeBadge: { padding:"4px 12px", borderRadius:20, background:"rgba(0,220,255,0.08)", border:"1px solid rgba(0,220,255,0.2)", color:"#00dcff", fontSize:11, fontWeight:700 } as React.CSSProperties,
  info: { fontSize:12, color:"#3a5578", lineHeight:1.5, marginBottom:12 },
};

type SubTab = "clues" | "mcq" | "jumble" | "round3" | "round4";
const SUBTABS: { id:SubTab; label:string; icon:string }[] = [
  { id:"clues",  label:"Clues & Codes", icon:"🗝️" },
  { id:"mcq",    label:"MCQ Questions", icon:"📝" },
  { id:"jumble", label:"Code Jumble",   icon:"🔀" },
  { id:"round3", label:"Round 3 Code",  icon:"🐍" },
  { id:"round4", label:"Round 4 Code",  icon:"🔢" },
];
const ROUND_NAMES = ["Round 1 (MCQ)", "Round 2 (Jumble)", "Round 3 (Coding)", "Round 4 (Coding)", "Round 5 (Turtle)"];

export default function PyHuntAdminTab() {
  const [cfg, setCfg] = useState<PyHuntConfig>(DEFAULT);
  const [sub, setSub] = useState<SubTab>("clues");
  const [saved, setSaved] = useState(false);
  const [editIdx, setEditIdx] = useState<number|null>(null);

  useEffect(() => { setCfg(loadCfg()); }, []);

  const handleSave = () => {
    saveCfg(cfg);
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
    </div>
  );
}
