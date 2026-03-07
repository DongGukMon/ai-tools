---
name: whip-start
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

**Choosing the right level is critical.** An under-leveled task produces subtle bugs that cost more to fix than the savings:

1. **Interface boundaries require `medium` minimum.** If a task must match an API contract, type signature, or protocol defined by another task, it needs Opus-level reasoning. Sonnet may approximate names/paths instead of matching exactly.
   - Bad: `[easy] API client` that must match server endpoints → path mismatches, wrong field names
   - Good: `[medium] API client` — cross-referencing another task's interface needs precision

2. **`easy` is only for tasks with zero ambiguity.** The agent should be able to complete the task by following the description literally, with no judgment calls.
   - Good `easy`: CI/CD workflow YAML, project scaffold from template, rename/move files
   - Bad `easy`: anything that says "match the existing pattern" or "implement the interface from Task X"

3. **When in doubt, use `medium`.** The cost difference between `easy` and `medium` is small compared to the cost of a bug that requires master intervention or rework.

4. **Reserve `hard` for tasks where correctness is non-obvious.** Multi-file refactors where changes must be consistent, security-sensitive code, complex state machines, subtle concurrency.

---

## Review Flow

For tasks where you want to review changes before the agent commits, use the `--review` flag. This is only available for `medium` and `hard` difficulty tasks.

### How it works

1. **Create with review**: `whip create "title" --difficulty medium --review --desc "..."`
2. **Agent works**: The agent's prompt instructs it to NOT commit and to report via `whip status <id> review` when done.
3. **Review**: Check the agent's changes (e.g., via `git diff` in the task's working directory).
4. **Approve**: `whip approve <id>` transitions the task to `completed` and notifies the agent via IRC to commit.
   - In the dashboard, press `A` on a task in `review` status to approve it.

### When to use review

- Tasks that modify shared/critical code paths
- When you want to verify changes before they're committed
- Complex refactors where the output quality matters

### When NOT to use review

- `easy` tasks (simple/mechanical — let them commit directly)
- Tasks with no difficulty set (default flow)
- When speed is more important than review
