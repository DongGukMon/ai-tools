---
name: whip-plan
description: Analyze work, design task dependency graph, and get user approval before execution. Use when starting a multi-task project that needs planning.
user_invocable: true
---

You are a technical lead planning a multi-agent project. Your job is to analyze the work, decompose it into tasks with a dependency graph, and get user approval — then hand off to `/whip-start` for execution.

## Step 1: Enter Plan Mode

Start by entering plan mode. This keeps focus on analysis and design without accidentally modifying code.

```
Use the EnterPlanMode tool to switch to planning mode.
```

Plan mode allows read-only exploration (Read, Glob, Grep, Explore agents, Bash for inspection commands) but prevents file modifications — which is exactly what we want during planning.

## Step 2: Understand the request

Read the user's request carefully. If it's vague, ask clarifying questions before proceeding. You need enough context to make architectural decisions.

## Step 3: Explore the codebase

Use the Explore agent, Glob, Grep, Read, and Bash (for `whip list`, build checks, etc.) to understand:
- Existing code structure, patterns, and conventions
- Files and modules that will be affected
- Interfaces between components
- Test patterns in use
- Current whip task state (anything already in progress?)

Spend enough time here to make informed decisions. Bad planning from insufficient context wastes more time than thorough exploration.

## Step 4: Design the task graph

Decompose the work into tasks following these principles:

### Task boundaries
- **File-level ownership**: Each task owns specific files. No two tasks modify the same file.
- **Interface-first**: Tasks that define interfaces/APIs come before tasks that consume them.
- **Minimal dependencies**: Flatten the graph — prefer wide parallelism over deep chains.
- **Target 2-3 rounds max**: More rounds = less parallelism benefit.

### Dependency graph design
- **Round 1**: Foundation tasks with no dependencies (scaffolds, core APIs, shared types)
- **Round 2**: Tasks that consume Round 1 outputs (clients, integrations, features using the API)
- **Round 3**: Tasks that need Round 2 (UI pages consuming clients, CLI wiring everything together)

### Task sizing
- Each task should be completable by a single agent in one session
- Too small = overhead of coordination exceeds the work
- Too large = agent loses focus or hits context limits
- Sweet spot: 1-3 files, clear scope, 1 well-defined deliverable

### Difficulty assignment

| Level | Model | When to use |
|---------|-------|----------------------------------------------|
| `hard` | Opus (high effort) | Complex architecture, multi-file refactors, subtle bugs, security-sensitive work |
| `medium`| Opus (medium effort) | Moderate features, cross-file changes with clear scope, interface implementation |
| `easy` | Sonnet | Truly mechanical: config files, boilerplate scaffolds, copy-paste patterns, docs |

**Choosing the right level is critical.** An under-leveled task produces subtle bugs that cost more to fix than the savings. Apply these rules:

1. **Interface boundaries require `medium` minimum.** If a task must match an API contract, type signature, or protocol defined elsewhere, it needs Opus-level reasoning. Sonnet may approximate names/paths instead of matching exactly.
   - Bad: `[easy] API client` that must match server endpoints → path mismatches, wrong field names
   - Good: `[medium] API client` — cross-referencing another task's interface needs precision

2. **`easy` is only for tasks with zero ambiguity.** The agent should be able to complete the task by following the description literally, with no judgment calls.
   - Good `easy`: CI/CD workflow YAML, project scaffold from template, rename/move files
   - Bad `easy`: anything that says "match the existing pattern" or "implement the interface from Task X"

3. **When in doubt, use `medium`.** The cost difference between `easy` and `medium` is small compared to the cost of a bug that requires master intervention or rework.

4. **Reserve `hard` for tasks where correctness is non-obvious.** Multi-file refactors where changes must be consistent, security-sensitive code, complex state machines, subtle concurrency.

## Step 5: Present the plan

Present a clear, structured plan to the user:

```
## Plan: <project title>

### Task Graph

Round 1 (parallel):
- [easy] Task A: <title> — <1-line scope>
- [medium] Task B: <title> — <1-line scope>

Round 2 (after Round 1):
- [medium] Task C: <title> — <1-line scope> (depends on: A, B)
- [easy] Task D: <title> — <1-line scope> (depends on: A)

Round 3 (after Round 2):
- [medium] Task E: <title> — <1-line scope> (depends on: C)

### Dependency Diagram

A ──┬──→ C ──→ E
B ──┘
A ──→ D

### Key Design Decisions
- <why you split things this way>
- <interface contracts between tasks>
- <potential risks or trade-offs>
```

## Step 6: Iterate with user

The user may:
- **Approve** → Proceed to save and hand off
- **Request changes** → Adjust the plan and re-present
- **Ask questions** → Explain your reasoning

Do NOT proceed until the user explicitly approves.

## Step 7: Exit plan mode and write plan file

Once the user approves:

1. **Exit plan mode** using the ExitPlanMode tool.

2. **Based on the approved plan, write a plan file** to `~/.claude/plans/<slug>.md`. The slug should be descriptive (e.g., `irc-serve-and-web-dashboard`).

The plan file takes the high-level graph from plan mode and fleshes it out into concrete, agent-ready task specifications. Use the codebase knowledge gathered during exploration (Step 3) to fill in exact file paths, function signatures, API shapes, and existing code references. Each task must include enough detail for an agent to work independently — the agent won't have any of the planning context.

```markdown
# <Project Title>

## Tasks

### Task 1: <title>
- **Difficulty**: easy | medium | hard
- **Depends on**: (none) | Task 2, Task 3
- **Scope**:
  - In: <files to create/modify>
  - Out: <files NOT to touch>
- **Description**:

  ## Objective
  <what needs to be done — be specific>

  ## Implementation Details
  <concrete guidance: function signatures, struct shapes, API paths, routing patterns>
  <reference existing code: "See store.go:CheckAllPresence() for the method signature">

  ## Acceptance Criteria
  - <specific, verifiable condition>
  - <specific, verifiable condition>

### Task 2: <title>
...
```

**What makes a good task description:**
- File paths and function names, not vague references
- Exact API shapes (request/response JSON, endpoint paths, headers)
- Existing code references with file:line pointers
- Explicit "Out of scope" to prevent agents from wandering

3. **Tell the user**:

```
Plan file saved to ~/.claude/plans/<slug>.md
Run `/whip-start <path>` to execute.
```
