import { getGrovePreferences, openExternal, platform } from "./platform";
import { log } from "./logger";

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

async function handleUrl(url: string) {
  const prefs = await getGrovePreferences();
  const mode = prefs.terminalLinkOpenMode;

  if (mode === "internal") {
    log("url-open", "internal (not implemented):", url);
    // TODO: open in Grove browser tab
    openExternal(url).catch(() => {});
  } else if (mode === "external-with-localhost-internal" && isLocalhostUrl(url)) {
    log("url-open", "localhost-internal (not implemented):", url);
    // TODO: open in Grove browser tab
    openExternal(url).catch(() => {});
  } else {
    openExternal(url).catch(() => {});
  }
}

/** Listen for URL open requests from the Grove backend (via open-url socket). */
export async function initUrlOpenPipe(): Promise<(() => void) | undefined> {
  const unlisten = await platform.listen<string>(
    "grove:open-url",
    (url) => {
      log("url-open", "received:", url);
      handleUrl(url);
    },
  );
  return unlisten;
}
