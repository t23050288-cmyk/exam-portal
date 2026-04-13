"use client";

import { useCallback, useRef } from "react";

export function useFullscreen() {
  const containerRef = useRef<HTMLElement | null>(null);

  const enter = useCallback(async (el?: HTMLElement | null) => {
    const target = el || document.documentElement;
    containerRef.current = target;
    try {
      if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if ((target as any).webkitRequestFullscreen) {
        await (target as any).webkitRequestFullscreen();
      }
    } catch {
      // Fullscreen may fail if user hasn't interacted yet — that's fine
    }
  }, []);

  const exit = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }
    } catch {}
  }, []);

  const isFullscreen = useCallback(() => {
    return !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement
    );
  }, []);

  return { enter, exit, isFullscreen };
}
