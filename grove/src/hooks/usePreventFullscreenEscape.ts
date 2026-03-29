import { useEffect, useRef } from "react";
import { useFullscreen } from "./useFullscreen";

/**
 * Prevent ESC from exiting macOS native fullscreen.
 *
 * On macOS, pressing ESC in native fullscreen triggers `cancelOperation:` on NSWindow,
 * which exits fullscreen. Both WKWebView (Tauri) and Chromium (Electron) dispatch
 * the DOM keydown event before the native handler runs, so calling `preventDefault()`
 * in the capture phase is enough to block the exit.
 *
 * xterm.js terminals are excluded — they already call `preventDefault()` internally
 * after processing ESC, which also prevents fullscreen exit.
 */
export function usePreventFullscreenEscape() {
  const isFullscreen = useFullscreen();
  const ref = useRef(isFullscreen);
  ref.current = isFullscreen;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !ref.current) return;
      const target = e.target as HTMLElement;
      if (target.closest(".xterm")) return;
      e.preventDefault();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);
}
