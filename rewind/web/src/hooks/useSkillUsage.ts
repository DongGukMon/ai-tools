import { useMemo } from "react";
import type { TimelineEvent } from "../types";

export interface SkillUsageEntry {
  skillName: string;
  count: number;
  percentage: number;
}

// Match $skill-name at line start or after whitespace — only lowercase + hyphens
// to avoid shell variables like $PATH, $HOME, $SHELL
const SKILL_INVOKE_RE = /(?:^|\s)\$([a-z][a-z0-9-]*)/g;

// Common shell/env vars that are NOT skills
const ENV_VAR_BLOCKLIST = new Set([
  "path", "home", "shell", "user", "lang", "term", "editor",
  "pwd", "oldpwd", "tmpdir", "display", "logname",
]);

export function useSkillUsage(events: TimelineEvent[]): SkillUsageEntry[] {
  return useMemo(() => {
    const counts = new Map<string, number>();

    for (const ev of events) {
      // Claude Code: Skill tool call with structured input
      if (ev.type === "tool_call" && ev.toolName === "Skill" && ev.toolInput) {
        try {
          const input = JSON.parse(ev.toolInput);
          const name = input.skill || "unknown";
          counts.set(name, (counts.get(name) || 0) + 1);
        } catch {
          counts.set("unknown", (counts.get("unknown") || 0) + 1);
        }
        continue;
      }

      // Codex: user message with $skill-name pattern
      if (ev.type === "user") {
        const text = ev.content || ev.summary || "";
        let match;
        SKILL_INVOKE_RE.lastIndex = 0;
        while ((match = SKILL_INVOKE_RE.exec(text)) !== null) {
          const name = match[1];
          if (name.length > 1 && !ENV_VAR_BLOCKLIST.has(name)) {
            counts.set(name, (counts.get(name) || 0) + 1);
          }
        }
      }
    }

    if (counts.size === 0) return [];

    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const max = entries[0][1];

    return entries.map(([skillName, count]) => ({
      skillName,
      count,
      percentage: (count / max) * 100,
    }));
  }, [events]);
}
