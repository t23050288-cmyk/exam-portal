"use client";

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           ANTI-CHEAT ENGINE — SecureExam Pro v6.1            ║
 * ║  Fullscreen Force | Escape Trap | Grace Window | Dedup       ║
 * ╠══════════════════════════════════════════════════════════════╣
 * FIXES (v6.1):
 *   - 800ms grace window after fullscreen re-entry prevents false positives
 *     from permission dialogs / OS-level fullscreen animations
 *   - Simultaneous blur + visibilitychange consolidated into ONE violation
 *   - All listeners torn down immediately on isSubmitted=true
 *   - Escape key no longer blocks "RE-ENTER" button (handled via data-attr)
 */

import { useEffect, useRef, useState, useCallback, ReactNode } from "react";

export interface AntiCheatProps {
  sessionId: string;
  authToken: string;
  studentId: string;
  studentName: string;
  isSubmitted: boolean;
  onAutoSubmit: () => void;
  onViolation?: (type: string, meta?: any) => void;
  children: ReactNode;
  initialWarningCount?: number;
}

const MAX_STRIKES  = 3;
const COOLDOWN_MS  = 800;   // grace window — prevents double-fire on FS dialog close
const REPORT_DELAY = 0;     // report to server immediately (non-blocking)

export default function AntiCheat({
  sessionId,
  authToken,
  studentId,
  studentName,
  isSubmitted,
  onAutoSubmit,
  onViolation,
  children,
  initialWarningCount = 0,
}: AntiCheatProps) {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [strikeCount,    setStrikeCount]    = useState(initialWarningCount);
  const [terminated,     setTerminated]     = useState(false);
  const [lastReason,     setLastReason]     = useState("");

  const strikesRef       = useRef(initialWarningCount);
  const terminatedRef    = useRef(false);
  const cooldownRef      = useRef(false);          // true = in grace window
  const fsReentryRef     = useRef(false);          // true = programmatic FS request in flight
  const overlayVisibleRef = useRef(false);

  useEffect(() => { overlayVisibleRef.current = overlayVisible; }, [overlayVisible]);

  // ── 1. TERMINATION ─────────────────────────────────────────────────────────
  const terminate = useCallback(() => {
    if (terminatedRef.current) return;
    terminatedRef.current = true;
    setTerminated(true);
    setOverlayVisible(true);

    fetch("/api/exam/report-violation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        type: "terminal_violation",
        metadata: { warning_count: MAX_STRIKES, is_auto_submit: true },
      }),
    }).catch(() => {});

    setTimeout(() => onAutoSubmit(), 2000);
  }, [authToken, onAutoSubmit]);

  // ── 2. VIOLATION RECORDER ──────────────────────────────────────────────────
  const recordViolation = useCallback((type: string) => {
    if (isSubmitted || terminatedRef.current || cooldownRef.current) return;

    // Enter grace window — next event within COOLDOWN_MS is ignored
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, COOLDOWN_MS);

    strikesRef.current += 1;
    const currentStrikes = strikesRef.current;

    setStrikeCount(currentStrikes);
    setLastReason(type.replace(/_/g, " "));
    setOverlayVisible(true);
    overlayVisibleRef.current = true;

    onViolation?.(type, { strike: currentStrikes });

    // Non-blocking server report
    fetch("/api/exam/report-violation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        type,
        metadata: {
          studentId,
          studentName,
          warning_count: currentStrikes,
          is_auto_submit: currentStrikes >= MAX_STRIKES,
          url: typeof window !== "undefined" ? window.location.href : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        },
      }),
    }).catch(() => {});

    if (currentStrikes >= MAX_STRIKES) terminate();
  }, [authToken, sessionId, studentId, studentName, terminate, onViolation, isSubmitted]);

  // ── 3. FULLSCREEN RE-ENTRY ─────────────────────────────────────────────────
  const handleUnderstand = useCallback(() => {
    if (terminatedRef.current) return;

    // Mark re-entry so FS change listener ignores the upcoming fullscreenchange
    fsReentryRef.current = true;
    cooldownRef.current  = true;    // also start grace window for blur/visibility

    const el    = document.documentElement as any;
    const reqFs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;

    if (reqFs) {
      reqFs.call(el)
        .then(() => {
          setOverlayVisible(false);
          overlayVisibleRef.current = false;
          // Release both flags after 800ms (FS animation + dialog close)
          setTimeout(() => {
            fsReentryRef.current = false;
            cooldownRef.current  = false;
          }, COOLDOWN_MS);
        })
        .catch(() => {
          fsReentryRef.current = false;
          cooldownRef.current  = false;
        });
    } else {
      // Browser doesn't support FS — just dismiss overlay
      setOverlayVisible(false);
      overlayVisibleRef.current = false;
      fsReentryRef.current = false;
      cooldownRef.current  = false;
    }
  }, []);

  // ── 4. SECURITY LISTENERS ──────────────────────────────────────────────────
  useEffect(() => {
    if (isSubmitted) return;   // Tear down everything once exam is over

    const onFsChange = () => {
      if (!document.fullscreenElement && !terminatedRef.current && !fsReentryRef.current) {
        recordViolation("Exited Fullscreen");
      }
    };

    const onVisibility = () => {
      if (document.hidden && !fsReentryRef.current) {
        recordViolation("Tab Switch / Minimized");
      }
    };

    // Window blur fires simultaneously with visibilitychange on tab switch.
    // The 800ms cooldown in recordViolation ensures only ONE violation is counted.
    const onBlur = () => {
      if (!fsReentryRef.current) recordViolation("Window Focus Lost");
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (overlayVisibleRef.current) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleUnderstand();
        } else {
          e.preventDefault();
        }
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;
      const key  = e.key.toLowerCase();
      if (
        key === "f12" ||
        key === "printscreen" ||
        (ctrl && ["c", "v", "u", "p", "s", "i", "j"].includes(key))
      ) {
        e.preventDefault();
        recordViolation("Prohibited Shortcut: " + e.key);
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    document.addEventListener("fullscreenchange",    onFsChange);
    document.addEventListener("visibilitychange",    onVisibility);
    window.addEventListener("blur",                  onBlur);
    window.addEventListener("keydown",               onKeydown, true);
    document.addEventListener("contextmenu",         onContextMenu);

    // DevTools trap
    const trap = setInterval(() => {
      if (terminatedRef.current || isSubmitted) return;
      const t0 = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - t0 > 100) recordViolation("DevTools Detected");
    }, 2000);

    return () => {
      document.removeEventListener("fullscreenchange",  onFsChange);
      document.removeEventListener("visibilitychange",  onVisibility);
      window.removeEventListener("blur",                onBlur);
      window.removeEventListener("keydown",             onKeydown, true);
      document.removeEventListener("contextmenu",       onContextMenu);
      clearInterval(trap);
    };
  }, [isSubmitted, recordViolation, handleUnderstand]);

  return (
    <>
      {/* ── DYNAMIC WATERMARK ── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 10, pointerEvents: "none",
        opacity: 0.04, display: "flex", flexWrap: "wrap", overflow: "hidden",
        transform: "rotate(-15deg) scale(1.5)", userSelect: "none",
      }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} style={{ padding: "60px", fontSize: "16px", fontWeight: "bold", color: "#fff" }}>
            {studentId} - {studentName}
          </div>
        ))}
      </div>

      {/* EXAM CONTENT — blurred when overlay is up */}
      <div style={{ filter: overlayVisible ? "blur(35px) brightness(0.4)" : "none", transition: "filter 0.4s ease" }}>
        {children}
      </div>

      {/* SECURITY OVERLAY */}
      {overlayVisible && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          backgroundColor: "rgba(2, 6, 23, 0.98)", backdropFilter: "blur(20px)",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", color: "white", textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}>
          <div style={{ fontSize: "64px", marginBottom: "10px" }}>{terminated ? "🔴" : "⚠️"}</div>
          <h1 style={{ color: terminated ? "#ef4444" : "#f59e0b", fontWeight: 900, letterSpacing: "-0.02em" }}>
            {terminated ? "EXAM TERMINATED" : "SECURITY VIOLATION"}
          </h1>
          <p style={{ color: "#94a3b8", marginBottom: "20px" }}>
            Reason: <span style={{ color: "#fff" }}>{lastReason}</span>
          </p>
          <div style={{ fontSize: "24px", fontWeight: 800, marginBottom: "30px" }}>
            Strike {strikeCount} / {MAX_STRIKES}
          </div>

          {!terminated && (
            <button
              onClick={handleUnderstand}
              style={{
                padding: "16px 40px", background: "#2563eb", color: "#fff",
                border: "none", borderRadius: "12px", fontWeight: 900,
                cursor: "pointer", boxShadow: "0 10px 25px rgba(37,99,235,0.4)",
              }}
            >
              RE-ENTER SECURE MODE
            </button>
          )}

          <p style={{ marginTop: "30px", fontSize: "12px", color: "#475569" }}>
            Session ID: {sessionId}
          </p>
        </div>
      )}
    </>
  );
}
