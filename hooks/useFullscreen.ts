import { useCallback, useState, useEffect } from "react";

export function useFullscreen() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handler = () => {
      setActive(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    // Init
    handler();
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  const enter = useCallback(async (el?: HTMLElement | null) => {
    const target = el || document.documentElement;
    try {
      if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if ((target as any).webkitRequestFullscreen) {
        await (target as any).webkitRequestFullscreen();
      }
    } catch {
      // Fullscreen may fail if user hasn't interacted yet
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

  const toggle = useCallback(() => {
    if (active) exit(); else enter();
  }, [active, enter, exit]);

  return { enter, exit, toggle, active };
}
