# Dashboard-Web Messaging Review — Post Remote Ownership Refactor

**Task**: d580f11b
**Scope**: Marketing/product copy alignment with the new product boundary where whip owns the remote control plane and claude-irc remains the local inter-session messaging layer.

**Reference docs**:
- `whip/CLAUDE.md` — whip owns task orchestration, workspace model, AND remote mode (`whip remote` is the public CLI entrypoint for remote sessions + HTTP dashboard)
- `claude-irc/CLAUDE.md` — "local messaging layer only"; `claude-irc serve` no longer exists; scope is inter-session coordination on the same machine

---

## Finding 1: claude-irc tagline overstates its role

**File**: `whip/dashboard-web/src/content/site.ts:49`

- **Current**: `"A shared bus for agent-to-agent communication."`
- **Problem**: "shared bus" implies infrastructure-level routing, which now lives in whip. The word "bus" frames claude-irc as foundational plumbing, not a focused messaging tool. Repo docs say it's "the local messaging layer only."
- **Recommendation**: `"Inter-session messaging for coordinating AI agents."` — Keeps it concrete, doesn't overstate scope, matches the CLAUDE.md framing of presence + inbox + DM.

## Finding 2: claude-irc description says "same repo" — should be "same machine"

**File**: `whip/dashboard-web/src/content/site.ts:50`

- **Current**: `"Presence, inbox, and direct messaging for multiple AI agent sessions working in the same repo."`
- **Problem**: claude-irc CLAUDE.md says "multiple Claude Code sessions need to coordinate on the same machine." It's not repo-scoped — it's machine-scoped.
- **Recommendation**: `"Presence, inbox, and direct messaging for multiple AI agent sessions on the same machine."` — One word change, factual correction.

## Finding 3: whip description omits remote control plane

**File**: `whip/dashboard-web/src/content/site.ts:40`

- **Current**: `"Task orchestrator for AI agent work. Run single-task work in global, move grouped work through named workspaces, and manage tmux-backed agent sessions."`
- **Problem**: After the refactor, `whip remote` is a first-class capability — remote HTTP dashboard, device auth, tunnel management. The description reads as if whip is purely local CLI orchestration.
- **Recommendation**: `"Task orchestrator for AI agent work. Run single-task work in global, move grouped work through named workspaces, manage agent sessions, and serve a remote dashboard."` — Adds remote without bloating the description.

## Finding 4: ToolsPage subtitle conflates coordination

**File**: `whip/dashboard-web/src/pages/ToolsPage.tsx:31`

- **Current**: `"whip orchestrates. The rest of the stack handles coordination, secrets, remote editing, and input collection — so the run stays smooth."`
- **Problem**: "coordination" implicitly points to claude-irc, but whip now also coordinates (remote control plane, workspace broadcasting). The binary "whip = orchestration, everything else = support" no longer holds cleanly.
- **Recommendation**: `"whip orchestrates the run and the remote surface. The rest of the stack handles messaging, secrets, remote editing, and input collection."` — Gives whip its remote credit; swaps vague "coordination" for precise "messaging."

## Finding 5: Footer tagline is ambiguous

**File**: `whip/dashboard-web/src/components/marketing/MarketingShell.tsx:133`

- **Current**: `"Orchestration, coordination, secrets, forms, and remote editing for AI agent work."`
- **Problem**: Same "coordination" ambiguity. The footer is the one-liner that sticks.
- **Recommendation**: `"Orchestration, messaging, secrets, forms, and remote editing for AI agent work."` — "messaging" is more precise than "coordination" for what claude-irc actually does.

## Finding 6: WorkflowPage attributes routing to claude-irc

**File**: `whip/dashboard-web/src/pages/WorkflowPage.tsx:296`

- **Current**: `"ℹ claude-irc routing active"`
- **Problem**: After the refactor, whip owns the routing/dispatch. Attributing routing to claude-irc directly contradicts the new ownership boundary.
- **Recommendation**: `"ℹ IRC routing active"` or `"ℹ agent messaging active"` — Removes the false attribution without requiring explanation.

## Finding 7: WorkflowPage dispatch copy understates whip's role

**File**: `whip/dashboard-web/src/pages/WorkflowPage.tsx:274-277`

- **Current**: `"Each companion agent owns a lane. They coordinate through IRC, report progress, and surface review points — without flooding your terminal."`
- **Problem**: Makes it sound like IRC is the coordination brain. In the new model, whip manages coordination; agents use claude-irc as message transport.
- **Recommendation**: `"Each companion agent owns a lane. whip routes their progress through IRC and surfaces review points — without flooding your terminal."` — Credit the orchestrator for the coordination it now owns.

Also applies to SEO step data at line 514:
- **Current**: `"Each agent owns a lane, coordinates through IRC, and surfaces review points."`
- **Recommendation**: `"Each agent owns a lane. whip coordinates them through IRC and surfaces review points."`

## Finding 8: No mention of remote mode anywhere in marketing

**Files**: All marketing pages (LandingPage, ToolsPage, WorkflowPage)

- **Problem**: `whip remote` is a headline-worthy capability — HTTP dashboard, device auth, remote access — but the entire marketing site treats whip as local-only. The "Lead surface" section (LandingPage.tsx:89-97) talks about the dashboard but never mentions you can access it remotely.
- **Recommendation**: This is a bigger copy change. Options:
  1. **Minimum**: Add a line to the "Lead surface" section: something like "Access the dashboard locally or from any device with `whip remote`."
  2. **Medium**: Add a "Remote" tab or section to the WorkModeShowcase alongside Global/Workspace.
  3. **Full**: Add a 6th step to the WorkflowPage — "06 — Remote" — showing the remote access flow.

  At minimum, option 1 should happen. The feature exists and the docs describe it; the site should too.

---

## Summary of product relationship language

The site currently tells this story:
> **whip** = task orchestrator. **claude-irc** = coordination bus. They're peers.

After the refactor, the story should be:
> **whip** = task orchestrator + remote control plane. **claude-irc** = local inter-session messaging. whip is the system; claude-irc is one transport it uses.

The site doesn't need to demote claude-irc — it's still a standalone tool with its own install. But the copy should stop using "coordination" and "bus" language that implies claude-irc does what whip now owns.
