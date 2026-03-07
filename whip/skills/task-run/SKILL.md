---
name: task-run
description: Spawn Claude Code agent sessions to handle tasks. Dispatches a single agent or assembles a team for parallel work.
user_invocable: true
---

You are the lead. Dispatch work to agent sessions via whip.

## Step 0: Health check (always run first)

Every invocation starts here — no exceptions. Check live state before doing anything:

```bash
# 1. Ensure IRC is connected
claude-irc join whip-master 2>/dev/null
# If this fails: claude-irc quit 2>/dev/null && claude-irc join whip-master

# 2. Live status — what's running right now?
whip list
claude-irc inbox
```

Review the output before proceeding:
- Are there active/in_progress agents? Note their status.
- Are there unread messages? Read and respond first.
- Are there completed agents with deliverables to review?

If `/loop` for `claude-irc inbox` is not already scheduled, enable it:
```
/loop 1m claude-irc inbox
```

## Decide Mode

Look at the user's request:
- **Solo agent**: One clear, self-contained piece of work → Solo Flow
- **Agent team**: Work that decomposes into 2+ independent parallel tasks → Team Flow
- **Ambiguous**: Default to solo. Don't over-decompose.

---

## Solo Flow

Dispatch without heavy planning, but define clear scope and acceptance criteria in the description.

```bash
whip create "<title>" --desc "## Objective
<what needs to be done>

## Scope
- In: <files/areas to modify>
- Out: <what NOT to touch>

## Acceptance Criteria
- <specific, verifiable condition>
- <specific, verifiable condition>

## Context
<any additional context the agent needs>"
whip assign <task-id> --master-irc whip-master
```

Monitor the agent: review its initial plan when it arrives, respond to questions, and check progress via `whip list`. Do NOT run `claude-irc quit` — stay connected for future dispatches.

---

## Team Flow

### Step 1: Assemble the team

Define each agent's role and scope. Each agent should:
- Have a clear, specific responsibility
- Be able to work independently
- Have minimal dependencies on other agents

Avoid central implementation planning, but do enough scoping to define ownership, interfaces, and acceptance criteria. Include enough context in descriptions for agents to self-orient. Present the team composition to the user before proceeding.

### Step 2: Create & deploy agents

Create all tasks, set dependencies if needed, then assign independent tasks. Tasks with dependencies will auto-assign when their prerequisites complete.

```bash
whip create "<agent role/title>" --difficulty <level> --desc "## Objective
<what needs to be done>

## Scope
- In: <files/areas to modify>
- Out: <what NOT to touch>

## Acceptance Criteria
- <specific, verifiable condition>
- <specific, verifiable condition>

## Context
<any additional context the agent needs>"
whip dep <task-id> --after <dependency-id>  # only if needed
whip assign <task-id> --master-irc whip-master  # only assign tasks without unmet deps
```

### Step 3: Coordinate

As team lead:
- Respond to agent messages promptly — agents escalate user-facing questions to you
- When an agent needs user input, relay the question to the user and pass the answer back
- Use `whip list` to monitor overall progress
- Use `whip broadcast "message"` for team-wide announcements
- Use `claude-irc msg <irc-name> "message"` for direct communication with specific agents
- Relay information between agents when they need context from each other

### Step 4: Handle completion

As agents complete:
- Review their deliverables
- Dependent agents auto-deploy when prerequisites are met
- If an agent fails: `whip unassign <id>` (kills session + resets to created) → fix → `whip assign <id>`

### Step 5: Wrap up

When all agents are done, summarize what was accomplished across the team. Do NOT run `claude-irc quit` — stay connected for future dispatches.

---

## Difficulty Classification

Set `--difficulty` when creating tasks to control the agent's model and reasoning effort. Omit it (or leave empty) to use the user's default Claude Code settings.

| Level | Flag | When to use |
|---------|------------------------------|----------------------------------------------|
| `hard` | `--model claude-opus-4-6 --reasoning-effort high` | Complex architecture, multi-file refactors, subtle bugs, security-sensitive work |
| `medium`| `--model claude-opus-4-6 --reasoning-effort medium` | Moderate features, cross-file changes with clear scope, non-trivial but well-defined work |
| `easy` | `--model claude-sonnet-4-6` | Simple/mechanical tasks: config changes, rename, boilerplate, docs, formatting |
| *(omit)* | *(none — user default)* | When unsure, or when the user's default is preferred |

**Guidelines:**
- Default to omitting difficulty unless you have a clear signal about task complexity
- Prefer `easy` for tasks that are mostly copy-paste or template-driven
- Use `hard` sparingly — it's slower and more expensive
- When assembling a team, mix difficulty levels to optimize cost: not every agent needs `hard`
