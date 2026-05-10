"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { reportViolation } from "@/lib/api";
import WarningModal from "./WarningModal";
import dynamic from "next/dynamic";

const FaceMonitor = dynamic(() => import("./FaceMonitor"), { ssr: false });

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
  const lastViolationRef = useRef(0); 

  const [ready, setReady] = useState(false);

  useEffect(() => {
    setWarningCount(initialWarningCount);
    warningRef.current = initialWarningCount;
  }, [initialWarningCount]);

  // Grace period: 6 seconds after mount
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 6000);
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

  const triggerViolation = useCallback(
    async (type: string, metadata?: Record<string, unknown>) => {
      if (isSubmitted || !ready) return;

      const now = Date.now();
      if (now - lastViolationRef.current < 1500) return;
      lastViolationRef.current = now;

      const nextCount = warningRef.current + 1;
      warningRef.current = nextCount;
      setWarningCount(nextCount);

      if (onViolation) onViolation(type, { ...metadata, warning_count: nextCount });

      let message: string;
      if (nextCount >= 3) {
        message = `🔴 3rd violation detected (${type.replace(/_/g, ' ')}). Your exam session has been terminated.`;
      } else if (nextCount === 2) {
        message = `🚨 Warning 2 of 3: ${type.replace(/_/g, ' ')}. Final warning before session termination.`;
      } else {
        message = `⚠️ Warning 1 of 3: ${type.replace(/_/g, ' ')} detected. Fullscreen mode is mandatory.`;
      }

      setModalMessage(message);
      setShowModal(true);

      // Report to backend immediately
      try {
        await reportViolation(type, { ...metadata, warning_count: nextCount, status: nextCount >= 3 ? "auto_submitted" : "active" });
      } catch {}

      if (nextCount >= 3) {
        setTimeout(() => {
          onAutoSubmit();
        }, 2000);
      } else {
        // Attempt immediate re-entry (may fail, which shows the gate in parent)
        setTimeout(localReenter, 500);
      }
    },
    [isSubmitted, ready, onAutoSubmit, onViolation, localReenter]
  );

  // ── Listeners ──
  useEffect(() => {
    if (isMobile) return;
    const vh = () => { if (document.visibilityState === "hidden") triggerViolation("tab_switch"); };
    const bh = () => { if (document.visibilityState === "visible") triggerViolation("window_blur"); };
    
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
      const blocked = [
        (e.ctrlKey || e.metaKey) && ["c", "v", "a", "u", "s", "p", "f"].includes(e.key.toLowerCase()),
        e.key === "F12",
        e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C"),
        e.altKey && (e.key === "Tab" || e.key === "F4"),
        e.key === "PrintScreen",
        (e.metaKey || e.ctrlKey) && (e.key === "Tab" || e.key === "w")
      ].some(Boolean);

      if (blocked) {
        e.preventDefault();
        triggerViolation("keyboard_shortcut", { key: e.key });
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
      <FaceMonitor />
    </>
  );
}
