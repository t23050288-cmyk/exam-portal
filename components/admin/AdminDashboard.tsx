/**
 * AdminDashboard.tsx
 * Aggregated exam monitoring with:
 *  - Active / submitted / flagged session counts
 *  - Violations by severity
 *  - Throttle toggle (normal / safe / emergency)
 *  - Drill-down: click student row → fetch events on demand
 *  - Export session JSON snapshot
 */
"use client";
import React, { useState, useEffect, useCallback } from "react";

interface AggregateData {
  exam_id:          string;
  active_sessions:  number;
  submitted_count:  number;
  flagged_count:    number;
  violations_by_severity: { low: number; medium: number; high: number };
  throttle_mode:    string;
  last_updated:     string;
}

interface StudentLog {
  session:    Record<string, unknown>;
  events:     Record<string, unknown>[];
  violations: Record<string, unknown>[];
}

interface Props {
  examId?: string;
  token?:  string;
}

export default function AdminDashboard({ examId = "", token = "" }: Props) {
  const [agg, setAgg]             = useState<AggregateData | null>(null);
  const [drillSession, setDrill]  = useState<string | null>(null);
  const [studentLog, setStudentLog] = useState<StudentLog | null>(null);
  const [loading, setLoading]     = useState(false);
  const [throttleLoading, setTL]  = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Use x-admin-secret header (same as adminFetch in lib/api.ts)
  const adminSecret = process.env.NEXT_PUBLIC_ADMIN_SECRET || "rudranshsarvam";
  const headers = { "Content-Type": "application/json", "x-admin-secret": adminSecret };

  const fetchAggregate = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/aggregate?exam_id=${examId}`, { headers });
      if (!res.ok) throw new Error(await res.text());
      setAgg(await res.json());
      setError(null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [examId, token]);

  useEffect(() => {
    fetchAggregate();
    const interval = setInterval(fetchAggregate, 10_000); // refresh every 10s
    return () => clearInterval(interval);
  }, [fetchAggregate]);

  const setThrottle = async (mode: string) => {
    setTL(true);
    try {
      await fetch("/api/admin/throttle", {
        method: "POST",
        headers,
        body: JSON.stringify({ mode }),
      });
      await fetchAggregate();
    } finally {
      setTL(false);
    }
  };

  const drillDown = async (sessionId: string) => {
    setDrill(sessionId);
    setStudentLog(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/student_log?session_id=${sessionId}`, { headers });
      setStudentLog(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const exportSession = async (sessionId: string) => {
    const res = await fetch(`/api/export_session?session_id=${sessionId}`, { headers });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `session_${sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) return <div style={{ color: "#f87171", padding: 16 }}>Error: {error}</div>;
  if (!agg)  return <div style={{ color: "#94a3b8", padding: 16 }}>Loading metrics…</div>;

  const modeColors: Record<string, string> = {
    normal:    "#10b981",
    safe:      "#f59e0b",
    emergency: "#ef4444",
  };

  return (
    <div style={{ fontFamily: "system-ui", color: "#e2e8f0", padding: "24px" }}>
      <h2 style={{ marginBottom: "20px", color: "#f8fafc" }}>📊 Exam Dashboard</h2>

      {/* Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "Active",     value: agg.active_sessions,  color: "#10b981" },
          { label: "Submitted",  value: agg.submitted_count,  color: "#60a5fa" },
          { label: "Flagged",    value: agg.flagged_count,    color: "#f87171" },
          { label: "High Risk",  value: agg.violations_by_severity.high,   color: "#ef4444" },
          { label: "Medium Risk",value: agg.violations_by_severity.medium, color: "#f59e0b" },
        ].map((m) => (
          <div key={m.label} style={{
            background:   "#1e293b",
            border:       `1px solid ${m.color}33`,
            borderRadius: "12px",
            padding:      "16px",
            textAlign:    "center",
          }}>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Throttle Control */}
      <div style={{
        background:   "#1e293b",
        borderRadius: "12px",
        padding:      "16px",
        marginBottom: "24px",
        border:       `1px solid ${modeColors[agg.throttle_mode] || "#334155"}55`,
      }}>
        <div style={{ marginBottom: "10px", fontWeight: 600 }}>
          🎛️ Load Control — current:{" "}
          <span style={{ color: modeColors[agg.throttle_mode], fontWeight: 700 }}>
            {agg.throttle_mode.toUpperCase()}
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {["normal", "safe", "emergency"].map((mode) => (
            <button
              key={mode}
              onClick={() => setThrottle(mode)}
              disabled={throttleLoading || agg.throttle_mode === mode}
              style={{
                background:   agg.throttle_mode === mode ? modeColors[mode] : "transparent",
                border:       `1px solid ${modeColors[mode]}`,
                color:        agg.throttle_mode === mode ? "#0f172a" : modeColors[mode],
                padding:      "6px 16px",
                borderRadius: "8px",
                cursor:       "pointer",
                fontWeight:   600,
                fontSize:     "13px",
                opacity:      throttleLoading ? 0.6 : 1,
              }}
            >
              {mode === "normal" ? "🟢 Normal (30s)" : mode === "safe" ? "🟡 Safe (60s)" : "🔴 Emergency (120s)"}
            </button>
          ))}
        </div>
        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "8px" }}>
          Clients poll throttle status every 60s and adjust autosave interval automatically.
        </div>
      </div>

      {/* Last updated */}
      <div style={{ fontSize: "11px", color: "#475569", marginBottom: "16px" }}>
        Last updated: {new Date(agg.last_updated).toLocaleTimeString()} · Auto-refreshes every 10s
      </div>

      {/* Student Drill-down */}
      {drillSession && (
        <div style={{
          background:   "#1e293b",
          borderRadius: "12px",
          padding:      "16px",
          border:       "1px solid #334155",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0 }}>🔍 Session: {drillSession.slice(0, 8)}…</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => exportSession(drillSession)}
                style={{ background: "#0f172a", border: "1px solid #334155", color: "#94a3b8", padding: "4px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
              >
                📥 Export JSON
              </button>
              <button
                onClick={() => { setDrill(null); setStudentLog(null); }}
                style={{ background: "transparent", border: "1px solid #ef4444", color: "#f87171", padding: "4px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
              >
                ✕ Close
              </button>
            </div>
          </div>
          {loading && <div style={{ color: "#94a3b8" }}>Loading events…</div>}
          {studentLog && (
            <>
              <div style={{ marginBottom: "8px", fontSize: "13px", color: "#94a3b8" }}>
                Status: <strong style={{ color: "#e2e8f0" }}>{String(studentLog.session?.status)}</strong> |
                Events: <strong style={{ color: "#60a5fa" }}>{studentLog.events.length}</strong> |
                Violations: <strong style={{ color: "#f87171" }}>{studentLog.violations.length}</strong>
              </div>
              <div style={{ maxHeight: "300px", overflow: "auto", fontSize: "12px", fontFamily: "monospace" }}>
                {studentLog.violations.map((v: Record<string, unknown>, i) => (
                  <div key={i} style={{
                    padding: "4px 8px", marginBottom: "4px",
                    background: v.severity === "high" ? "#450a0a" : v.severity === "medium" ? "#451a03" : "#0f172a",
                    borderRadius: "4px", color: "#e2e8f0",
                  }}>
                    {String(v.severity).toUpperCase()} · {String(v.violation_type)} × {String(v.count)}
                  </div>
                ))}
                {studentLog.events.slice(0, 50).map((ev: Record<string, unknown>, i) => (
                  <div key={i} style={{ padding: "2px 8px", color: "#64748b" }}>
                    [{String(ev.created_at || "").slice(11, 19)}] {String(ev.event_type)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
