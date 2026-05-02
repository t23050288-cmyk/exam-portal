"use client";

import styles from "./QuestionCard.module.css";
import { ReactNode } from "react";

interface QuestionCardProps {
  question: { id: string; text: string; options: string[]; marks?: number; image_url?: string | null };
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: string | undefined;
  onSelect: (questionId: string, option: string) => void;
  isSubmitted: boolean;
  children?: ReactNode;
}

const OPTION_KEYS = ["A", "B", "C", "D"];

export default function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  selectedAnswer,
  onSelect,
  isSubmitted,
  children,
}: QuestionCardProps) {
  return (
    <div className={styles.card} id={`question-${questionNumber}`}>
      {/* Question header */}
      <div className={styles.header}>
        <span className={styles.numberText}>Question {questionNumber} of {totalQuestions}</span>
        {/* We can put the marks over to the right or omit it if not needed, but let's keep it aligned right */}
        {question.marks !== undefined && question.marks > 0 && (
          <span className={styles.marks}>{question.marks} mark{question.marks !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Question text */}
      <p className={styles.text}>{question.text}</p>

      {/* Media asset (optional) */}
      {question.image_url && (
        <div className={styles.imageContainer}>
          <img src={question.image_url} alt="Question Diagram" className={styles.image} />
        </div>
      )}

      {/* Options */}
      <div className={styles.options}>
        {question.options.map((option, idx) => {
          const key = OPTION_KEYS[idx];
          const isSelected = selectedAnswer === key;

          return (
            <button
              key={key}
              id={`q${questionNumber}-option-${key}`}
              type="button"
              disabled={isSubmitted}
              onClick={() => !isSubmitted && onSelect(question.id, key)}
              className={`${styles.option} ${isSelected ? styles.selected : ""}`}
              aria-pressed={isSelected}
            >
              {/* Custom SVG radio */}
              <div className={styles.radioWrapper}>
                {isSelected ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={styles.radioSelected}>
                    <circle cx="12" cy="12" r="10" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                    <path d="M8 12.5L10.5 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={styles.radioUnselected}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
              </div>
              <span className={styles.optionText}>
                {key}. {option.replace(/^[A-D]\)\s*/, "")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Action Buttons Container (Next/Previous/Flag) */}
      {children && (
        <div className={styles.actionsContainer}>
          {children}
        </div>
      )}
    </div>
  );
}
