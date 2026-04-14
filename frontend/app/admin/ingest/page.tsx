"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./ingest.module.css";

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
  // AI Spectral metadata
  confidence?: number;
  needs_review?: boolean;
  review_reason?: string | null;
}

interface ParseResult {
  questions: ParsedQuestion[];
  total: number;
  source_file: string;
  parse_warnings: string[];
  ai_powered?: boolean;
  ai_confidence_avg?: number;
  needs_review_count?: number;
  finesse_check?: string | null;
}

type Phase = "idle" | "uploading" | "previewing" | "committing" | "done";

const BRANCHES = [
  { id: "DS",      name: "Data Science (DS)" },
  { id: "CS",      name: "Cyber Security (CS)" },
  { id: "AI",      name: "Artificial Intelligence (AI)" },
  { id: "CSE",     name: "Computer Science & Eng (CSE)" },
  { id: "ISC",     name: "Information Science (ISC)" },
  { id: "ECE",     name: "Electronics (ECE)" },
  { id: "BCA-1st", name: "BCA 1st Year" },
  { id: "BCA-2nd", name: "BCA 2nd Year" },
];

const FILE_ICONS: Record<string, string> = {
  pdf: "📄", docx: "📝", xlsx: "📊", xls: "📊", txt: "📃",
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

function ConfidenceOrb({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 90 ? "#10b981" :
    pct >= 70 ? "#f59e0b" :
    "#ef4444";
  return (
    <span
      className={styles.confidenceOrb}
      style={{ "--conf-color": color } as React.CSSProperties}
      title={`AI Confidence: ${pct}%`}
    >
      {pct}%
    </span>
  );
}

// Tethered Drift: Visualizing high-fidelity data routing into isolation nodes
function TetheredDriftAnimation({ count, examName }: { count: number; examName: string }) {
  const nodes = Array.from({ length: Math.min(count, 40) }, (_, i) => i);
  return (
    <div className={styles.driftContainer}>
      <div className={styles.sourceOrb}>📄</div>
      {nodes.map((i) => (
        <motion.div
          key={i}
          className={styles.driftNode}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
          animate={{
            x: [0, (Math.random() - 0.5) * 300, 400],
            y: [0, (Math.random() - 0.5) * 200, 0],
            opacity: [0, 1, 1, 0],
            scale: [0.5, 1, 1, 0.2],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut",
          }}
        >
          ✦
        </motion.div>
      ))}
      <div className={styles.destinationOrb}>
        <div className={styles.orbGlow} />
        <span className={styles.orbEmoji}>📁</span>
        <div className={styles.orbLabelInside}>{examName}</div>
      </div>
      <div className={styles.driftStatus}>
        Crystallizing {count} entities into <strong>{examName}</strong>...
      </div>
    </div>
  );
}

function MolecularizeAnimation() {
  const particles = Array.from({ length: 20 }, (_, i) => i);
  return (
    <div className={styles.molecularizeContainer} aria-hidden>
      {particles.map((i) => (
        <motion.div
           key={i}
           className={styles.particle}
           initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
           animate={{
             x: (Math.random() - 0.5) * 160,
             y: (Math.random() - 0.5) * 160,
             opacity: [1, 0.6, 0],
             scale: [1, 1.5, 0],
           }}
           transition={{
             duration: 1.2,
             repeat: Infinity,
             delay: i * 0.06,
             repeatType: "reverse",
             ease: "easeInOut",
           }}
         />
       ))}
     </div>
   );
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
        const msg = typeof err.detail === "string" 
          ? err.detail 
          : Array.isArray(err.detail) 
            ? err.detail.map((d: any) => d.msg).join(", ")
            : JSON.stringify(err.detail);
        throw new Error(msg || "Upload failed");
      }
      const data: ParseResult = await res.json();
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
    if (!result) return;
    if (!examName) {
      setError("Please enter an Exam Identity first.");
      return;
    }

    setPhase("committing");
    setError(null);

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
          exam_name: examName,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        const msg = typeof err.detail === "string" 
          ? err.detail 
          : Array.isArray(err.detail) 
            ? err.detail.map((d: any) => d.msg).join(", ")
            : JSON.stringify(err.detail);
        throw new Error(msg || "Crystallization failed");
      }
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

  const avgConf = result?.ai_confidence_avg ?? 1;
  const needsReview = result?.needs_review_count ?? 0;
  const aiPowered = result?.ai_powered ?? false;

  return (
    <div className={styles.page}>
      {/* ── Global Error Alert ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={styles.warningBox}
            style={{ borderColor: "rgba(239,68,68,0.4)", color: "#f87171", background: "rgba(239,68,68,0.08)", marginBottom: 24 }}
          >
            ⚠️ {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Drop Zone (idle + uploading) ── */}
      {(phase === "idle" || phase === "uploading") && (
        <>
          {/* Exam Identity Orb */}
          <div className={styles.orbContainer}>
            <label className={styles.orbLabel}>Exam Identity</label>
            <input
              type="text"
              placeholder="Enter Exam Name to Begin..."
              className={`${styles.orbInput} ${examName ? styles.orbActive : ""}`}
              value={examName}
              onChange={(e) => { setExamName(e.target.value); setShowGatekeeperAlert(false); }}
            />
          </div>

          <div
            className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""} ${!examName ? styles.dropZoneLatent : ""}`}
            onDragOver={(e) => { e.preventDefault(); if (examName) setDragging(true); else setShowGatekeeperAlert(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { if (examName) handleDrop(e); else { e.preventDefault(); setShowGatekeeperAlert(true); } }}
            onClick={() => { if (examName) inputRef.current?.click(); else setShowGatekeeperAlert(true); }}
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

            {/* Data-Molecularization animation replaces the icon during upload */}
            {phase === "uploading" ? (
              <div className={styles.molecularizeWrapper}>
                <MolecularizeAnimation />
                <div className={styles.molecularizeLabel}>
                  <span className={styles.aiPulse}>⬡</span>
                  Spectral AI Parsing…
                </div>
              </div>
            ) : (
              <>
                <div className={styles.dropIcon}>🌌</div>
                <div className={styles.dropTitle}>Drop your question bank here</div>
                <div className={styles.dropSubtitle}>
                  Powered by Inception AI — multi-column, complex layouts handled with zero data loss.
                </div>
              </>
            )}

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
        </>
      )}

      {/* ── Preview Phase ── */}
      {phase === "previewing" && result && (
        <>
          {/* AI Intelligence Banner */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${styles.aiBanner} ${
              !aiPowered ? styles.aiBannerLegacy :
              avgConf >= 0.9 ? styles.aiBannerSuccess :
              avgConf >= 0.7 ? styles.aiBannerWarning :
              styles.aiBannerDanger
            }`}
          >
            <span className={styles.aiBannerIcon}>
              {!aiPowered ? "🔧" : avgConf >= 0.9 ? "✦" : avgConf >= 0.7 ? "⚡" : "⚠️"}
            </span>
            <span className={styles.aiBannerText}>
              {!aiPowered
                ? "Legacy regex mode — add INCEPTION_API_KEY for AI-powered extraction"
                : `Spectral AI · Avg Confidence: ${Math.round(avgConf * 100)}% · ${needsReview} questions need review`}
            </span>
            {result.finesse_check && (
              <span className={styles.aiBannerFinesse}>{result.finesse_check}</span>
            )}
          </motion.div>

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
              {needsReview > 0 && (
                <span className={styles.reviewBadge}>
                  {needsReview} need review
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <select
                className={styles.input}
                style={{ width: 200, height: 38, padding: "0 10px", fontSize: 13 }}
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                {BRANCHES.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.previewGrid}>
            {result.questions.map((q, i) => {
              const conf = q.confidence ?? 1;
              const review = q.needs_review ?? false;
              return (
                <motion.div
                  key={i}
                  className={`${styles.qCard} ${review ? styles.qCardReview : ""}`}
                  style={{
                    animationDelay: `${Math.min(i * 40, 600)}ms`,
                    "--conf-glow": conf >= 0.9 ? "rgba(16,185,129,0.15)" :
                                   conf >= 0.7 ? "rgba(245,158,11,0.15)" :
                                   "rgba(239,68,68,0.15)",
                  } as React.CSSProperties}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className={styles.qIndex}>
                    Q{i + 1}
                    <span className="badge badge-neutral">{q.marks} mark{q.marks > 1 ? "s" : ""}</span>
                    <span className={styles.branchTag}>{selectedBranch}</span>
                    {aiPowered && <ConfidenceOrb confidence={conf} />}
                  </div>

                  {review && q.review_reason && (
                    <div className={styles.reviewAlert}>
                      🔍 {q.review_reason}
                    </div>
                  )}

                  <p className={styles.qText}>{q.text}</p>

                  {q.image_url && (
                    <div className={styles.qImageContainer}>
                      <img src={q.image_url} alt={`Asset for Q${i + 1}`} className={styles.qImage} />
                      <div className={styles.imageLabel}>Extracted PDF Asset</div>
                    </div>
                  )}

                  <ul className={styles.qOptions}>
                    {q.options.map((opt, j) => {
                      const label = String.fromCharCode(65 + j);
                      return (
                        <li
                          key={j}
                          className={`${styles.qOption} ${label === q.correct_answer ? styles.correct : ""}`}
                        >
                          <span style={{ fontWeight: 700, minWidth: 18 }}>{label}.</span> {opt}
                          {label === q.correct_answer && " ✓"}
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              );
            })}
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
            <button className="btn btn-outline" onClick={reset}>Cancel</button>
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
        <div className={styles.driftOverlay}>
          <TetheredDriftAnimation 
            count={result?.total || 0} 
            examName={examName || "Isolation Node"} 
          />
        </div>
      )}

      {/* ── Success ── */}
      {phase === "done" && (
        <motion.div
          className={styles.successBanner}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className={styles.successIcon}>✦</div>
          <div className={styles.successTitle}>{committed} Questions Crystallized</div>
          <div className={styles.successSub}>
            Questions from <strong>{file?.name}</strong> have been imported and are now live.
          </div>
          <button className={styles.btnCrystallize} style={{ marginTop: 20 }} onClick={reset}>
            Import Another File
          </button>
        </motion.div>
      )}
    </div>
  );
}
