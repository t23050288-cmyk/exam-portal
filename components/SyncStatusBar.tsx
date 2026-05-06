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
  onDownload:    () => void;
}

const STATUS_CONFIG: Record<SyncStatus, { label: string; color: string; dot: string }> = {
  idle:     { label: "Saved",         color: "#10b981", dot: "🟢" },
  syncing:  { label: "Saving...",     color: "#f59e0b", dot: "🟡" },
  offline:  { label: "Offline",       color: "#ef4444", dot: "🔴" },
  degraded: { label: "Degraded",      color: "#f97316", dot: "🟠" },
  error:    { label: "Sync Error",    color: "#ef4444", dot: "🔴" },
};

export default function SyncStatusBar({ syncStatus, lastSyncedAt, offlineMsg, onDownload }: Props) {
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
            background:   "#1e293b",
            border:       "1px solid #f97316",
            color:        "#fed7aa",
            padding:      "10px 16px",
            borderRadius: "12px",
            fontSize:     "13px",
            maxWidth:     "320px",
            lineHeight:   "1.4",
          }}>
            {offlineMsg}
            <button
              onClick={onDownload}
              style={{
                marginLeft:   "8px",
                background:   "transparent",
                border:       "1px solid #f97316",
                color:        "#fb923c",
                padding:      "2px 8px",
                borderRadius: "6px",
                cursor:       "pointer",
                fontSize:     "12px",
              }}
            >
              💾 Backup
            </button>
          </div>
        )}

        {/* Status pill */}
        <div style={{
          background:   "#1e293b",
          border:       `1px solid ${cfg.color}`,
          padding:      "6px 14px",
          borderRadius: "99px",
          display:      "flex",
          alignItems:   "center",
          gap:          "6px",
          fontSize:     "13px",
          color:        "#e2e8f0",
          boxShadow:    "0 2px 8px rgba(0,0,0,0.3)",
        }}>
          <span>{cfg.dot}</span>
          <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
          {lastSyncedAt && syncStatus === "idle" && (
            <span style={{ color: "#64748b", fontSize: "11px" }}>
              {lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={onDownload}
            title="Download local backup"
            style={{
              background:   "transparent",
              border:       "none",
              cursor:       "pointer",
              padding:      "0 2px",
              color:        "#64748b",
              fontSize:     "14px",
            }}
          >
            💾
          </button>
        </div>
      </div>
    </>
  );
}
