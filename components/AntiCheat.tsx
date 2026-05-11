"use client";
/**
 * AntiCheat v3 — Bulletproof exam proctoring
 * Catches: Escape key, tab switch, window blur, fullscreen exit, 
 *          PrintScreen, DevTools shortcuts, context menu, clipboard
 */
import { useEffect, useRef, useState, useCallback } from "react";

interface AntiCheatProps {
  sessionId: string;
  authToken: string;
  isSubmitted: boolean;
  onAutoSubmit: () => void;
  onViolation?: (type: string, metadata?: Record<string, unknown>) => void;
  forceReenterFullscreen?: () => void;
  initialWarningCount?: number;
  isMobile?: boolean;
}

const MAX_WARNINGS = 3;
const COOLDOWN_MS = 4000; // min ms between two separate violations

export default function AntiCheat({
  sessionId,
  authToken,
  isSubmitted,
  onAutoSubmit,
  onViolation,
  forceReenterFullscreen,
  initialWarningCount = 0,
  isMobile = false,
}: AntiCheatProps) {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState("");
  const [warningCount, setWarningCount] = useState(initialWarningCount);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const warningRef = useRef(initialWarningCount);
  const lastViolationRef = useRef<number>(0);
  const cooldownRef = useRef(false);
  // True during the ~2s window after a tab switch event fires
  const tabSwitchWindowRef = useRef(false);
  // True while we are programmatically re-entering fullscreen
  const fsReentryRef = useRef(false);
  // True for 2s after page mounts (fullscreen dialog itself blurs window)
  const stabilizedRef = useRef(false);
  const mountTimeRef = useRef(Date.now());

  // ── Load server-side warning count on mount ──
  useEffect(() => {
    if (!authToken || authToken === "" || sessionId === "init") return;
    fetch("/api/exam/status", {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        const wc = j.warnings || j.warning_count || 0;
        warningRef.current = wc;
        setWarningCount(wc);
        if (j.auto_submitted || j.status === "submitted") {
          setAutoSubmitted(true);
          onAutoSubmit();
        }
      })
      .catch(() => {});
  }, [authToken, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Grace period: 2s so fullscreen dialog/blur on mount doesn't fire ──
  useEffect(() => {
    const t = setTimeout(() => {
      stabilizedRef.current = true;
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  // ── Core violation reporter ──
  const triggerViolation = useCallback(
    (type: string) => {
      if (isSubmitted || autoSubmitted) return;
      if (!stabilizedRef.current) return; // still in grace period
      if (cooldownRef.current) return;    // cooldown active

      const now = Date.now();
      if (now - lastViolationRef.current < COOLDOWN_MS) return;

      // Lock cooldown
      cooldownRef.current = true;
      lastViolationRef.current = now;
      setTimeout(() => { cooldownRef.current = false; }, COOLDOWN_MS);

      const newCount = warningRef.current + 1;
      warningRef.current = newCount;
      setWarningCount(newCount);

      if (onViolation) onViolation(type, { warning_count: newCount });

      const isAutoSubmit = newCount >= MAX_WARNINGS;
      const label = type.replace(/_/g, " ");

      let msg: string;
      if (isAutoSubmit) {
        msg = `🔴 VIOLATION 3/3 (${label}): Exam auto-submitted for security review.`;
      } else if (newCount === 2) {
        msg = `🚨 Warning 2 of 3 (${label}): ONE more violation = auto-submit!`;
      } else {
        msg = `⚠️ Warning 1 of 3 (${label}): Stay in fullscreen and don't switch tabs.`;
      }

      setOverlayMessage(msg);
      setOverlayVisible(true);

      // Report to server
      fetch("/api/exam/report-violation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ type, metadata: { warning_count: newCount, is_auto_submit: isAutoSubmit } }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j) return;
          // Use server count as authoritative
          const serverCount = j.warning_count || newCount;
          warningRef.current = serverCount;
          setWarningCount(serverCount);
          if (j.auto_submitted || serverCount >= MAX_WARNINGS) {
            setAutoSubmitted(true);
            setOverlayMessage(`🔴 Exam auto-submitted: ${serverCount} violations recorded.`);
            setTimeout(() => onAutoSubmit(), 2500);
          }
        })
        .catch(() => {});

      if (isAutoSubmit) {
        setAutoSubmitted(true);
        setTimeout(() => onAutoSubmit(), 2500);
      }
    },
    [isSubmitted, autoSubmitted, authToken, onAutoSubmit, onViolation]
  );

  // ── Dismiss: user clicks "I Understood" → re-enter fullscreen synchronously ──
  const handleUnderstand = useCallback(() => {
    if (autoSubmitted) return; // locked — don't dismiss
    setOverlayVisible(false);
    fsReentryRef.current = true;
    // MUST be synchronous inside click handler (user gesture)
    if (forceReenterFullscreen) {
      forceReenterFullscreen();
    } else if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        setOverlayMessage("⚠️ Press F11 to re-enter fullscreen manually.");
        setOverlayVisible(true);
      });
    }
    setTimeout(() => { fsReentryRef.current = false; }, 1500);
  }, [autoSubmitted, forceReenterFullscreen]);

  // ── All event listeners ──
  useEffect(() => {
    if (isMobile) return;

    // ── 1. visibilitychange — catches ANY tab switch / minimize / Alt+Tab ──
    const handleVisibility = () => {
      if (document.hidden) {
        tabSwitchWindowRef.current = true;
        triggerViolation("tab_switch");
        setTimeout(() => { tabSwitchWindowRef.current = false; }, 3000);
      }
    };

    // ── 2. blur — catches window focus loss WHILE in fullscreen ──
    //    (screenshot tools, Alt+Tab on some systems, Windows key)
    const handleBlur = () => {
      if (
        !tabSwitchWindowRef.current &&
        !fsReentryRef.current &&
        document.visibilityState === "visible" &&
        !!document.fullscreenElement
      ) {
        triggerViolation("window_blur");
      }
    };

    // ── 3. fullscreenchange — catches Escape key and any other exit ──
    //    This is the PRIMARY Escape detection path.
    //    We do NOT catch Escape in keydown because preventDefault is ignored for Escape+fullscreen.
    //    fullscreenchange is the ONLY reliable way to detect Escape-to-exit.
    const handleFsChange = () => {
      const inFs = !!document.fullscreenElement;
      if (!inFs && !isSubmitted && !autoSubmitted) {
        // If this was caused by a tab switch, that already reported a violation — skip
        if (tabSwitchWindowRef.current) return;
        // If WE triggered the exit for re-entry, skip
        if (fsReentryRef.current) return;
        triggerViolation("fullscreen_exit");
      }
    };

    // ── 4. keydown — catches PrintScreen, F11, Ctrl+T/W/R/P, DevTools ──
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key;

      // PrintScreen / screenshot
      if (key === "PrintScreen" || key === "Printscr") {
        e.preventDefault();
        triggerViolation("screenshot_attempt");
        return;
      }

      // Escape: browser ignores preventDefault for Escape during fullscreen.
      // fullscreenchange handles this. But we log it early for redundancy.
      if (key === "Escape") {
        // Don't call triggerViolation here — fullscreenchange will fire and handle it.
        // If we call both, it double-counts. Just return.
        return;
      }

      // F11 (toggle fullscreen) — treat as exit attempt
      if (key === "F11") {
        e.preventDefault();
        triggerViolation("fullscreen_exit");
        return;
      }

      // F12 (DevTools)
      if (key === "F12") {
        e.preventDefault();
        triggerViolation("devtools_open");
        return;
      }

      // Ctrl+Shift+I/J (DevTools)
      if (ctrl && shift && ["i", "j", "c"].includes(key.toLowerCase())) {
        e.preventDefault();
        triggerViolation("devtools_open");
        return;
      }

      // Ctrl+T (new tab), Ctrl+W (close), Ctrl+R (reload), Ctrl+P (print), Ctrl+U (source)
      if (ctrl && ["t", "w", "r", "p", "l", "u"].includes(key.toLowerCase())) {
        e.preventDefault();
        triggerViolation("keyboard_shortcut");
        return;
      }

      // Alt+Tab / Windows key: can't fully block, but log blur/visibility
      // These are handled by blur/visibilitychange above
    };

    // ── 4b. resize — catches DevTools opening (which changes window dimensions) ──
    const handleResize = () => {
      if (isSubmitted || autoSubmitted || !stabilizedRef.current) return;
      
      const threshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      
      if (widthDiff > threshold || heightDiff > threshold) {
        triggerViolation("devtools_detected");
      }
    };

    // ── 5. context menu ──
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
      triggerViolation("context_menu");
    };

    // ── 6. clipboard ──
    const handleClipboard = (e: Event) => {
      e.preventDefault();
      triggerViolation("clipboard_action");
    };

    // ── 7. beforeunload — warn on page close/refresh ──
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSubmitted && !autoSubmitted && stabilizedRef.current) {
        e.preventDefault();
        e.returnValue = "Your exam is in progress. Are you sure you want to leave?";
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    document.addEventListener("mozfullscreenchange", handleFsChange);
    document.addEventListener("MSFullscreenChange", handleFsChange);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", handleResize);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleClipboard);
    document.addEventListener("paste", handleClipboard);
    document.addEventListener("cut", handleClipboard);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
      document.removeEventListener("mozfullscreenchange", handleFsChange);
      document.removeEventListener("MSFullscreenChange", handleFsChange);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleClipboard);
      document.removeEventListener("paste", handleClipboard);
      document.removeEventListener("cut", handleClipboard);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [triggerViolation, isMobile, isSubmitted, autoSubmitted]);

  // ── Render: blocking overlay ──
  if (!overlayVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647, // maximum z-index
        backgroundColor: autoSubmitted ? "rgba(10,0,0,0.97)" : "rgba(0,5,20,0.93)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        padding: "40px 24px",
        pointerEvents: "all",
        userSelect: "none",
      }}
      // Prevent any click from passing through
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Icon */}
      <div style={{ fontSize: 64, marginBottom: 16 }}>
        {autoSubmitted ? "🔴" : "⚠️"}
      </div>

      {/* Warning count badge */}
      <div style={{
        background: autoSubmitted ? "#ef4444" : "#f59e0b",
        color: "#000",
        fontWeight: 900,
        fontSize: 13,
        padding: "4px 14px",
        borderRadius: 20,
        marginBottom: 20,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}>
        {autoSubmitted ? "EXAM TERMINATED" : `WARNING ${warningCount} / ${MAX_WARNINGS}`}
      </div>

      {/* Message */}
      <div style={{
        fontSize: 18,
        fontWeight: 700,
        textAlign: "center",
        maxWidth: 480,
        lineHeight: 1.6,
        marginBottom: 32,
        color: autoSubmitted ? "#fca5a5" : "#f8fafc",
        whiteSpace: "pre-line",
      }}>
        {overlayMessage}
      </div>

      {/* Button */}
      {!autoSubmitted && (
        <button
          onClick={handleUnderstand}
          style={{
            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
            color: "#fff",
            border: "none",
            padding: "16px 40px",
            borderRadius: 12,
            fontWeight: 900,
            fontSize: 16,
            cursor: "pointer",
            boxShadow: "0 8px 30px rgba(59,130,246,0.4)",
            letterSpacing: "0.05em",
          }}
        >
          I UNDERSTOOD — RETURN TO EXAM
        </button>
      )}

      {/* Fine print */}
      <p style={{ marginTop: 24, fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {autoSubmitted
          ? "Your responses have been saved. Please contact your invigilator."
          : `This system monitors fullscreen, tab switches, and key combinations.`}
      </p>
    </div>
  );
}
