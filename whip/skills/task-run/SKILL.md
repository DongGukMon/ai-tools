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

Dispatch immediately. No planning phase.

```bash
whip create "<title>" --desc "<detailed description with full context>"
whip assign <task-id> --master-irc whip-master
```

Wait for completion. Do NOT run `claude-irc quit` — stay connected for future dispatches.

---

## Team Flow

### Step 1: Assemble the team

Define each agent's role and scope. Each agent should:
- Have a clear, specific responsibility
- Be able to work independently
- Have minimal dependencies on other agents

Minimize analysis in the main session — include enough context in descriptions for agents to self-orient. Present the team composition to the user before proceeding.

### Step 2: Create & deploy agents

Create all tasks, set dependencies if needed, then deploy all at once:
```bash
whip create "<agent role/title>" --desc "<responsibility, context, acceptance criteria>"
whip dep <task-id> --after <dependency-id>  # only if needed
whip assign <task-id> --master-irc whip-master
```

### Step 3: Coordinate

As team lead:
- Respond to agent messages promptly
- Use `whip list` to monitor overall progress
- Use `whip broadcast "message"` for team-wide announcements
- Use `claude-irc msg <irc-name> "message"` for direct communication with specific agents
- Relay information between agents when they need context from each other

### Step 4: Handle completion

As agents complete:
- Review their deliverables
- Dependent agents auto-deploy when prerequisites are met
- If an agent fails: `whip kill <id>` + `whip unassign <id>` + fix + `whip assign <id>`

### Step 5: Wrap up

When all agents are done, summarize what was accomplished across the team. Do NOT run `claude-irc quit` — stay connected for future dispatches.
