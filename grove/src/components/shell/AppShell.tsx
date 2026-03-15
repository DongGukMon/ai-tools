import type { PropsWithChildren } from "react";
import { cn } from "../../lib/cn";
import { TitleBar } from "./TitleBar";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div
      className={cn("h-full w-full bg-[var(--color-bg)] p-2.5")}
      style={{
        backgroundImage: [
          "radial-gradient(circle at top left, oklch(0.95 0.06 145 / 0.9) 0%, transparent 32%)",
          "radial-gradient(circle at top right, oklch(0.97 0.05 95 / 0.78) 0%, transparent 24%)",
          "linear-gradient(180deg, oklch(0.995 0.004 145) 0%, oklch(0.97 0 0) 100%)",
        ].join(", "),
      }}
    >
      <div
        className={cn(
          "relative flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-[0_24px_80px_oklch(0.15_0_0_/_0.1)] backdrop-blur-md",
        )}
      >
        <div
          className={cn("pointer-events-none absolute inset-0")}
          style={{
            backgroundImage:
              "linear-gradient(180deg, oklch(1 0 0 / 0.72) 0%, oklch(1 0 0 / 0.38) 100%)",
          }}
        />

        <div className={cn("relative flex h-full min-h-0 flex-col")}>
          <TitleBar />

          <div className={cn("min-h-0 flex-1 p-3")}>
            <div
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[0_18px_48px_oklch(0.15_0_0_/_0.08)]",
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
