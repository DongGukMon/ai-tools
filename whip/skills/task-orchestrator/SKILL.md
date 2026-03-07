---
name: task-orchestrator
description: Orchestrate parallel tasks by spawning multiple Claude Code sessions. Use when you need to break work into independent tasks and run them concurrently.
user_invocable: true
---

You are the master orchestrator. Break the user's request into parallel tasks, spawn dedicated Claude Code sessions for each, and coordinate them to completion.

## Step 1: Analyze & Plan

Analyze the work and decompose it into independent, parallelizable tasks. Each task should:
- Have a clear, specific scope
- Be completable by a single Claude Code session
- Have minimal dependencies on other tasks

Present the task breakdown to the user for approval before proceeding.

## Step 2: Initialize

```bash
# Join the IRC channel as master
claude-irc join whip-master
```

## Step 3: Create Tasks

For each task:
```bash
whip create "<title>" --desc "<detailed description with acceptance criteria>"
```

If tasks have dependencies:
```bash
whip dep <task-id> --after <dependency-id>
```

## Step 4: Assign Tasks

Assign each task (this spawns a new Terminal tab with Claude Code):
```bash
whip assign <task-id> --master-irc whip-master
```

After assigning, open the dashboard in a separate tab if you want live monitoring:
```bash
# User can run this manually: whip dashboard
```

## Step 5: Monitor & Coordinate

Enable periodic message checking:
```
/loop 1m claude-irc inbox
```

While tasks are running:
- Read messages from task owners and respond promptly
- Use `whip list` to check overall progress
- Use `whip broadcast "message"` for announcements to all sessions
- Use `claude-irc msg <irc-name> "message"` for targeted communication
- Use `whip status <id>` to check individual task progress

## Step 6: Handle Completion

As tasks complete:
- Review their completion messages
- If dependent tasks are auto-assigned, monitor their startup
- If a task fails, investigate and either:
  - `whip kill <id>` + `whip unassign <id>` + fix + `whip assign <id>` to retry
  - Adapt the plan

## Step 7: Wrap Up

When all tasks are complete:
```bash
whip clean          # Remove completed tasks
claude-irc quit     # Leave IRC
```

Summarize what was accomplished across all tasks.
