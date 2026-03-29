import { useEffect, useEffectEvent } from "react";

type KeyName = "Escape" | " " | (string & {});

/**
 * Subscribe to global key events (outside xterm terminals).
 *
 * @param key        The `KeyboardEvent.key` value to match.
 * @param handler    Called when the key is pressed.
 * @param activated  When false the handler is unsubscribed. Defaults to `true`.
 */
export function useKeyHandler(key: KeyName, handler: () => void, activated = true) {
  const stableHandler = useEffectEvent(handler);

  useEffect(() => {
    if (!activated) return;
    const listener = (e: KeyboardEvent) => {
      if (e.key !== key) return;
      if ((e.target as HTMLElement).closest(".xterm")) return;
      e.preventDefault();
      stableHandler();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [key, activated]);
}
