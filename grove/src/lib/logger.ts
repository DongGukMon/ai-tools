const DEBUG = import.meta.env.DEV;

export function log(tag: string, ...args: unknown[]) {
  if (DEBUG) {
    console.log(`[grove:${tag}]`, ...args);
  }
}

export function warn(tag: string, ...args: unknown[]) {
  if (DEBUG) {
    console.warn(`[grove:${tag}]`, ...args);
  }
}

export function error(tag: string, ...args: unknown[]) {
  console.error(`[grove:${tag}]`, ...args);
}

/** Listen for backend log events and pipe to console. Returns cleanup function. */
export async function initBackendLogPipe(): Promise<(() => void) | undefined> {
  if (!DEBUG) return;
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<{ level: string; tag: string; message: string }>("grove:log", (event) => {
    const { level, tag, message } = event.payload;
    const prefix = `[grove:backend:${tag}]`;
    if (level === "error") console.error(prefix, message);
    else if (level === "warn") console.warn(prefix, message);
    else console.log(prefix, message);
  });
  return unlisten;
}
