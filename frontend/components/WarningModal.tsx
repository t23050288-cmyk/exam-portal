"use client";

import styles from "./WarningModal.module.css";

interface WarningModalProps {
  warningCount: number;        // 1, 2, or 3
  message: string;
  onDismiss?: () => void;      // null for level 3 (exam auto-submitted)
  onReenterFullscreen?: () => void;
}

const CONFIGS = {
  1: {
    icon: "⚠️",
    title: "Warning 1 of 3",
    color: "warning",
    dismissLabel: "Re-enter Fullscreen & Return",
  },
  2: {
    icon: "🚨",
    title: "Final Warning — 2 of 3",
    color: "danger",
    dismissLabel: "I Understand — Re-enter Fullscreen",
  },
  3: {
    icon: "🔴",
    title: "Exam Auto-Submitted",
    color: "critical",
    dismissLabel: null,
  },
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
    <div className={styles.overlay} role="alertdialog" aria-modal="true">
      <div className={`${styles.modal} ${styles[cfg.color]}`}>
        <div className={styles.icon}>{cfg.icon}</div>

        <div className={styles.badge}>
          {Array.from({ length: 3 }, (_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i < level ? styles.dotFilled : ""}`}
            />
          ))}
        </div>

        <h2 className={styles.title}>{cfg.title}</h2>
        <p className={styles.message}>{message}</p>

        {level < 3 && (
          <p className={styles.rule}>
            {level === 1
              ? "Switching tabs, minimizing, or exiting fullscreen is not allowed."
              : "Your exam will be auto-submitted on the next violation."}
          </p>
        )}

        <div className={styles.actions}>
          {cfg.dismissLabel && onDismiss && (
            <button
              id={`warning-dismiss-${level}`}
              className={`btn ${level === 1 ? "btn-primary" : "btn-danger"} btn-lg`}
              onClick={() => {
                if (onReenterFullscreen) onReenterFullscreen();
                onDismiss();
              }}
            >
              {cfg.dismissLabel}
            </button>
          )}
        </div>

        {level === 3 && (
          <p className={styles.final}>
            Your answers have been saved and submitted. You may close this window.
          </p>
        )}
      </div>
    </div>
  );
}
