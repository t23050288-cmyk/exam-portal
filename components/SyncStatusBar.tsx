/**
 * SyncStatusBar.tsx
 * Floating status bar shown during exam — shows sync state + offline warnings.
 * Includes "Download Backup" button.
 */
"use client";
import React from "react";

type SyncStatus = "idle" | "syncing" | "offline" | "degraded" | "error";

interface Props {
  syncStatus:    SyncStatus;
  lastSyncedAt:  Date | null;
  offlineMsg:    string | null;
}

const STATUS_CONFIG: Record<SyncStatus, { label: string; color: string; dot: string }> = {
  idle:     { label: "Saved",         color: "#10b981", dot: "🟢" },
  syncing:  { label: "Saving...",     color: "#f59e0b", dot: "🟡" },
  offline:  { label: "Offline",       color: "#ef4444", dot: "🔴" },
  degraded: { label: "Degraded",      color: "#f97316", dot: "🟠" },
  error:    { label: "Sync Error",    color: "#ef4444", dot: "🔴" },
};

export default function SyncStatusBar({ syncStatus, lastSyncedAt, offlineMsg }: Props) {
  const cfg = STATUS_CONFIG[syncStatus];

  return (
    <>
      {/* Floating status pill */}
      <div style={{
        position:   "fixed",
        bottom:     "16px",
        right:      "16px",
        zIndex:     9999,
        display:    "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap:        "8px",
      }}>
        {/* Offline / degraded banner */}
        {offlineMsg && (
          <div style={{
            background: "var(--panel-glass)",
            backdropFilter: "blur(20px)",
            border: "1px solid #f97316",
            color: "#fed7aa",
            padding: "12px 20px",
            borderRadius: "16px",
            fontSize: "14px",
            maxWidth: "340px",
            lineHeight: "1.5",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            animation: "fadeIn 0.3s ease",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span>⚠️</span>
              <div>
                {offlineMsg}
              </div>
            </div>
          </div>
        )}

        {/* Status pill */}
        <div style={{
          background: "var(--panel-glass)",
          backdropFilter: "blur(20px)",
          border: `1px solid ${cfg.color}66`,
          padding: "8px 16px",
          borderRadius: "99px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "13px",
          color: "var(--text-primary)",
          boxShadow: "0 4px 15px rgba(0,0,0,0.4)",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, boxShadow: `0 0 10px ${cfg.color}` }} />
          <span style={{ color: cfg.color, fontWeight: 700, letterSpacing: "0.02em" }}>{cfg.label}</span>
          {lastSyncedAt && syncStatus === "idle" && (
            <span style={{ color: "var(--text-secondary)", fontSize: "11px", fontWeight: 500 }}>
              Synced {lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
