"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { reportViolation } from "@/lib/api";
import WarningModal from "./WarningModal";
import dynamic from "next/dynamic";

// const FaceMonitor = dynamic(() => import("./FaceMonitor"), { ssr: false });

interface AntiCheatProps {
  isSubmitted: boolean;
  onAutoSubmit: () => void;
  onViolation?: (type: string, metadata?: any) => void;
  initialWarningCount?: number;
  forceReenterFullscreen?: () => void;
}

export default function AntiCheat({ 
  isSubmitted, 
  onAutoSubmit, 
  onViolation, 
  initialWarningCount = 0,
  forceReenterFullscreen 
}: AntiCheatProps) {
  const [warningCount, setWarningCount] = useState(initialWarningCount);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const warningRef = useRef(initialWarningCount);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Only update if the incoming initial count is greater than our current local ref
    // This prevents a delayed fetch from overwriting local violations happened in the same session
    if (initialWarningCount > warningRef.current) {
      setWarningCount(initialWarningCount);
      warningRef.current = initialWarningCount;
    }
  }, [initialWarningCount]);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const isMobile = typeof window !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  const localReenter = useCallback(() => {
    if (forceReenterFullscreen) {
      forceReenterFullscreen();
    } else {
      const el = document.documentElement;
      if (!document.fullscreenElement && !isSubmitted) {
        el.requestFullscreen().catch(() => {});
      }
    }
  }, [forceReenterFullscreen, isSubmitted]);

  const lastViolationRef = useRef<number>(0);
  const processingViolationRef = useRef<boolean>(false);

  const triggerViolation = useCallback(
    async (type: string, metadata?: Record<string, unknown>) => {
      if (isSubmitted || !ready || processingViolationRef.current) return;

      const now = Date.now();
      // Enforce 1.5-second mandatory cooling period between ANY violations to prevent accidental double-fire
      if (now - lastViolationRef.current < 1500) return;
      
      processingViolationRef.current = true;
      lastViolationRef.current = now;

      const nextCount = warningRef.current + 1;
      warningRef.current = nextCount;
      setWarningCount(nextCount);

      if (onViolation) onViolation(type, { ...metadata, warning_count: nextCount });

      let message: string;
      const isAutoSubmit = nextCount >= 3;
      
      const friendlyType = type.replace(/_/g, ' ');
      if (isAutoSubmit) {
        message = `🔴 CRITICAL: 3rd violation detected (${friendlyType}). YOUR EXAM IS BEING AUTOMATICALLY SUBMITTED FOR SECURITY REVIEW.`;
      } else if (nextCount === 2) {
        message = `🚨 Warning 2 of 3: ${friendlyType} detected. Final warning before session termination.`;
      } else {
        message = `⚠️ Warning 1 of 3: ${friendlyType} detected. Fullscreen mode and focus are mandatory.`;
      }

      setModalMessage(message);
      setShowModal(true);

      // Report to backend immediately
      try {
        await reportViolation(type, { 
          ...metadata, 
          warning_count: nextCount, 
          status: isAutoSubmit ? "auto_submitted" : "active",
          is_auto_submit: isAutoSubmit
        });
      } catch (err) {
        console.error("AntiCheat: Failed to report violation:", err);
      } finally {
        processingViolationRef.current = false;
      }

      if (isAutoSubmit) {
        // Wait 2.5s for the student to read the terminal message before auto-submitting
        setTimeout(() => {
          onAutoSubmit();
        }, 2500);
      } else {
        // Attempt immediate re-entry (may fail, which shows the gate in parent)
        setTimeout(localReenter, 800);
      }
    },
    [isSubmitted, ready, onAutoSubmit, onViolation, localReenter]
  );

  // ── Listeners ──
  useEffect(() => {
    if (isMobile) return;
    // Tab switch: fires when tab becomes hidden
    const vh = () => { 
      if (document.visibilityState === "hidden") {
        triggerViolation("tab_switch"); 
      }
    };
    // Window blur: fires when window loses focus (alt-tab, clicking outside, etc.)
    const bh = () => {
      triggerViolation("window_blur");
    };
    document.addEventListener("visibilitychange", vh);
    window.addEventListener("blur", bh);
    
    return () => {
      document.removeEventListener("visibilitychange", vh);
      window.removeEventListener("blur", bh);
    };
  }, [triggerViolation, isMobile]);

  useEffect(() => {
    const fsh = () => {
      if (!document.fullscreenElement && !isSubmitted && ready) {
        triggerViolation("fullscreen_exit");
      }
    };
    document.addEventListener("fullscreenchange", fsh);
    document.addEventListener("webkitfullscreenchange", fsh);
    return () => {
      document.removeEventListener("fullscreenchange", fsh);
      document.removeEventListener("webkitfullscreenchange", fsh);
    };
  }, [triggerViolation, isSubmitted, ready]);

  useEffect(() => {
    const cmh = (e: MouseEvent) => { e.preventDefault(); triggerViolation("right_click"); };
    const ch = (e: ClipboardEvent) => { e.preventDefault(); triggerViolation("copy_attempt"); };
    const ph = (e: ClipboardEvent) => { e.preventDefault(); triggerViolation("paste_attempt"); };
    
    document.addEventListener("contextmenu", cmh);
    document.addEventListener("copy", ch);
    document.addEventListener("paste", ph);
    
    return () => {
      document.removeEventListener("contextmenu", cmh);
      document.removeEventListener("copy", ch);
      document.removeEventListener("paste", ph);
    };
  }, [triggerViolation]);

  useEffect(() => {
    const kdh = (e: KeyboardEvent) => {
      const isMac = typeof window !== "undefined" && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      
      const key = e.key.toLowerCase();
      const code = e.code.toLowerCase();

      const blocked = [
        cmdOrCtrl && ["c", "v", "a", "u", "s", "p", "f"].includes(key),
        key === "f12",
        cmdOrCtrl && e.shiftKey && (key === "i" || key === "j" || key === "c"),
        e.altKey && ["tab", "f4", "d", "enter"].includes(key),
        key === "printscreen" || code === "printscreen",
        (e.metaKey || e.ctrlKey) && (key === "tab" || key === "w" || code === "tab"),
        cmdOrCtrl && e.shiftKey && key === "escape", // Task Manager
        // Screenshot shortcuts
        (e.metaKey && e.shiftKey && ["3", "4", "5", "s"].includes(key)), // Mac + Win Snipping
        (e.metaKey && key === "s"), // Windows + S
      ].some(Boolean);

      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        const isScreenshot = key === "printscreen" || code === "printscreen" || 
                           (e.shiftKey && (key === "s" || key === "3" || key === "4")) ||
                           (e.metaKey && key === "s");
        triggerViolation(isScreenshot ? "screenshot_attempt" : "keyboard_shortcut", { key: e.key, code: e.code });
      }
    };
    document.addEventListener("keydown", kdh, true);
    return () => document.removeEventListener("keydown", kdh, true);
  }, [triggerViolation]);

  return (
    <>
      {showModal && (
        <WarningModal
          message={modalMessage}
          warningCount={warningCount}
          onDismiss={() => {
            setShowModal(false);
            if (warningCount < 3) localReenter();
          }}
          onReenterFullscreen={localReenter}
        />
      )}
      {/* <FaceMonitor onViolation={triggerViolation} isSubmitted={isSubmitted} /> */}
    </>
  );
}
