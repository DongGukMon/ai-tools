import { useState, useCallback, useEffect, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Monitor,
  Palette,
  RotateCcw,
  Settings,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  terminalThemes,
  themeDisplayNames,
  DEFAULT_THEME_KEY,
} from "../../lib/terminal-themes";
import { useTerminalStore } from "../../store/terminal";
import { saveAppConfig, getAppConfig } from "../../lib/tauri";
import { runCommandSafely } from "../../lib/command";
import { cn } from "../../lib/cn";
import type { TerminalTheme } from "../../types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ANSI_LABELS: { key: keyof TerminalTheme; label: string }[] = [
  { key: "black", label: "Black" },
  { key: "red", label: "Red" },
  { key: "green", label: "Green" },
  { key: "yellow", label: "Yellow" },
  { key: "blue", label: "Blue" },
  { key: "magenta", label: "Magenta" },
  { key: "cyan", label: "Cyan" },
  { key: "white", label: "White" },
  { key: "brightBlack", label: "Bright Black" },
  { key: "brightRed", label: "Bright Red" },
  { key: "brightGreen", label: "Bright Green" },
  { key: "brightYellow", label: "Bright Yellow" },
  { key: "brightBlue", label: "Bright Blue" },
  { key: "brightMagenta", label: "Bright Magenta" },
  { key: "brightCyan", label: "Bright Cyan" },
  { key: "brightWhite", label: "Bright White" },
];

