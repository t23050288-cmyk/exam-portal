"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./ingest.module.css";
import { BRANCH_IDS } from "@/lib/constants";

const API = process.env.NEXT_PUBLIC_API_URL || "/api";
const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "admin@examguard2024";

interface ParsedQuestion {
  text: string;
  options: string[];
  correct_answer: string;
  marks: number;
  branch: string;
  order_index: number;
  exam_name: string;
  image_url?: string;
}

interface ParseResult {
  questions: ParsedQuestion[];
  total: number;
  source_file: string;
  parse_warnings: string[];
}

type Phase = "idle" | "uploading" | "previewing" | "committing" | "done";

const FILE_ICONS: Record<string, string> = {
  pdf: "📄",
  docx: "📝",
  xlsx: "📊",
  xls: "📊",
  txt: "📃",
};

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || "📎";
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function IngestPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [evaporating, setEvaporating] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [committed, setCommitted] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("CS");
  const [examName, setExamName] = useState("");
  const [showGatekeeperAlert, setShowGatekeeperAlert] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setPhase("uploading");
    setResult(null);

    // Trigger evaporation animation after brief delay
    setTimeout(() => setEvaporating(true), 800);

    const formData = new FormData();
    formData.append("file", f);

    try {
      const res = await fetch(`${API}/admin/ingest/upload`, {
        method: "POST",
        headers: { "x-admin-secret": ADMIN_SECRET },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
      const data: ParseResult = await res.json();
      // Wait for evaporation to finish
      setTimeout(() => {
        setResult(data);
        setPhase("previewing");
        setEvaporating(false);
      }, 600);
    } catch (e: any) {
      setError(e.message);
      setPhase("idle");
      setEvaporating(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) uploadFile(f);
    },
    [uploadFile]
  );

  const handleCommit = async () => {
    if (!result || !examName) return;
    setPhase("committing");
    setError(null);

    // Tether each question to the Exam Identity
    const questionsWithTether = result.questions.map((q, i) => ({
      ...q,
      branch: selectedBranch,
      exam_name: examName,
      order_index: i,
    }));

    try {
      const res = await fetch(`${API}/admin/ingest/commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET,
        },
        body: JSON.stringify({
          questions: questionsWithTether,
          replace_existing: replaceExisting,
        }),
      });
      if (!res.ok) throw new Error("Commit failed");
      const data = await res.json();
      setCommitted(data.committed);
      setPhase("done");
    } catch (e: any) {
      setError(e.message);
      setPhase("previewing");
    }
  };

  const reset = () => {
    setPhase("idle");
    setFile(null);
    setResult(null);
    setError(null);
    setEvaporating(false);
    setCommitted(0);
  };

  return (
    <div className={styles.page}>
      {/* ── Drop Zone (visible during idle and uploading) ── */}
      {(phase === "idle" || phase === "uploading") && (
        <>
          {/* ── Nomenclature Orb (The Gatekeeper) ── */}
          <div className={styles.orbContainer}>
            <label className={styles.orbLabel}>Exam Identity</label>
            <input
              type="text"
              placeholder="Enter Exam Name to Begin..."
              className={`${styles.orbInput} ${examName ? styles.orbActive : ""}`}
              value={examName}
              onChange={(e) => {
                setExamName(e.target.value);
                setShowGatekeeperAlert(false);
              }}
            />
          </div>

          <div
            className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""} ${!examName ? styles.dropZoneLatent : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (examName) setDragging(true);
              else setShowGatekeeperAlert(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              if (examName) handleDrop(e);
              else {
                e.preventDefault();
                setShowGatekeeperAlert(true);
              }
            }}
            onClick={() => {
              if (examName) inputRef.current?.click();
              else setShowGatekeeperAlert(true);
            }}
          >
            <AnimatePresence>
              {showGatekeeperAlert && !examName && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={styles.gatekeeperTooltip}
                >
                  ⚠️ Anchor an Identity first
                </motion.div>
              )}
            </AnimatePresence>

            <div className={styles.dropIcon}>
              {phase === "uploading" ? "⚗️" : "🌌"}
            </div>
            <div className={styles.dropTitle}>
              {phase === "uploading" ? "Spectral Extraction in progress…" : "Drop your question bank here"}
            </div>
            <div className={styles.dropSubtitle}>
              {phase === "uploading"
                ? "Crystallizing content from your file…"
                : "Drag & drop or click to upload. Questions will drift in automatically."}
            </div>
            <div className={styles.dropBadges}>
              <span className={`${styles.typeBadge} ${styles.typePdf}`}>PDF</span>
              <span className={`${styles.typeBadge} ${styles.typeDocx}`}>DOCX</span>
              <span className={`${styles.typeBadge} ${styles.typeXlsx}`}>XLSX</span>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.xls,.txt"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
            />
          </div>

          {/* File card with evaporation */}
          {file && (
            <div className={`${styles.fileCard} ${evaporating ? styles.evaporating : ""}`}>
              <span className={styles.fileIcon}>{fileIcon(file.name)}</span>
              <span className={styles.fileName}>{file.name}</span>
              <span className={styles.fileSize}>{formatBytes(file.size)}</span>
              {phase === "uploading" && (
                <div style={{ width: "100%", position: "absolute", bottom: 0, left: 0 }}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: "80%" }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className={styles.warningBox} style={{ borderColor: "rgba(239,68,68,0.3)", color: "#f87171", background: "rgba(239,68,68,0.08)" }}>
              ⚠️ {error}
            </div>
          )}
        </>
      )}

      {/* ── Preview Phase ── */}
      {phase === "previewing" && result && (
        <>
          {result.parse_warnings.length > 0 && (
            <div className={styles.warningBox}>
              <strong>⚠ Parse Warnings ({result.parse_warnings.length})</strong>
              <ul className={styles.warningList}>
                {result.parse_warnings.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
            </div>
          )}

          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              ✦ Crystallized Questions
              <span className={styles.sectionCount}>{result.total}</span>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <select
                className={styles.input}
                style={{ width: 120, height: 36, padding: "0 10px", fontSize: 13 }}
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                {/* Dynamically use BRANCH_IDS from constants */}
                {BRANCH_IDS.map((b: string) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.previewGrid}>
            {result.questions.map((q, i) => (
              <div
                key={i}
                className={styles.qCard}
                style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
              >
                <div className={styles.qIndex}>
                  Q{i + 1}
                  <span className={`badge badge-neutral`}>{q.marks} mark{q.marks > 1 ? "s" : ""}</span>
                </div>
                <p className={styles.qText}>{q.text}</p>
                
                {q.image_url && (
                  <div className={styles.qImageContainer}>
                    <img 
                      src={q.image_url} 
                      alt={`Asset for Q${i+1}`} 
                      className={styles.qImage} 
                    />
                    <div className={styles.imageLabel}>Extracted PDF Asset</div>
                  </div>
                )}

                <ul className={styles.qOptions}>
                  {q.options.map((opt, j) => {
                    const label = String.fromCharCode(65 + j);
                    return (
                      <li key={j} className={`${styles.qOption} ${label === q.correct_answer ? styles.correct : ""}`}>
                        <span style={{ fontWeight: 700, minWidth: 18 }}>{label}.</span> {opt}
                        {label === q.correct_answer && " ✓"}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              Replace existing {selectedBranch} questions
            </label>
            <button className="btn btn-outline" onClick={reset}>
              Cancel
            </button>
            <button
              className={styles.btnCrystallize}
              onClick={handleCommit}
              disabled={result.questions.length === 0}
            >
              ✦ Crystallize &amp; Import {result.total} Questions
            </button>
          </div>
        </>
      )}

      {/* ── Committing loader ── */}
      {phase === "committing" && (
        <div className={styles.empty}>
          <div className="spinner" style={{ width: 40, height: 40, margin: "0 auto 16px" }} />
          <p>Crystallizing questions into the database…</p>
        </div>
      )}

      {/* ── Success ── */}
      {phase === "done" && (
        <div className={styles.successBanner}>
          <div className={styles.successIcon}>✦</div>
          <div className={styles.successTitle}>
            {committed} Questions Crystallized
          </div>
          <div className={styles.successSub}>
            Questions from <strong>{file?.name}</strong> have been imported and are now live.
          </div>
          <button
            className={styles.btnCrystallize}
            style={{ marginTop: 20 }}
            onClick={reset}
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}
