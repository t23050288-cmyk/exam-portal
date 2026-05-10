"use client";

import styles from "./WarningModal.module.css";

interface WarningModalProps {
  warningCount: number;
  message: string;
  onDismiss?: () => void;
  onReenterFullscreen?: () => void;
}

const CONFIGS = {
  1: { icon: "⚠️", title: "Warning 1 of 3", color: "warning", dismissLabel: "I Understand — Return to Exam" },
  2: { icon: "🚨", title: "Warning 2 of 3 — FINAL WARNING", color: "danger", dismissLabel: "I Understand — Return to Exam" },
  3: { icon: "🔴", title: "Exam Auto-Submitted", color: "critical", dismissLabel: null },
};

export default function WarningModal({
  warningCount,
  message,
  onDismiss,
  onReenterFullscreen,
}: WarningModalProps) {
  const level = Math.min(warningCount, 3) as 1 | 2 | 3;
  const cfg = CONFIGS[level];

  return (
    <div
      className={styles.overlay}
      role="alertdialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "all",
      }}
    >
      <div
        className={`${styles.modal} ${styles[cfg.color]}`}
        style={{
          background: level === 3 ? "rgba(30,0,0,0.95)" : "rgba(15,15,30,0.97)",
          border: `2px solid ${level === 3 ? "#ef4444" : level === 2 ? "#f97316" : "#eab308"}`,
          borderRadius: 20,
          padding: "36px 40px",
          maxWidth: 420,
          width: "90%",
          textAlign: "center",
          boxShadow: `0 0 60px ${level === 3 ? "rgba(239,68,68,0.4)" : "rgba(234,179,8,0.2)"}`,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>{cfg.icon}</div>

        {/* Warning dots — PyHunt style */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 16 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              style={{
                width: 14, height: 14, borderRadius: "50%",
                background: i < level ? "#ef4444" : "rgba(255,255,255,0.12)",
                border: `1.5px solid ${i < level ? "#ef4444" : "rgba(255,255,255,0.2)"}`,
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        <h2 style={{
          fontSize: 20, fontWeight: 700, color: level === 3 ? "#ef4444" : "#fff",
          marginBottom: 10, textShadow: level === 3 ? "0 0 20px rgba(239,68,68,0.5)" : "none",
        }}>
          {cfg.title}
        </h2>

        <p style={{ color: "#e2e8f0", fontSize: 15, marginBottom: 16, lineHeight: 1.6 }}>
          DETECTED: <strong>{message.split(":").pop()?.trim() || message}</strong>
        </p>

        {level < 3 && (
          <p style={{
            color: level === 2 ? "#fca5a5" : "#fde68a",
            fontSize: 13, fontWeight: 600, marginBottom: 20,
          }}>
            {level >= 2
              ? "🚨 One more violation and your exam will be auto-submitted!"
              : "After 3 violations, your exam will be automatically submitted."}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "center" }}>
          {cfg.dismissLabel && onDismiss && (
            <button
              onClick={() => {
                if (onReenterFullscreen) onReenterFullscreen();
                onDismiss();
              }}
              style={{
                background: level <= 1
                  ? "linear-gradient(135deg, #eab308, #ca8a04)"
                  : "linear-gradient(135deg, #ef4444, #991b1b)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "12px 28px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
            >
              {cfg.dismissLabel}
            </button>
          )}
        </div>

        {level >= 3 && (
          <p style={{ color: "#fca5a5", fontSize: 13, marginTop: 16, fontWeight: 600 }}>
            Your answers have been saved and submitted. Please contact your facilitator.
          </p>
        )}
      </div>
    </div>
  );
}
