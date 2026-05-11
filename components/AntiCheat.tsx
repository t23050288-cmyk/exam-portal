"use client";
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

const DEBOUNCE_MS = 3000;   // client-side debounce between violations
const STABILIZE_MS = 5000;  // grace period after mount before violations count
const MAX_WARNINGS = 3;     // auto-submit after this many warnings (server is authoritative)

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

  const stabilizedRef = useRef(false);
  const lastViolationRef = useRef<number>(0);
  const isReportingRef = useRef(false);
  const tabSwitchRef = useRef(false);
  const fsReentryRef = useRef(false);
  const screenshotRef = useRef(false);
  const warningRef = useRef(initialWarningCount);
  const lastVisibilityChangeRef = useRef(Date.now());

  // ── On mount: fetch session state (handles page refresh) ──────────────
  useEffect(() => {
    if (!sessionId || sessionId === "init" || !authToken) return;
    (async () => {
      try {
        const r = await fetch(`/api/exam/status`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (r.ok) {
          const j = await r.json();
          const wc = j.warnings || j.warning_count || 0;
          warningRef.current = wc;
          setWarningCount(wc);
          if (j.auto_submitted || j.status === "submitted") {
            setAutoSubmitted(true);
            onAutoSubmit();
          }
        }
      } catch (e) {
        console.warn("[AntiCheat] Could not fetch session state:", e);
      }
    })();
  }, [sessionId, authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Grace period after mount + Mandatory Fullscreen ──────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      stabilizedRef.current = true;
    }, STABILIZE_MS);

    // Aggressive: try to force fullscreen immediately if not mobile
    if (!isMobile && !document.fullscreenElement && !isSubmitted && !autoSubmitted) {
      setOverlayMessage("🛡️ Security Protocol: This exam requires mandatory Fullscreen Mode.\nClick below to enter secure mode and begin.");
      setOverlayVisible(true);
    }

    return () => clearTimeout(t);
  }, [isMobile, isSubmitted, autoSubmitted]);

  // ── Core violation reporter ───────────────────────────────────────────
  const triggerViolation = useCallback(
    async (type: string) => {
      if (isSubmitted || autoSubmitted) return;
      if (!stabilizedRef.current) return;

      const now = Date.now();
      
      // Ignore if visibility changed in the last 1.5 seconds (lag protection)
      if (now - lastVisibilityChangeRef.current < 1500) return;
      // Add a 500ms hard lock to suppress rapid subsequent triggers
      if (now - lastViolationRef.current < 500) return;
      if (now - lastViolationRef.current < DEBOUNCE_MS) return;
      lastViolationRef.current = now;

      // Immediately show the blue overlay (user needs to see it even before server responds)
      const friendlyType = type.replace(/_/g, " ");
      setOverlayMessage(
        `⚠️ Violation detected: ${friendlyType}. Click "I Understand" to return to the exam.`
      );
      setOverlayVisible(true);

      if (isReportingRef.current) return;
      isReportingRef.current = true;

      try {
        const res = await fetch("/api/exam/report-violation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            type,
            metadata: { timestamp: new Date().toISOString() },
          }),
        });

        if (res.ok) {
          const j = await res.json();
          const serverCount = j.warning_count || warningRef.current + 1;
          warningRef.current = serverCount;
          setWarningCount(serverCount);

          if (onViolation) onViolation(type, { warning_count: serverCount });

          if (j.auto_submitted || serverCount >= MAX_WARNINGS) {
            setAutoSubmitted(true);
            setOverlayMessage(
              `🔴 Exam automatically submitted due to ${serverCount} violations.`
            );
            // Block all interactions
            setOverlayVisible(true);
            setTimeout(() => {
              onAutoSubmit();
            }, 3000);
          } else {
            setOverlayMessage(
              `⚠️ Warning ${serverCount} of ${MAX_WARNINGS}: ${friendlyType} detected.\n` +
              `Click "I Understand" to return to fullscreen.\n` +
              (serverCount === MAX_WARNINGS - 1
                ? "⚡ ONE MORE VIOLATION will auto-submit your exam!"
                : `${MAX_WARNINGS - serverCount} violation(s) remaining.`)
            );
          }
        } else {
          // If server is unreachable, use client-side count
          const clientCount = warningRef.current + 1;
          warningRef.current = clientCount;
          setWarningCount(clientCount);
          setOverlayMessage(
            `⚠️ Warning ${clientCount} of ${MAX_WARNINGS}: ${friendlyType} detected.`
          );
        }
      } catch (err) {
        console.error("[AntiCheat] report violation failed:", err);
      } finally {
        isReportingRef.current = false;
      }
    },
    [isSubmitted, autoSubmitted, authToken, onAutoSubmit, onViolation]
  );

  // ── Dismiss overlay + re-enter fullscreen ─────────────────────────────
  const handleUnderstand = useCallback(async () => {
    setOverlayVisible(false);
    fsReentryRef.current = true;
    if (forceReenterFullscreen) {
      try {
        await forceReenterFullscreen();
      } catch (e) {
        console.warn("Fullscreen re-entry failed:", e);
      }
    } else {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Browser refused — show a gentle instruction (don't trigger another violation)
        setOverlayMessage(
          "⚠️ Fullscreen was blocked by your browser.\n" +
          "Please press F11 or use your browser's View menu to go fullscreen manually."
        );
        setOverlayVisible(true);
      }
    }
    // Release the re-entry lock after a short delay
    setTimeout(() => {
      fsReentryRef.current = false;
    }, 1500);
  }, [forceReenterFullscreen]);

  // ── Event listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (isMobile) return;

    // Visibility / tab switch
    const handleVisibility = () => {
      lastVisibilityChangeRef.current = Date.now();
      if (document.hidden) {
        tabSwitchRef.current = true;
        triggerViolation("tab_switch");
        // Maintain lock for 3s to allow the user to come back and click Understand
        setTimeout(() => {
          tabSwitchRef.current = false;
        }, 3000);
      }
    };

    // Window blur — only when in fullscreen
    const handleBlur = () => {
      // If we're already in a tab switch or re-entry, ignore blur
      if (tabSwitchRef.current || fsReentryRef.current || screenshotRef.current) return;
      
      if (
        document.visibilityState === "visible" &&
        !tabSwitchRef.current &&
        !!document.fullscreenElement
      ) {
        triggerViolation("window_blur");
      }
    };

    // Fullscreen exit
    const handleFsChange = () => {
      // If the browser exits fullscreen because of a tab switch, don't double-trigger
      if (document.hidden || tabSwitchRef.current || fsReentryRef.current) return;
      
      const fsElement = document.fullscreenElement || 
                        (document as any).webkitFullscreenElement || 
                        (document as any).mozFullScreenElement ||
                        (document as any).msFullscreenElement;

      if (!fsElement && !isSubmitted && !autoSubmitted) {
        triggerViolation("fullscreen_exit");
      }
    };

    // Resize fallback — if window becomes smaller than screen, they likely exited FS
    const handleResize = () => {
      if (fsReentryRef.current || isSubmitted || autoSubmitted) return;
      
      // Heuristic: if window width or height is significantly smaller than screen
      // Most browsers exit FS mode when window is resized or maximized from FS
      const isActuallyFS = window.innerWidth >= window.screen.width - 2 && 
                           window.innerHeight >= window.screen.height - 2;
      
      if (!isActuallyFS && !document.fullscreenElement && !tabSwitchRef.current) {
        // Only trigger if we're not currently doing a re-entry
        triggerViolation("fullscreen_exit");
      }
    };

    // Context menu
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
      triggerViolation("context_menu");
    };

    // Copy / paste / cut
    const handleClipboard = (e: Event) => {
      e.preventDefault();
      triggerViolation("clipboard_action");
    };

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key;

      // PrintScreen
      if (key === "PrintScreen" || key === "Printscr") {
        e.preventDefault();
        screenshotRef.current = true;
        triggerViolation("screenshot_attempt");
        setTimeout(() => { screenshotRef.current = false; }, 2000);
        return;
      }
      // Escape — exits fullscreen
      if (key === "Escape") {
        // Don't preventDefault — browser ignores it for Escape+fullscreen
        // Just log it; fullscreenchange will fire
        return;
      }
      // F11 / F12
      if (key === "F11" || key === "F12") {
        e.preventDefault();
        triggerViolation("keyboard_shortcut");
      }
      // Ctrl+P (print), Ctrl+S (save page), Ctrl+T (new tab), Ctrl+W (close), Ctrl+R (reload)
      if (ctrl && ["p", "s", "t", "w", "r"].includes(key.toLowerCase())) {
        e.preventDefault();
        triggerViolation("keyboard_shortcut");
      }
      // Ctrl+Shift+I / Ctrl+Shift+J (DevTools)
      if (ctrl && shift && ["i", "j"].includes(key.toLowerCase())) {
        e.preventDefault();
        triggerViolation("keyboard_shortcut");
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    document.addEventListener("mozfullscreenchange", handleFsChange);
    document.addEventListener("MSFullscreenChange", handleFsChange);
    window.addEventListener("resize", handleResize);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleClipboard);
    document.addEventListener("paste", handleClipboard);
    document.addEventListener("cut", handleClipboard);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
      document.removeEventListener("mozfullscreenchange", handleFsChange);
      document.removeEventListener("MSFullscreenChange", handleFsChange);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleClipboard);
      document.removeEventListener("paste", handleClipboard);
      document.removeEventListener("cut", handleClipboard);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [triggerViolation, isMobile, isSubmitted]);

  if (!overlayVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: autoSubmitted
          ? "rgba(10, 0, 0, 0.95)"
          : "rgba(0, 5, 15, 0.9)",
        zIndex: 9999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        padding: 24,
        flexDirection: "column",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
          background: "rgba(15, 25, 45, 0.95)",
          borderRadius: 28,
          padding: "48px 32px",
          border: `1px solid ${autoSubmitted ? "rgba(255,80,80,0.4)" : "rgba(40,215,214,0.3)"}`,
          boxShadow: "0 25px 70px rgba(0,0,0,0.8), 0 0 40px rgba(40,215,214,0.1)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle background glow */}
        <div style={{
          position: "absolute",
          top: "-20%",
          left: "-20%",
          width: "140%",
          height: "140%",
          background: autoSubmitted 
            ? "radial-gradient(circle at center, rgba(255,0,0,0.05) 0%, transparent 70%)"
            : "radial-gradient(circle at center, rgba(40,215,214,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Icon */}
        <div style={{ 
          fontSize: 64, 
          marginBottom: 24,
          filter: "drop-shadow(0 0 15px rgba(255,255,255,0.2))"
        }}>
          {autoSubmitted ? "🚫" : "⚠️"}
        </div>

        <h2
          style={{
            fontSize: 22,
            fontWeight: 800,
            marginBottom: 12,
            color: autoSubmitted ? "#ff8080" : "#60b4ff",
            letterSpacing: "-0.02em",
          }}
        >
          {autoSubmitted ? "Exam Auto-Submitted" : "Exam Security Alert"}
        </h2>

        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            whiteSpace: "pre-line",
            marginBottom: 20,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          {overlayMessage}
        </p>

        {/* Warning indicator */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginBottom: 28,
          }}
        >
          {Array.from({ length: MAX_WARNINGS }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background:
                  i < warningCount
                    ? warningCount >= MAX_WARNINGS
                      ? "#ff4444"
                      : "#ffbb33"
                    : "rgba(255,255,255,0.2)",
                border: "2px solid rgba(255,255,255,0.3)",
                transition: "all 0.3s",
              }}
            />
          ))}
        </div>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            marginBottom: 24,
          }}
        >
          Warning {warningCount} of {MAX_WARNINGS}
          {warningCount >= MAX_WARNINGS
            ? " — Exam submitted"
            : ` — ${MAX_WARNINGS - warningCount} remaining`}
        </p>

        {!autoSubmitted && (
          <button
            onClick={handleUnderstand}
            style={{
              padding: "14px 36px",
              fontSize: 15,
              fontWeight: 700,
              background: "linear-gradient(135deg, #1a6fff, #0a4fd8)",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              cursor: "pointer",
              letterSpacing: "0.02em",
              boxShadow: "0 4px 20px rgba(26,111,255,0.4)",
              transition: "transform 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.target as HTMLButtonElement).style.transform = "scale(1.04)")
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLButtonElement).style.transform = "scale(1)")
            }
          >
            I Understand — Return to Exam
          </button>
        )}

        {/* Disclaimer */}
        <p
          style={{
            marginTop: 20,
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            lineHeight: 1.5,
          }}
        >
          This system monitors fullscreen, tab switches, and key combinations.
          It cannot prevent OS-level screenshots or physical photos.
        </p>
      </div>
    </div>
  );
}
