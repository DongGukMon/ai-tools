import { useEffect, useRef, useState } from "react";
import { useTerminalStore } from "../store/terminal";
import { createPty as ipcCreatePty, getAppConfig } from "../lib/platform";
import { runCommand } from "../lib/command";
import { log, error as logError } from "../lib/logger";

interface GlobalTerminalIds {
  paneId: string;
  ptyId: string;
}

export function useGlobalTerminal() {
  const theme = useTerminalStore((s) => s.theme);
  const idsRef = useRef<GlobalTerminalIds>({
    paneId: crypto.randomUUID(),
    ptyId: crypto.randomUUID(),
  });
  const [ready, setReady] = useState(false);
  const createdRef = useRef(false);

  useEffect(() => {
    if (!theme || createdRef.current) return;
    createdRef.current = true;

    async function create() {
      try {
        const config = await runCommand(() => getAppConfig(), {
          errorToast: false,
        });
        const groveHome = config.baseDir;
        const { paneId, ptyId } = idsRef.current;

        log("global-terminal", "creating pty", { paneId, ptyId, cwd: groveHome });
        await runCommand(
          () =>
            ipcCreatePty({
              ptyId,
              paneId,
              worktreePath: groveHome,
              cwd: groveHome,
              cols: 80,
              rows: 24,
            }),
          { errorToast: false },
        );

        log("global-terminal", "pty created");
        setReady(true);
      } catch (e) {
        logError("global-terminal", "failed to create pty", e);
        createdRef.current = false;
      }
    }

    create();
  }, [theme]);

  return {
    paneId: idsRef.current.paneId,
    ptyId: idsRef.current.ptyId,
    ready,
  };
}
