import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import type { TerminalTheme } from "../types";
import { platform, resizePty, writePty } from "./platform";
import {
  getMacShortcutSequence,
  isMacClearTerminalShortcut,
  isTerminalCompositionEvent,
} from "./terminal-input";

export type TerminalInitialContentSource = "snapshotFallback" | "tmuxCapture";

export interface TerminalPaneSeed {
  initialScrollback?: string;
  initialScrollbackSource?: TerminalInitialContentSource;
  launchCwd?: string;
  ptyId?: string;
}

type FocusHandler = (ptyId: string) => void;
type ErrorHandler = (message: string | null) => void;
type ActivitySource = "output" | "tmuxCapture";

export interface TerminalPaneActivity {
  paneId: string;
  ptyId: string;
  source: ActivitySource;
}

function toXtermTheme(theme: TerminalTheme | null) {
  if (!theme) {
    return undefined;
  }

  return {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.cursor,
    black: theme.black,
    red: theme.red,
    green: theme.green,
    yellow: theme.yellow,
    blue: theme.blue,
    magenta: theme.magenta,
    cyan: theme.cyan,
    white: theme.white,
    brightBlack: theme.brightBlack,
    brightRed: theme.brightRed,
    brightGreen: theme.brightGreen,
    brightYellow: theme.brightYellow,
    brightBlue: theme.brightBlue,
    brightMagenta: theme.brightMagenta,
    brightCyan: theme.brightCyan,
    brightWhite: theme.brightWhite,
  };
}

const paneSeeds = new Map<string, TerminalPaneSeed>();
const runtimes = new Map<string, TerminalPaneRuntime>();
const activityListeners = new Set<(activity: TerminalPaneActivity) => void>();
const RUNTIME_RELEASE_GRACE_MS = 50;

function emitTerminalPaneActivity(activity: TerminalPaneActivity) {
  for (const listener of activityListeners) {
    listener(activity);
  }
}

export function subscribeTerminalPaneActivity(
  listener: (activity: TerminalPaneActivity) => void,
) {
  activityListeners.add(listener);
  return () => {
    activityListeners.delete(listener);
  };
}

export function primeTerminalPane(
  paneId: string,
  seed: TerminalPaneSeed,
) {
  const runtime = runtimes.get(paneId);
  if (runtime) {
    runtime.applySeed(seed);
    return;
  }

  const existing = paneSeeds.get(paneId);
  paneSeeds.set(paneId, {
    ...existing,
    ...seed,
    initialScrollback: seed.initialScrollback ?? existing?.initialScrollback,
    initialScrollbackSource:
      seed.initialScrollback !== undefined
        ? seed.initialScrollbackSource
        : existing?.initialScrollbackSource,
  });
}

export function acquireTerminalRuntime(
  paneId: string,
  theme: TerminalTheme | null,
) {
  let runtime = runtimes.get(paneId);
  if (!runtime) {
    runtime = new TerminalPaneRuntime(paneId, paneSeeds.get(paneId), theme);
    paneSeeds.delete(paneId);
    runtimes.set(paneId, runtime);
  }

  runtime.retain();
  runtime.setTheme(theme);
  return runtime;
}

export function getTerminalPaneLaunchCwd(paneId: string): string | undefined {
  return runtimes.get(paneId)?.launchCwd ?? paneSeeds.get(paneId)?.launchCwd;
}

class TerminalPaneRuntime {
  readonly paneId: string;
  readonly term: Terminal;
  readonly fitAddon: FitAddon;
  launchCwd?: string;

  private ptyId = "";
  private container: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private focusHandler: FocusHandler | null = null;
  private errorHandler: ErrorHandler | null = null;
  private releaseTimer: number | null = null;
  private frameId: number | null = null;
  private refCount = 0;
  private hasLoadedWebgl = false;
  private lastCols = 0;
  private lastRows = 0;
  private initialScrollback = "";
  private initialScrollbackSource: TerminalInitialContentSource | undefined;
  private hydrationStarted = false;
  private hydrated = false;
  private pendingOutput: Uint8Array[] = [];
  private disposed = false;
  private lastError: string | null = null;

  private onTrackpadMouseDown: (() => void) | null = null;
  private onTrackpadMouseUp: (() => void) | null = null;
  private onTrackpadMouseMoveCapture: ((event: MouseEvent) => void) | null = null;
  private onFocusIn: (() => void) | null = null;
  private ownerDocument: Document | null = null;

  private readonly unlistenPromise: Promise<() => void>;
  private readonly dataDisposable: { dispose(): void };

