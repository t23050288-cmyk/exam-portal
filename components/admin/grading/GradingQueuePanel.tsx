"use client";
import { useState, useEffect, useCallback } from "react";

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "rudranshsarvam";
const H = { "Content-Type":"application/json", "x-admin-secret": ADMIN_SECRET };

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api${path}`, { headers: H, ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

interface Job {
  id:string; session_id:string; user_id:string; status:string;
  attempts:number; created_at:string; graded_at:string|null; last_error:string|null;
}
const SC: Record<string,string> = {
  pending:"#f59e0b", processing:"#60a5fa", done:"#10b981", failed:"#ef4444"
};

export default function GradingQueuePanel() {
  const [jobs, setJobs]             = useState<Job[]>([]);
  const [loading, setLoading]       = useState(false);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg]               = useState<string|null>(null);
  const [filter, setFilter]         = useState("all");
  const [manualJob, setManualJob]   = useState<Job|null>(null);
  const [score, setScore]           = useState("");
  const [total, setTotal]           = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter !== "all" ? `?status=${filter}` : "";
      const d = await api<{items:Job[]}>(`/admin/grading_queue${q}`);
      setJobs(d.items || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const processNow = async () => {
    setProcessing(true); setMsg(null);
    try {
      const d = await api<{processed:number}>("/admin/process_grading?batch=5", {method:"POST"});
      setMsg(`✓ Processed ${d.processed} jobs`);
      load();
    } catch (e:unknown) { setMsg(`Error: ${e}`); }
    finally { setProcessing(false); setTimeout(()=>setMsg(null),4000); }
  };

  const retry = async (id:string) => {
    await api(`/admin/grading/${id}/retry`, {method:"POST"}); load();
  };

  const manualGrade = async () => {
    if (!manualJob) return;
    await api(`/admin/grading/${manualJob.id}/manual`, {
      method:"POST", body: JSON.stringify({score:+score,total_marks:+total,notes:"Manual"})
    });
    setManualJob(null); load();
  };

  const counts = jobs.reduce((a,j)=>({...a,[j.status]:(a[j.status]||0)+1}),{} as Record<string,number>);

  return (
    <div style={{ padding:24, fontFamily:"system-ui", color:"#e2e8f0" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ margin:0, color:"#f8fafc" }}>⚙️ Grading Queue</h2>
        <button onClick={processNow} disabled={processing}
          style={{ padding:"10px 20px", borderRadius:8, border:"none",
            background:processing?"#334155":"#6366f1", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }}>
          {processing ? "Processing…" : "▶ Process 5 Jobs"}
        </button>
      </div>

      {/* Summary */}
      <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        {["pending","processing","done","failed"].map(s=>(
          <div key={s} style={{ background:"#1e293b", border:`1px solid ${SC[s]}44`, borderRadius:10, padding:"10px 16px", textAlign:"center", minWidth:80 }}>
            <div style={{ fontSize:22, fontWeight:700, color:SC[s] }}>{counts[s]||0}</div>
            <div style={{ fontSize:11, color:"#64748b", textTransform:"capitalize" }}>{s}</div>
          </div>
        ))}
      </div>

      {msg && (
        <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:16, fontSize:13,
          background: msg.startsWith("✓")?"#052e16":"#450a0a",
          color:      msg.startsWith("✓")?"#34d399":"#f87171" }}>
          {msg}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {["all","pending","processing","done","failed"].map(s=>(
          <button key={s} onClick={()=>setFilter(s)} style={{
            padding:"4px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600,
            border:`1px solid ${filter===s?"#6366f1":"#334155"}`,
            background: filter===s?"#6366f1":"transparent",
            color:      filter===s?"#fff":"#94a3b8" }}>
            {s}
          </button>
        ))}
        <button onClick={load} style={{ padding:"4px 12px", borderRadius:20, border:"1px solid #334155", background:"transparent", color:"#94a3b8", cursor:"pointer", fontSize:12 }}>
          🔄
        </button>
      </div>

      {/* Job list */}
      {loading ? <div style={{ color:"#64748b", textAlign:"center", padding:40 }}>Loading…</div>
       : jobs.length===0 ? <div style={{ color:"#64748b", textAlign:"center", padding:40 }}>No jobs</div>
       : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {jobs.map(j=>(
            <div key={j.id} style={{ background:"#1e293b", border:`1px solid ${SC[j.status]||"#334155"}33`,
              borderRadius:10, padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:SC[j.status], flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>Session: {j.session_id.slice(0,12)}…</div>
                <div style={{ fontSize:11, color:"#64748b" }}>
                  {new Date(j.created_at).toLocaleString()} · Attempts: {j.attempts}
                  {j.last_error && <span style={{ color:"#f87171" }}> · {j.last_error}</span>}
                </div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:SC[j.status], textTransform:"uppercase",
                padding:"2px 8px", border:`1px solid ${SC[j.status]}44`, borderRadius:20 }}>
                {j.status}
              </span>
              {j.status==="failed" && (
                <button onClick={()=>retry(j.id)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #f59e0b", background:"transparent", color:"#f59e0b", fontSize:11, cursor:"pointer" }}>
                  Retry
                </button>
              )}
              {(j.status==="pending"||j.status==="failed") && (
                <button onClick={()=>{ setManualJob(j); setScore(""); setTotal(""); }} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #60a5fa", background:"transparent", color:"#60a5fa", fontSize:11, cursor:"pointer" }}>
                  Manual
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Manual grade modal */}
      {manualJob && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:16, padding:32, width:340 }}>
            <h3 style={{ margin:"0 0 16px", color:"#f8fafc" }}>✏️ Manual Grade</h3>
            <p style={{ color:"#64748b", fontSize:13, margin:"0 0 16px" }}>Session: {manualJob.session_id.slice(0,16)}…</p>
            {[["SCORE", score, setScore],["TOTAL MARKS", total, setTotal]].map(([label, val, setter])=>(
              <div key={String(label)} style={{ marginBottom:12 }}>
                <label style={{ color:"#94a3b8", fontSize:12, display:"block", marginBottom:4 }}>{String(label)}</label>
                <input type="number" value={String(val)} onChange={e=>(setter as (v:string)=>void)(e.target.value)}
                  style={{ width:"100%", padding:"8px 12px", borderRadius:6, border:"1px solid #334155", background:"#0f172a", color:"#e2e8f0", fontSize:14, boxSizing:"border-box" }} />
              </div>
            ))}
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <button onClick={manualGrade} style={{ flex:1, padding:10, borderRadius:8, border:"none", background:"#10b981", color:"#fff", fontWeight:700, cursor:"pointer" }}>Save</button>
              <button onClick={()=>setManualJob(null)} style={{ flex:1, padding:10, borderRadius:8, border:"1px solid #334155", background:"transparent", color:"#94a3b8", cursor:"pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
