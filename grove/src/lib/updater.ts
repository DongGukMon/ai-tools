import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const LAST_CHECK_KEY = "grove:updater:lastCheck";

function isCheckDue(): boolean {
  const last = localStorage.getItem(LAST_CHECK_KEY);
  if (!last) return true;
  return Date.now() - Number(last) > CHECK_INTERVAL_MS;
}

function markChecked(): void {
  localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
}

export async function checkForUpdates(
  onUpdate: (version: string, install: () => Promise<void>) => void,
): Promise<void> {
  if (!isCheckDue()) return;
  markChecked();

  try {
    const update = await check();
    if (!update) return;

    onUpdate(update.version, async () => {
      await update.downloadAndInstall();
      await relaunch();
    });
  } catch (e) {
    console.warn("Update check failed:", e);
  }
}