  constructor(
    paneId: string,
    seed: TerminalPaneSeed | undefined,
    theme: TerminalTheme | null,
  ) {
    this.paneId = paneId;
    this.ptyId = seed?.ptyId ?? "";
    this.launchCwd = seed?.launchCwd;
    this.initialScrollback = seed?.initialScrollback ?? "";
    this.initialScrollbackSource = seed?.initialScrollbackSource;
    this.hydrated = this.initialScrollback.length === 0;
    this.term = new Terminal({
      cursorBlink: true,
      fontFamily: theme?.fontFamily ?? "Menlo, monospace",
      fontSize: theme?.fontSize ?? 13,
      theme: toXtermTheme(theme),
      allowProposedApi: true,
      macOptionClickForcesSelection: true,
    });

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);

    const unicode11 = new Unicode11Addon();
    this.term.loadAddon(unicode11);
    this.term.unicode.activeVersion = "11";

    this.dataDisposable = this.term.onData((data) => {
      if (!this.ptyId) {
        return;
      }

      const bytes = Array.from(new TextEncoder().encode(data));
      writePty(this.ptyId, bytes).catch((error) => {
        console.error("writePty failed:", error);
      });
    });

    this.term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      if (isTerminalCompositionEvent(event)) return true;

      if (isMacClearTerminalShortcut(event)) {
        this.term.clear();
        return false;
      }

      const sequence = getMacShortcutSequence(event);
      if (!sequence || !this.ptyId) {
        return true;
      }

