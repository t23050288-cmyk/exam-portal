/**
 * AdminDashboard.tsx
 * - Throttle control works independently (no examId needed)
 * - Aggregate metrics shown when examId is available
 * - Student drill-down + export
 */
"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";

const ADMIN_SECRET =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_ADMIN_SECRET || "rudranshsarvam"
    : "rudranshsarvam";

const mkHeaders = () => ({
  "Content-Type": "application/json",
  "x-admin-secret": ADMIN_SECRET,
});

interface AggData {
  active_sessions: number; submitted_count: number; flagged_count: number;
  violations_by_severity: { low: number; medium: number; high: number };
  throttle_mode: string; last_updated: string;
}

interface StudentLog {
  session: Record<string,unknown>; events: Record<string,unknown>[]; violations: Record<string,unknown>[];
}

interface Props { examId?: string; }

const MODE_COLOR: Record<string,string> = {
  normal: "#10b981", safe: "#f59e0b", emergency: "#ef4444"
};

export default function AdminDashboard({ examId = "" }: Props) {
  const [agg, setAgg]               = useState<AggData|null>(null);
  const [throttleMode, setMode]     = useState("normal");
  const [throttleLoading, setTL]    = useState(false);
  const [throttleMsg, setMsg]       = useState<string|null>(null);
  const [drill, setDrill]           = useState<string|null>(null);
  const [log, setLog]               = useState<StudentLog|null>(null);
  const [logLoading, setLL]         = useState(false);
  const [aggErr, setAggErr]         = useState<string|null>(null);

  // Fetch current throttle mode (always works, no auth needed)
  const fetchThrottle = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/throttle_status");
      if (r.ok) { const d = await r.json(); setMode(d.throttle_mode || "normal"); }
    } catch { /* ignore */ }
  }, []);

  // Fetch aggregate (needs examId + auth)
  const fetchAgg = useCallback(async () => {
    if (!examId) return;
    try {
      const r = await fetch(`/api/admin/aggregate?exam_id=${examId}`, { headers: mkHeaders() });
      if (!r.ok) { setAggErr(`${r.status}`); return; }
      const d = await r.json();
      setAgg(d); setMode(d.throttle_mode || "normal"); setAggErr(null);
    } catch (e: unknown) { setAggErr(String(e)); }
  }, [examId]);

  useEffect(() => {
    fetchThrottle(); fetchAgg();
    const id = setInterval(() => { fetchThrottle(); fetchAgg(); }, 10_000);
    return () => clearInterval(id);
  }, [fetchThrottle, fetchAgg]);

  const setThrottle = async (mode: string) => {
    if (throttleLoading) return;
    setTL(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/throttle", {
        method: "POST", headers: mkHeaders(), body: JSON.stringify({ mode })
      });
      if (r.ok) {
        setMode(mode);
        setMsg(`✓ Switched to ${mode.toUpperCase()}`);
        setTimeout(() => setMsg(null), 2500);
      } else {
        setMsg(`Error ${r.status}: ${await r.text()}`);
      }
    } catch (e: unknown) { setMsg(`Error: ${String(e)}`); }
    finally { setTL(false); }
  };

  const drillDown = async (sid: string) => {
    setDrill(sid); setLog(null); setLL(true);
    try {
      const r = await fetch(`/api/admin/student_log?session_id=${sid}`, { headers: mkHeaders() });
      setLog(await r.json());
    } finally { setLL(false); }
  };

  const exportSession = async (sid: string) => {
    const r   = await fetch(`/api/export_session?session_id=${sid}`, { headers: mkHeaders() });
    const url = URL.createObjectURL(await r.blob());
    Object.assign(document.createElement("a"), { href: url, download: `session_${sid.slice(0,8)}.json` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ fontFamily: "system-ui", color: "#e2e8f0", padding: 24 }}>
      <h2 style={{ marginBottom: 20, color: "#f8fafc" }}>📊 Exam Dashboard</h2>

      {/* Metric cards */}
      {agg ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Active",      value: agg.active_sessions,               color: "#10b981" },
            { label: "Submitted",   value: agg.submitted_count,               color: "#60a5fa" },
            { label: "Flagged",     value: agg.flagged_count,                 color: "#f87171" },
            { label: "High Risk",   value: agg.violations_by_severity.high,   color: "#ef4444" },
            { label: "Medium Risk", value: agg.violations_by_severity.medium, color: "#f59e0b" },
          ].map(m => (
            <div key={m.label} style={{ background:"#1e293b", border:`1px solid ${m.color}33`, borderRadius:12, padding:16, textAlign:"center" }}>
              <div style={{ fontSize:"2rem", fontWeight:700, color:m.color }}>{m.value}</div>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:4 }}>{m.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginBottom:24, padding:12, borderRadius:8, background:"#1e293b", color:"#94a3b8", fontSize:13 }}>
          {aggErr ? `⚠️ Metrics unavailable (${aggErr})` : examId ? "Loading metrics…" : "ℹ️ No active exam selected — metrics will appear once an exam starts."}
        </div>
      )}

      {/* Throttle control — ALWAYS visible, works without examId */}
      <div style={{ background:"#1e293b", borderRadius:12, padding:16, marginBottom:24, border:`1px solid ${MODE_COLOR[throttleMode]||"#334155"}55` }}>
        <div style={{ marginBottom:10, fontWeight:600 }}>
          🎛️ Load Control — current:{" "}
          <span style={{ color: MODE_COLOR[throttleMode], fontWeight:700 }}>{throttleMode.toUpperCase()}</span>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {(["normal","safe","emergency"] as const).map(mode => (
            <button key={mode} onClick={() => setThrottle(mode)} disabled={throttleLoading}
              style={{
                background:   throttleMode===mode ? MODE_COLOR[mode] : "transparent",
                border:       `2px solid ${MODE_COLOR[mode]}`,
                color:        throttleMode===mode ? "#0f172a" : MODE_COLOR[mode],
                padding:      "8px 18px", borderRadius:8, cursor: throttleLoading?"not-allowed":"pointer",
                fontWeight:700, fontSize:13, opacity: throttleLoading?0.6:1, transition:"all 0.2s",
                transform:    throttleMode===mode ? "scale(1.05)" : "scale(1)",
              }}>
              {mode==="normal" ? "🟢 Normal (30s)" : mode==="safe" ? "🟡 Safe (60s)" : "🔴 Emergency (120s)"}
            </button>
          ))}
        </div>
        {throttleMsg && (
          <div style={{ marginTop:8, fontSize:12, color: throttleMsg.startsWith("✓")?"#10b981":"#f87171" }}>
            {throttleMsg}
          </div>
        )}
        <div style={{ fontSize:11, color:"#64748b", marginTop:8 }}>
          Clients poll every 60s and adjust autosave interval automatically.
        </div>
      </div>

      {agg && (
        <div style={{ fontSize:11, color:"#475569", marginBottom:16 }}>
          Last updated: {new Date(agg.last_updated).toLocaleTimeString()} · Auto-refreshes every 10s
        </div>
      )}

      {/* Drill-down */}
      {drill && (
        <div style={{ background:"#1e293b", borderRadius:12, padding:16, border:"1px solid #334155" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <h3 style={{ margin:0 }}>🔍 Session: {drill.slice(0,8)}…</h3>
            <div style={{ display:"flex", gap:8 }}>
              {/* Removed Export JSON as per user request */}
              <button onClick={() => { setDrill(null); setLog(null); }} style={{ background:"transparent", border:"1px solid #ef4444", color:"#f87171", padding:"4px 12px", borderRadius:6, cursor:"pointer", fontSize:12 }}>✕ Close</button>
            </div>
          </div>
          {logLoading && <div style={{ color:"#94a3b8" }}>Loading…</div>}
          {log && (
            <div>
              <div style={{ marginBottom:8, fontSize:13, color:"#94a3b8" }}>
                Status: <strong style={{ color:"#e2e8f0" }}>{String(log.session?.status)}</strong> |
                Events: <strong style={{ color:"#60a5fa" }}>{log.events.length}</strong> |
                Violations: <strong style={{ color:"#f87171" }}>{log.violations.length}</strong>
              </div>
              <div style={{ maxHeight:300, overflow:"auto", fontSize:12, fontFamily:"monospace" }}>
                {log.violations.map((v,i) => (
                  <div key={i} style={{ padding:"4px 8px", marginBottom:4, borderRadius:4, color:"#e2e8f0",
                    background: v.severity==="high"?"#450a0a":v.severity==="medium"?"#451a03":"#0f172a" }}>
                    {String(v.severity).toUpperCase()} · {String(v.violation_type)} × {String(v.count)}
                  </div>
                ))}
                {log.events.slice(0,50).map((ev,i) => (
                  <div key={i} style={{ padding:"2px 8px", color:"#8ba3c7" }}>
                    [{String(ev.created_at||"").slice(11,19)}] {String(ev.event_type)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
