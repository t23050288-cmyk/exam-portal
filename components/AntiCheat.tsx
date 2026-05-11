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
const STABILIZE_MS = 2500;  // grace period after mount before violations count
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
  const warningRef = useRef(initialWarningCount);

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

  // ── Grace period after mount ──────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      stabilizedRef.current = true;
    }, STABILIZE_MS);
    return () => clearTimeout(t);
  }, []);

  // ── Core violation reporter ───────────────────────────────────────────
  const triggerViolation = useCallback(
    async (type: string) => {
      if (isSubmitted || autoSubmitted) return;
      if (!stabilizedRef.current) return;

      const now = Date.now();
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
            setTimeout(() => {
              onAutoSubmit();
            }, 2500);
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
    if (autoSubmitted || isSubmitted) return;
    try {
      if (!document.fullscreenElement) {
        if (forceReenterFullscreen) {
          forceReenterFullscreen();
        } else {
          await document.documentElement.requestFullscreen();
        }
      }
    } catch {
      // Browser refused — show a gentle instruction (don't trigger another violation)
      setOverlayMessage(
        "⚠️ Fullscreen was blocked by your browser.\n" +
        "Please press F11 or use your browser's View menu to go fullscreen manually."
      );
      setOverlayVisible(true);
      // Don't count this as a violation
    }
  }, [forceReenterFullscreen, autoSubmitted, isSubmitted]);

  // ── Event listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (isMobile) return;

    // Visibility / tab switch
    const handleVisibility = () => {
      if (document.hidden) {
        tabSwitchRef.current = true;
        triggerViolation("tab_switch");
        setTimeout(() => {
          tabSwitchRef.current = false;
        }, 3000);
      }
    };

    // Window blur — only when in fullscreen
    const handleBlur = () => {
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
      if (!document.fullscreenElement && !isSubmitted && !tabSwitchRef.current) {
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
        triggerViolation("screenshot_attempt");
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
          ? "rgba(120, 0, 0, 0.97)"
          : "rgba(2, 60, 150, 0.96)",
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        padding: 24,
        flexDirection: "column",
        backdropFilter: "blur(8px)",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          width: "100%",
          textAlign: "center",
          background: "rgba(0,0,0,0.3)",
          borderRadius: 20,
          padding: "40px 32px",
          border: `1px solid ${autoSubmitted ? "rgba(255,80,80,0.4)" : "rgba(100,180,255,0.3)"}`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: 52, marginBottom: 16 }}>
          {autoSubmitted ? "🔴" : "🔒"}
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