      const bytes = Array.from(new TextEncoder().encode(sequence));
      writePty(this.ptyId, bytes).catch(() => {});
      return false;
    });

    this.unlistenPromise = platform.listen<{ id: string; data: string }>(
      "pty-output",
      (payload) => {
        if (payload.id !== this.ptyId) {
          return;
        }

        try {
          const binary = atob(payload.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          if (this.hydrated) {
            this.term.write(bytes);
          } else {
            this.pendingOutput.push(bytes);
          }
          this.reportActivity("output");
        } catch (error) {
          console.error("pty-output decode error:", error);
        }
      },
    ).catch((error) => {
      this.reportError(`Event listen failed: ${error}`);
      return () => {};
    });
  }

  retain() {
    this.refCount += 1;
    if (this.releaseTimer !== null) {
      window.clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
  }

  release() {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0 || this.releaseTimer !== null) {
      return;
    }

    // Split collapse can unmount and remount the surviving pane in quick succession.
    // Keep the runtime alive briefly so xterm DOM can be reattached instead of torn down.
    this.releaseTimer = window.setTimeout(() => {
      this.releaseTimer = null;
      if (this.refCount === 0) {
        this.dispose();
      }
    }, RUNTIME_RELEASE_GRACE_MS);
  }

  applySeed(seed: TerminalPaneSeed) {
    this.ptyId = seed.ptyId ?? this.ptyId;
    this.launchCwd = seed.launchCwd ?? this.launchCwd;
    if (!this.hydrationStarted && seed.initialScrollback !== undefined) {
      this.initialScrollback = seed.initialScrollback;
      this.initialScrollbackSource = seed.initialScrollbackSource;
      this.hydrated = this.initialScrollback.length === 0;
    }
  }

  setPtyId(ptyId: string) {
    this.ptyId = ptyId;
  }

  getPtyId() {
    return this.ptyId;
  }

  setTheme(theme: TerminalTheme | null) {
    this.term.options.theme = toXtermTheme(theme);
    if (theme) {
      this.term.options.fontFamily = theme.fontFamily;
      this.term.options.fontSize = theme.fontSize;
    }
  }

  setFocusHandler(handler: FocusHandler | null) {
    this.focusHandler = handler;
  }

  setErrorHandler(handler: ErrorHandler | null) {
    this.errorHandler = handler;
    this.errorHandler?.(this.lastError);
  }

  attach(container: HTMLDivElement) {
    if (this.disposed) {
      return;
    }

    if (this.container !== container) {
      this.detach();
      this.container = container;
      this.installContainerBindings(container);

      if (this.term.element && this.term.element.parentElement !== container) {
        container.appendChild(this.term.element);
      }
    }

    this.scheduleLayoutSync();
  }

  detach() {
    if (!this.container) {
      return;
    }

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.onFocusIn) {
      this.container.removeEventListener("focusin", this.onFocusIn);
      this.onFocusIn = null;
    }

    if (this.onTrackpadMouseDown) {
      this.container.removeEventListener("mousedown", this.onTrackpadMouseDown, true);
      this.onTrackpadMouseDown = null;
    }

    if (this.ownerDocument && this.onTrackpadMouseUp) {
      this.ownerDocument.removeEventListener("mouseup", this.onTrackpadMouseUp, true);
      this.onTrackpadMouseUp = null;
    }

    if (this.ownerDocument && this.onTrackpadMouseMoveCapture) {
      this.ownerDocument.removeEventListener(
        "mousemove",
        this.onTrackpadMouseMoveCapture,
        true,
      );
      this.onTrackpadMouseMoveCapture = null;
    }

    this.ownerDocument = null;
    this.container = null;
  }

  focus() {
    this.term.focus();
  }

  private installContainerBindings(container: HTMLDivElement) {
    this.ownerDocument = container.ownerDocument;

    let awaitingPointerRelease = false;
    this.onTrackpadMouseDown = () => {
      awaitingPointerRelease = true;
    };
    this.onTrackpadMouseUp = () => {
      awaitingPointerRelease = false;
    };
    this.onTrackpadMouseMoveCapture = (event: MouseEvent) => {
      if (!awaitingPointerRelease || event.buttons !== 0) {
        return;
      }

      awaitingPointerRelease = false;
      event.stopImmediatePropagation();
      container.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 0,
          clientX: event.clientX,
          clientY: event.clientY,
        }),
      );
    };
    this.onFocusIn = () => {
      if (this.ptyId) {
        this.focusHandler?.(this.ptyId);
      }
    };

    container.addEventListener("mousedown", this.onTrackpadMouseDown, true);
    this.ownerDocument.addEventListener("mouseup", this.onTrackpadMouseUp, true);
    this.ownerDocument.addEventListener(
      "mousemove",
      this.onTrackpadMouseMoveCapture,
      true,
    );
    container.addEventListener("focusin", this.onFocusIn);

    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleLayoutSync();
    });
    this.resizeObserver.observe(container);
  }

  private scheduleLayoutSync() {
    if (this.disposed || !this.container || this.frameId !== null) {
      return;
    }

    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      if (this.disposed || !this.container || !this.hasLayoutDimensions()) {
        return;
      }

      if (!this.term.element) {
        this.term.open(this.container);
        this.startHydration();
      } else if (this.term.element.parentElement !== this.container) {
        this.container.appendChild(this.term.element);
      }

      this.loadWebglAddon();
      this.fitTerminal();
    });
  }

  private hasLayoutDimensions() {
    if (!this.container) {
      return false;
    }

    const { width, height } = this.container.getBoundingClientRect();
    return width > 0 && height > 0;
  }

  private loadWebglAddon() {
    if (this.hasLoadedWebgl) {
      return;
    }

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      this.term.loadAddon(webglAddon);
      this.hasLoadedWebgl = true;
    } catch {
      // Canvas renderer fallback
    }
  }

  private fitTerminal() {
    try {
      this.fitAddon.fit();
      this.syncPtySize();
    } catch {
      // ignore fit errors if the host is not ready yet
    }
  }

  private syncPtySize() {
    const { cols, rows } = this.term;
    if (!cols || !rows || !this.ptyId) {
      return;
    }

    if (cols === this.lastCols && rows === this.lastRows) {
      return;
    }

    this.lastCols = cols;
    this.lastRows = rows;
    resizePty(this.ptyId, cols, rows).catch(() => {});
  }

  private startHydration() {
    if (this.hydrationStarted) {
      return;
    }

    this.hydrationStarted = true;
    if (!this.initialScrollback) {
      this.finishInitialHydration();
      this.flushPendingOutput();
      return;
    }

    this.term.write(this.initialScrollback, () => {
      this.finishInitialHydration();
      this.flushPendingOutput();
    });
  }

  private flushPendingOutput() {
    const chunk = this.pendingOutput.shift();
    if (!chunk) {
      this.hydrated = true;
      return;
    }

    this.term.write(chunk, () => {
      this.flushPendingOutput();
    });
  }

  private reportError(message: string) {
    this.lastError = message;
    this.errorHandler?.(message);
  }

  private finishInitialHydration() {
    const source = this.initialScrollbackSource;
    this.initialScrollback = "";
    this.initialScrollbackSource = undefined;
    if (source === "tmuxCapture") {
      this.reportActivity("tmuxCapture");
    }
  }

  private reportActivity(source: ActivitySource) {
    if (!this.ptyId) {
      return;
    }

    emitTerminalPaneActivity({
      paneId: this.paneId,
      ptyId: this.ptyId,
      source,
    });
  }

  private dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.detach();
    this.dataDisposable.dispose();
    this.unlistenPromise.then((unlisten) => {
      if (typeof unlisten === "function") {
        unlisten();
      }
    });
    this.term.dispose();
    paneSeeds.delete(this.paneId);
    runtimes.delete(this.paneId);
  }
}