export default function ThemeSettings({ open, onClose }: Props) {
  const theme = useTerminalStore((s) => s.theme);
  const loadTheme = useTerminalStore((s) => s.loadTheme);

  const [draft, setDraft] = useState<TerminalTheme | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [colorsOpen, setColorsOpen] = useState(false);

  // Sync draft with current theme when panel opens
  useEffect(() => {
    if (open && theme) {
      setDraft({ ...theme });
      // Detect which preset matches current theme
      const match = Object.entries(terminalThemes).find(
        ([, preset]) => preset.background === theme.background && preset.foreground === theme.foreground,
      );
      setActivePreset(match ? match[0] : null);
    }
  }, [open, theme]);

  const updateDraft = useCallback(
    (key: keyof TerminalTheme, value: string | number) => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
      setActivePreset(null);
    },
    [],
  );

  const selectPreset = useCallback((key: string) => {
    const preset = terminalThemes[key];
    if (!preset) return;
    // Preserve current font settings when switching presets
    setDraft((prev) => ({
      ...preset,
      fontFamily: prev?.fontFamily ?? preset.fontFamily,
      fontSize: prev?.fontSize ?? preset.fontSize,
    }));
    setActivePreset(key);
  }, []);

  const handleApply = useCallback(async () => {
    if (!draft) return;
    loadTheme(draft);
    await runCommandSafely(async () => {
      const config = await getAppConfig();
      await saveAppConfig({ ...config, terminalTheme: draft });
    }, {
      errorToast: "Failed to save terminal theme",
    });
  }, [draft, loadTheme]);

  const handleReset = useCallback(() => {
    const defaultTheme = terminalThemes[DEFAULT_THEME_KEY];
    setDraft({ ...defaultTheme });
    setActivePreset(DEFAULT_THEME_KEY);
  }, []);

  if (!open || !draft) return null;

  const activePresetLabel = activePreset
    ? (themeDisplayNames[activePreset] ?? "Custom")
    : "Custom";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "top-0 right-0 left-auto flex h-full w-full max-w-[440px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-l border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,246,248,0.97))] p-0 shadow-[0_18px_48px_rgba(15,23,42,0.16)] sm:max-w-[440px]",
          "data-[state=open]:slide-in-from-right-full data-[state=closed]:slide-out-to-right-full data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
        )}
      >
        <div className={cn("flex min-h-0 flex-1 flex-col")}>
          <div
            className={cn(
              "border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,250,251,0.9))] px-5 py-5",
            )}
          >
            <div className={cn("flex items-start gap-3")}>
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary-light)] text-[var(--color-primary)] shadow-xs",
                )}
              >
                <Settings size={18} strokeWidth={1.7} />
              </div>
              <div className={cn("min-w-0 flex-1")}>
                <div className={cn("flex flex-wrap items-center gap-2")}>
                  <DialogTitle className={cn("text-base font-semibold text-[var(--color-text)]")}>
                    Terminal appearance
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full border-white/80 bg-white/85 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]",
                    )}
                  >
                    {activePresetLabel}
                  </Badge>
                </div>
                <DialogDescription
                  className={cn("mt-1 text-[12px] leading-5 text-[var(--color-text-secondary)]")}
                >
                  Tune the shell visuals while keeping the existing terminal store and
                  persistence flow unchanged.
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "size-8 rounded-xl text-[var(--color-text-tertiary)] hover:bg-white hover:text-[var(--color-text)]",
                  )}
                >
                  <X size={15} strokeWidth={1.8} />
                  <span className={cn("sr-only")}>Close terminal appearance</span>
                </Button>
              </DialogClose>
            </div>
          </div>

          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5")}>
            <SettingsSection
              icon={Palette}
              title="Presets"
              description="Start from a baseline, then fine-tune the shell colors and typography."
            >
              <div className={cn("grid grid-cols-2 gap-2")}>
                {Object.entries(themeDisplayNames).map(([key, name]) => {
                  const preset = terminalThemes[key];
                  return (
                    <Button
                      key={key}
                      type="button"
                      variant="outline"
                      onClick={() => selectPreset(key)}
                      className={cn(
                        "h-auto items-start justify-start gap-3 rounded-2xl border-white/80 bg-white/86 px-3 py-3 text-left shadow-xs hover:bg-white",
                        {
                          "border-[var(--color-primary-border)] bg-[var(--color-primary-light)]/75 text-[var(--color-text)]":
                            activePreset === key,
                        },
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl border border-black/5 shadow-inner",
                        )}
                        style={{
                          background: `linear-gradient(135deg, ${preset.background}, ${preset.black})`,
                        }}
                      >
                        <span
                          className={cn("font-mono text-[11px] font-semibold")}
                          style={{ color: preset.foreground }}
                        >
                          &gt;_
                        </span>
                      </span>
                      <span className={cn("min-w-0")}>
                        <span className={cn("block truncate text-[12px] font-medium")}>
                          {name}
                        </span>
                        <span
                          className={cn(
                            "mt-1 block truncate text-[11px] text-[var(--color-text-tertiary)]",
                          )}
                        >
                          {preset.background}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </SettingsSection>

            <Separator className={cn("my-5 bg-white/70")} />

            <SettingsSection
              icon={Type}
              title="Typography"
              description="Font settings stay with you even when you switch presets."
            >
              <div className={cn("space-y-3")}>
                <div className={cn("rounded-[22px] border border-white/80 bg-white/86 p-4 shadow-xs")}>
                  <label
                    htmlFor="terminal-theme-font-family"
                    className={cn(
                      "mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]",
                    )}
                  >
                    Font family
                  </label>
                  <Input
                    id="terminal-theme-font-family"
                    type="text"
                    value={draft.fontFamily}
                    onChange={(e) => updateDraft("fontFamily", e.target.value)}
                    className={cn(
                      "h-10 rounded-xl border-white/80 bg-[var(--color-bg)] text-[12px] shadow-none",
                    )}
                  />
                </div>

                <div className={cn("rounded-[22px] border border-white/80 bg-white/86 p-4 shadow-xs")}>
                  <div className={cn("flex items-center justify-between gap-3")}>
                    <label
                      htmlFor="terminal-theme-font-size"
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]",
                      )}
                    >
                      Font size
                    </label>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full border-white/80 bg-white px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]",
                      )}
                    >
                      {draft.fontSize}px
                    </Badge>
                  </div>
                  <input
                    id="terminal-theme-font-size"
                    type="range"
                    min={10}
                    max={20}
                    step={1}
                    value={draft.fontSize}
                    onChange={(e) => updateDraft("fontSize", Number(e.target.value))}
                    className={cn(
                      "mt-4 h-1.5 w-full cursor-pointer accent-[var(--color-primary)]",
                    )}
                  />
                </div>
              </div>
            </SettingsSection>

            <Separator className={cn("my-5 bg-white/70")} />

            <SettingsSection
              icon={Settings}
              title="Core colors"
              description="These colors define the main terminal surface and cursor."
            >
              <div className={cn("space-y-3")}>
                <ColorField
                  label="Background"
                  value={draft.background}
                  onChange={(v) => updateDraft("background", v)}
                />
                <ColorField
                  label="Foreground"
                  value={draft.foreground}
                  onChange={(v) => updateDraft("foreground", v)}
                />
                <ColorField
                  label="Cursor"
                  value={draft.cursor}
                  onChange={(v) => updateDraft("cursor", v)}
                />
              </div>
            </SettingsSection>

            <Separator className={cn("my-5 bg-white/70")} />

            <SettingsSection
              icon={Settings}
              title="ANSI colors"
              description="Expand the palette only when you need exact per-color control."
            >
              <Button
                type="button"
                variant="ghost"
                onClick={() => setColorsOpen((value) => !value)}
                className={cn(
                  "flex h-auto w-full items-center justify-between rounded-[22px] border border-white/80 bg-white/82 px-4 py-3 text-left shadow-xs hover:bg-white",
                )}
              >
                <span>
                  <span
                    className={cn(
                      "block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]",
                    )}
                  >
                    Extended palette
                  </span>
                  <span className={cn("mt-1 block text-[12px] text-[var(--color-text-secondary)]")}>
                    {colorsOpen ? "Hide ANSI colors" : "Show ANSI colors"}
                  </span>
                </span>
                {colorsOpen ? (
                  <ChevronDown size={16} strokeWidth={1.8} />
                ) : (
                  <ChevronRight size={16} strokeWidth={1.8} />
                )}
              </Button>

              {colorsOpen ? (
                <div className={cn("mt-3 grid grid-cols-2 gap-2")}>
                  {ANSI_LABELS.map(({ key, label }) => (
                    <ColorField
                      key={key}
                      label={label}
                      value={draft[key] as string}
                      onChange={(v) => updateDraft(key, v)}
                      compact
                    />
                  ))}
                </div>
              ) : null}
            </SettingsSection>

            <Separator className={cn("my-5 bg-white/70")} />

            <SettingsSection
              icon={Monitor}
              title="Preview"
              description="Check contrast and typography before applying the theme."
            >
              <div className={cn("rounded-[24px] border border-white/80 bg-white/82 p-2 shadow-xs")}>
                <div
                  className={cn(
                    "overflow-hidden rounded-[18px] border border-black/5 p-4 text-[12px] leading-[1.7] shadow-inner",
                  )}
                  style={{
                    backgroundColor: draft.background,
                    color: draft.foreground,
                    fontFamily: draft.fontFamily,
                    fontSize: `${draft.fontSize}px`,
                  }}
                >
                  <div>
                    <span style={{ color: draft.green }}>airen</span>
                    <span style={{ color: draft.foreground }}>@</span>
                    <span style={{ color: draft.blue }}>grove</span>
                    <span style={{ color: draft.foreground }}> ~/feature-shell $ </span>
                    <span style={{ color: draft.foreground }}>git status</span>
                  </div>
                  <div style={{ color: draft.foreground }}>On branch feat/light-theme-shell</div>
                  <div>
                    <span style={{ color: draft.yellow }}>Changes not staged for commit:</span>
                  </div>
                  <div>
                    <span style={{ color: draft.foreground }}>  modified: </span>
                    <span style={{ color: draft.cyan }}>src/components/terminal/TerminalPanel.tsx</span>
                  </div>
                  <div>
                    <span style={{ color: draft.red }}>hint:</span>
                    <span style={{ color: draft.foreground }}> review before you apply</span>
                  </div>
                </div>
              </div>
            </SettingsSection>
          </div>

          <div className={cn("border-t border-white/70 bg-white/82 px-5 py-4")}>
            <div className={cn("flex items-center gap-3")}>
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                className={cn(
                  "rounded-xl border-white/80 bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]",
                )}
              >
                <RotateCcw size={14} strokeWidth={1.8} />
                Reset
              </Button>
              <Button
                type="button"
                onClick={() => {
                  handleApply().catch(() => {});
                }}
                className={cn("ml-auto rounded-xl px-4")}
              >
                Apply theme
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className={cn("mb-3 flex items-start gap-3")}>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-2xl bg-white/88 text-[var(--color-primary)] shadow-xs",
          )}
        >
          <Icon size={15} strokeWidth={1.8} />
        </div>
        <div className={cn("min-w-0")}>
          <h3 className={cn("text-[13px] font-semibold text-[var(--color-text)]")}>
            {title}
          </h3>
          <p className={cn("mt-1 text-[12px] leading-5 text-[var(--color-text-secondary)]")}>
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ColorField({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[22px] border border-white/80 bg-white/86 shadow-xs",
        {
          "px-3 py-2.5": compact,
          "px-4 py-3": !compact,
        },
      )}
    >
      <label
        className={cn(
          "relative block shrink-0 overflow-hidden rounded-xl border border-black/5 shadow-inner",
          {
            "size-9": compact,
            "size-10": !compact,
          },
        )}
      >
        <span className={cn("sr-only")}>{label}</span>
        <span
          className={cn("absolute inset-0")}
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("absolute inset-0 h-full w-full cursor-pointer opacity-0")}
        />
      </label>
      <div className={cn("min-w-0 flex-1")}>
        <p
          className={cn(
            "truncate font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]",
            {
              "text-[10px]": compact,
              "text-[11px]": !compact,
            },
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "mt-1 truncate font-mono text-[var(--color-text)]",
            {
              "text-[10px]": compact,
              "text-[11px]": !compact,
            },
          )}
        >
          {value.toUpperCase()}
        </p>
      </div>
    </div>
  );
}
