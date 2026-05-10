"use client";

import styles from "./WarningModal.module.css";

interface WarningModalProps {
  warningCount: number;
  message: string;
  onDismiss?: () => void;
  onReenterFullscreen?: () => void;
}

const CONFIGS = {
  1: { icon: "⚠️", title: "Warning 1 of 4", color: "warning", dismissLabel: "I Understand — Return to Exam" },
  2: { icon: "🚨", title: "Warning 2 of 4", color: "danger",  dismissLabel: "I Understand — Return to Exam" },
  3: { icon: "🔴", title: "Warning 3 of 4 — FINAL WARNING", color: "danger", dismissLabel: "I Understand — Return to Exam" },
  4: { icon: "🔴", title: "Exam Auto-Submitted", color: "critical", dismissLabel: null },
};

export default function WarningModal({
  warningCount,
  message,
  onDismiss,
  onReenterFullscreen,
}: WarningModalProps) {
  const level = Math.min(warningCount, 4) as 1 | 2 | 3 | 4;
  const cfg = CONFIGS[level];

  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true">
      <div className={`${styles.modal} ${styles[cfg.color]}`}>
        <div className={styles.icon}>{cfg.icon}</div>

        <div className={styles.badge}>
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i < level ? styles.dotFilled : ""}`}
            />
          ))}
        </div>

        <h2 className={styles.title}>{cfg.title}</h2>
        <p className={styles.message}>{message}</p>

        {level < 4 && (
          <p className={styles.rule}>
            {level >= 3
              ? "🚨 One more violation and your exam will be auto-submitted!"
              : "Switching tabs, minimizing, or exiting fullscreen is not allowed."}
          </p>
        )}

        <div className={styles.actions}>
          {cfg.dismissLabel && onDismiss && (
            <button
              className={level <= 2 ? styles.btnPrimary : styles.btnDanger}
              onClick={() => {
                if (onReenterFullscreen) onReenterFullscreen();
                onDismiss();
              }}
            >
              {cfg.dismissLabel}
            </button>
          )}
        </div>

        {level >= 4 && (
          <p className={styles.final}>
            Your answers have been saved and submitted. You may close this window.
          </p>
        )}
      </div>
    </div>
  );
}
