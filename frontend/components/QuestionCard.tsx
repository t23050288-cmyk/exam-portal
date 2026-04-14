"use client";

import styles from "./QuestionCard.module.css";

interface QuestionCardProps {
  question: { id: string; text: string; options: string[]; marks: number; image_url?: string | null };
  questionNumber: number;
  selectedAnswer: string | undefined;
  onSelect: (questionId: string, option: string) => void;
  isSubmitted: boolean;
}

const OPTION_KEYS = ["A", "B", "C", "D"];

export default function QuestionCard({
  question,
  questionNumber,
  selectedAnswer,
  onSelect,
  isSubmitted,
}: QuestionCardProps) {
  return (
    <div className={styles.card} id={`question-${questionNumber}`}>
      {/* Question header */}
      <div className={styles.header}>
        <span className={styles.number}>Q{questionNumber}</span>
        <span className={styles.marks}>{question.marks} mark{question.marks !== 1 ? "s" : ""}</span>
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
              <span className={styles.optionKey}>{key}</span>
              <span className={styles.optionText}>{option.replace(/^[A-D]\)\s*/, "")}</span>
              {isSelected && (
                <svg className={styles.check} width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" fill="var(--accent)" />
                  <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
