import { useCallback, useEffect, useRef, useState } from "react";
import { useTerminalStore } from "../store/terminal";
import { usePanelLayoutStore } from "../store/panel-layout";
import {
  closePty as ipcClosePty,
  createPty as ipcCreatePty,
  getAppConfig,
} from "../lib/platform";
import { runCommand, runCommandSafely } from "../lib/command";
import { log, error as logError } from "../lib/logger";

interface GlobalTerminalIds {
  paneId: string;
  ptyId: string;
}

export function useGlobalTerminal() {
  const theme = useTerminalStore((s) => s.theme);
  const paneId = usePanelLayoutStore((s) => s.globalTerminal.paneId);
  const resetGlobalTerminalPaneId = usePanelLayoutStore(
    (s) => s.resetGlobalTerminalPaneId,
  );
  const idsRef = useRef<GlobalTerminalIds | null>(null);
  const [ready, setReady] = useState(false);
  const [ptyId, setPtyId] = useState("");
  const operationRef = useRef(0);

  const createGlobalPty = useCallback(async (nextPaneId: string) => {
    if (!theme) {
      return;
    }

    const nextPtyId = crypto.randomUUID();
    const operationId = ++operationRef.current;
    idsRef.current = { paneId: nextPaneId, ptyId: nextPtyId };
    setPtyId(nextPtyId);
    setReady(false);

    try {
      const config = await runCommand(() => getAppConfig(), {
        errorToast: false,
      });
      const groveHome = config.baseDir;

      log("global-terminal", "creating pty", {
        paneId: nextPaneId,
        ptyId: nextPtyId,
        cwd: groveHome,
      });
      await runCommand(
        () =>
          ipcCreatePty({
            ptyId: nextPtyId,
            paneId: nextPaneId,
            worktreePath: groveHome,
            cwd: groveHome,
            cols: 80,
            rows: 24,
          }),
        { errorToast: false },
      );

      if (operationRef.current !== operationId) {
        await runCommandSafely(() => ipcClosePty(nextPtyId), { errorToast: false });
        return;
      }

      idsRef.current = { paneId: nextPaneId, ptyId: nextPtyId };
      log("global-terminal", "pty created");
      setReady(true);
    } catch (e) {
      if (operationRef.current === operationId) {
        idsRef.current = null;
        setPtyId("");
        setReady(false);
      }
      logError("global-terminal", "failed to create pty", e);
    }
  }, [theme]);

  useEffect(() => {
    if (!theme || !paneId) return;
    if (idsRef.current?.paneId === paneId) return;
    void createGlobalPty(paneId);
  }, [createGlobalPty, paneId, theme]);

  const reset = useCallback(async () => {
    const currentPtyId = idsRef.current?.ptyId;
    operationRef.current += 1;
    idsRef.current = null;
    setReady(false);
    setPtyId("");

    if (currentPtyId) {
      await runCommandSafely(() => ipcClosePty(currentPtyId), {
        errorToast: false,
      });
    }

    resetGlobalTerminalPaneId();
  }, [resetGlobalTerminalPaneId]);

  return {
    paneId,
    ptyId,
    ready,
    reset,
  };
}
