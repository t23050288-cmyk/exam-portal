"use client";

import { useEffect, useState, useRef } from "react";
import styles from "./ExamTimer.module.css";

interface ExamTimerProps {
  startTime: string;          // ISO timestamp when exam started
  durationMinutes: number;    // exam length in minutes
  onExpire: () => void;       // called when timer hits 0
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export default function ExamTimer({ startTime, durationMinutes, onExpire }: ExamTimerProps) {
  const [remaining, setRemaining] = useState<number>(0);
  const expiredRef = useRef(false);

  useEffect(() => {
    function calcRemaining() {
      const endMs =
        new Date(startTime).getTime() + durationMinutes * 60 * 1000;
      return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
    }

    // Set initial value
    setRemaining(calcRemaining());

    const id = setInterval(() => {
      const secs = calcRemaining();
      setRemaining(secs);
      if (secs <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(id);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(id);
  }, [startTime, durationMinutes, onExpire]);

  const urgency =
    remaining <= 300  // 5 minutes
      ? "urgent"
      : remaining <= 600  // 10 minutes
      ? "warning"
      : "safe";

  return (
    <div className={`${styles.timer} ${styles[urgency]}`}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.icon}>
        <circle cx="8" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 6v3l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 1h4M8 1v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className={`${styles.time} mono`}>{formatTime(remaining)}</span>
      {urgency === "urgent" && (
        <span className={styles.pulse} aria-hidden="true" />
      )}
    </div>
  );
}
