"use client";
import styles from "./ExamCard.module.css";
import { motion } from "framer-motion";

interface ExamCardProps {
  exam: {
    id: string;
    exam_name: string;
    duration_minutes: number;
    scheduled_start: string | null;
    submitted?: boolean;
    score?: number;
    total_marks?: number;
    attempt_count?: number;
    max_attempts?: number;
  };
  isUpcoming?: boolean;
  timeUntil?: string | null;
  onLaunch: () => void;
}

export default function ExamCard({ exam, isUpcoming, timeUntil, onLaunch }: ExamCardProps) {
  const schedDate = exam.scheduled_start ? new Date(exam.scheduled_start) : new Date();
  
  return (
    <motion.div 
      className={styles.card}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -5 }}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>{exam.exam_name}</h3>
        {exam.submitted ? (
          <span className={styles.badgeSubmitted}>SUBMITTED</span>
        ) : isUpcoming ? (
          <span className={styles.badgeScheduled}>SCHEDULED</span>
        ) : (
          <span className={styles.badgeLive}>LIVE</span>
        )}
      </div>

      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={styles.icon}>📅</span>
          <span>{schedDate.toLocaleDateString()}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.icon}>🕐</span>
          <span>{schedDate.toTimeString().slice(0, 5)} • {exam.duration_minutes} min</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.icon}>🎯</span>
          <span>Attempts: {exam.attempt_count || 0} / {exam.max_attempts || 1}</span>
        </div>
      </div>

      <div className={styles.progress}>
        <div className={styles.progressBar} />
      </div>

      <div className={styles.footer}>
        {exam.submitted ? (
          <div className={styles.scoreInfo}>
            <span className={styles.scoreLabel}>Score:</span>
            <span className={styles.scoreValue}>{exam.score} / {exam.total_marks}</span>
          </div>
        ) : isUpcoming ? (
          <div className={styles.countdown}>
            Starts in {timeUntil}
          </div>
        ) : (
          <div className={styles.actions}>
            <button className={styles.startBtn} onClick={onLaunch}>
              START EXAM
            </button>
            <span className={styles.startsIn}>Starts in {timeUntil || "Ready"}</span>
          </div>
        )}
      </div>

      <div className={styles.networkGraphic}>
        {/* Placeholder for the constellation graphic */}
        <svg viewBox="0 0 100 60" className={styles.svg}>
          <circle cx="20" cy="20" r="1" fill="var(--nexus-cyan)" />
          <circle cx="50" cy="10" r="1" fill="var(--nexus-cyan)" />
          <circle cx="80" cy="30" r="1" fill="var(--nexus-cyan)" />
          <circle cx="40" cy="50" r="1" fill="var(--nexus-cyan)" />
          <line x1="20" y1="20" x2="50" y2="10" stroke="var(--nexus-cyan)" strokeWidth="0.2" opacity="0.5" />
          <line x1="50" y1="10" x2="80" y2="30" stroke="var(--nexus-cyan)" strokeWidth="0.2" opacity="0.5" />
          <line x1="80" y1="30" x2="40" y2="50" stroke="var(--nexus-cyan)" strokeWidth="0.2" opacity="0.5" />
          <line x1="40" y1="50" x2="20" y2="20" stroke="var(--nexus-cyan)" strokeWidth="0.2" opacity="0.5" />
        </svg>
      </div>
    </motion.div>
  );
}
