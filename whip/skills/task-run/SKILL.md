---
name: task-run
description: Spawn Claude Code sessions to handle tasks. Works for both single tasks and multi-task orchestration.
user_invocable: true
---

Dispatch work to dedicated Claude Code sessions via whip.

## Decide Mode

Look at the user's request and arguments:
- **Single task**: One clear, self-contained piece of work (e.g., "fix the login bug", "add dark mode") → go to Single Task Flow
- **Multi-task**: Work that can be decomposed into 2+ independent parallel tasks → go to Multi-Task Flow
- **Ambiguous**: If unclear, default to single task. Don't over-decompose.

---

## Single Task Flow

Minimal overhead. Create and assign immediately.

```bash
claude-irc join whip-master
whip create "<title>" --desc "<detailed description with context>"
whip assign <task-id> --master-irc whip-master
```

Enable monitoring:
```
/loop 1m claude-irc inbox
```

Wait for completion, then wrap up:
```bash
whip clean
claude-irc quit
```

---

## Multi-Task Flow

### Step 1: Plan

Decompose into independent, parallelizable tasks. Each task should:
- Have a clear, specific scope
- Be completable by a single Claude Code session
- Have minimal dependencies on other tasks

Minimize analysis time in the main session. Delegate investigation to the task sessions — include enough context in the description for them to self-orient.

Present the task breakdown to the user for approval before proceeding.

### Step 2: Initialize

```bash
claude-irc join whip-master
```

### Step 3: Create & Assign Tasks

Create all tasks, set dependencies if needed, then assign all at once:
```bash
whip create "<title>" --desc "<detailed description with acceptance criteria>"
whip dep <task-id> --after <dependency-id>  # only if needed
whip assign <task-id> --master-irc whip-master
```

### Step 4: Monitor & Coordinate

Enable periodic message checking:
```
/loop 1m claude-irc inbox
```

While tasks are running:
- Read messages from task owners and respond promptly
- Use `whip list` to check overall progress
- Use `whip broadcast "message"` for announcements to all sessions
- Use `claude-irc msg <irc-name> "message"` for targeted communication

### Step 5: Handle Completion

As tasks complete:
- Review their completion messages
- If dependent tasks are auto-assigned, monitor their startup
- If a task fails: `whip kill <id>` + `whip unassign <id>` + fix + `whip assign <id>`

### Step 6: Wrap Up

When all tasks are complete:
```bash
whip clean
claude-irc quit
```

Summarize what was accomplished across all tasks.
