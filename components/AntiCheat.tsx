"use client";

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           ANTI-CHEAT ENGINE — SecureExam Pro v6.0 Lite       ║
 * ║     Fullscreen Force | Escape Trap | DevTools Freeze         ║
 * ╠══════════════════════════════════════════════════════════════╣
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

const MAX_STRIKES = 3;
const COOLDOWN_MS = 4000;

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
  const [strikeCount, setStrikeCount] = useState(initialWarningCount);
  const [terminated, setTerminated] = useState(false);
  const [lastReason, setLastReason] = useState("");

  const strikesRef = useRef(initialWarningCount);
  const terminatedRef = useRef(false);
  const cooldownRef = useRef(false);
  const fsReentryRef = useRef(false);
  const overlayVisibleRef = useRef(false);

  // Sync state to ref for listeners
  useEffect(() => { overlayVisibleRef.current = overlayVisible; }, [overlayVisible]);

  // 1. TERMINATION LOGIC
  const terminate = useCallback(() => {
    if (terminatedRef.current) return;
    terminatedRef.current = true;
    setTerminated(true);
    setOverlayVisible(true);

    fetch("/api/exam/report-violation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ type: "terminal_violation", metadata: { warning_count: MAX_STRIKES, is_auto_submit: true } }),
    }).catch(() => {});

    setTimeout(() => onAutoSubmit(), 2000);
  }, [authToken, onAutoSubmit]);

  // 2. VIOLATION TRACKER
  const recordViolation = useCallback((type: string) => {
    if (isSubmitted || terminatedRef.current || cooldownRef.current) return;

    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, COOLDOWN_MS);

    strikesRef.current += 1;
    const currentStrikes = strikesRef.current;
    setStrikeCount(currentStrikes);
    setLastReason(type.replace(/_/g, " "));
    setOverlayVisible(true);

    // Sync with parent state if needed
    onViolation?.(type, { strike: currentStrikes });

    fetch("/api/exam/report-violation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ sessionId, type, metadata: { warning_count: currentStrikes, is_auto_submit: currentStrikes >= MAX_STRIKES } }),
    });

    if (currentStrikes >= MAX_STRIKES) terminate();
  }, [authToken, sessionId, terminate, onViolation]);

  // 3. FULLSCREEN FORCE
  const handleUnderstand = useCallback(() => {
    if (terminatedRef.current) return;
    fsReentryRef.current = true;
    const el = document.documentElement as any;
    const reqFs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    
    if (reqFs) {
        reqFs.call(el).then(() => {
            setOverlayVisible(false);
            setTimeout(() => { fsReentryRef.current = false; }, 1500);
        }).catch(() => { 
            fsReentryRef.current = false; 
        });
    }
  }, []);

  // 4. SECURITY LISTENERS
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && !terminatedRef.current && !fsReentryRef.current) {
        recordViolation("Exited Fullscreen (Escape/Button)");
      }
    };

    const onVisibility = () => { if (document.hidden) recordViolation("Tab Switch / Minimized"); };
    const onBlur = () => { if (document.fullscreenElement && !fsReentryRef.current) recordViolation("Window Focus Lost"); };
    
    const onKeydown = (e: KeyboardEvent) => {
      // If overlay is up, block everything except Enter to dismiss
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
      const key = e.key.toLowerCase();
      // Block common cheating shortcuts
      if (key === "f12" || key === "printscreen" || (ctrl && ["c", "v", "u", "p", "s", "i", "j"].includes(key))) {
        e.preventDefault();
        recordViolation("Prohibited Shortcut: " + e.key);
      }
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeydown, true);
    document.addEventListener("contextmenu", (e) => e.preventDefault());

    // DevTools Debugger Bomb (Nuclear Option)
    const trap = setInterval(() => {
      if (terminatedRef.current) return;
      const t0 = performance.now();
      debugger;
      if (performance.now() - t0 > 100) recordViolation("DevTools Detected");
    }, 2000);

    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeydown, true);
      clearInterval(trap);
    };
  }, [recordViolation]);

  return (
    <>
      {/* ── DYNAMIC WATERMARK (Prevents phone photography) ── */}
      <div style={{ 
        position: "fixed", inset: 0, zIndex: 10, pointerEvents: "none", 
        opacity: 0.04, display: "flex", flexWrap: "wrap", overflow: "hidden", 
        transform: "rotate(-15deg) scale(1.5)", userSelect: "none" 
      }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} style={{ padding: "60px", fontSize: "16px", fontWeight: "bold", color: "#fff" }}>
            {studentId} - {studentName}
          </div>
        ))}
      </div>

      {/* EXAM CONTENT (BLURRED ON VIOLATION) */}
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
            fontFamily: "system-ui, sans-serif"
        }}>
          <div style={{ fontSize: "64px", marginBottom: "10px" }}>{terminated ? "🔴" : "⚠️"}</div>
          <h1 style={{ color: terminated ? "#ef4444" : "#f59e0b", fontWeight: 900, letterSpacing: "-0.02em" }}>
            {terminated ? "EXAM TERMINATED" : "SECURITY VIOLATION"}
          </h1>
          <p style={{ color: "#94a3b8", marginBottom: "20px" }}>Reason: <span style={{ color: "#fff" }}>{lastReason}</span></p>
          <div style={{ fontSize: "24px", fontWeight: 800, marginBottom: "30px" }}>Strike {strikeCount} / {MAX_STRIKES}</div>
          
          {!terminated && (
            <button 
                onClick={handleUnderstand} 
                style={{ 
                    padding: "16px 40px", background: "#2563eb", color: "#fff", 
                    border: "none", borderRadius: "12px", fontWeight: 900, 
                    cursor: "pointer", boxShadow: "0 10px 25px rgba(37,99,235,0.4)" 
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
