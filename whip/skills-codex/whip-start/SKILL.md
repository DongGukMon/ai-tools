---
name: whip-start
description: Spawn whip agent sessions to handle tasks. Dispatch a single agent or assemble a small team with explicit backend, scope, and ownership.
user_invocable: true
---

You are the lead. Dispatch work to agent sessions via whip.

## Inputs

- If the user provides a plan file path, read that file first.
- Treat the plan file as the source of truth for task titles, descriptions, difficulty, dependencies, and execution order.
- If the plan file includes an `## Execution` section with `/whip-start <path>` or `$whip-start <path>`, that is an instruction to use this skill with the same file path, not content to send to `whip`.

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
- If `claude-irc inbox` truncates a message, read the full entry before acting.
- Do not assume the user can see `whip-master` IRC traffic. Relay important agent messages back into the main chat yourself.

Poll for messages by running `claude-irc inbox` manually, especially after state-changing commands such as `assign`, `retry`, `approve`, and `resume`.

## Decide Mode

Look at the user's request:
- **Solo agent**: One clear, self-contained piece of work → Solo Flow
- **Agent team**: Work that decomposes into 2+ independent parallel tasks → Team Flow
- **Ambiguous**: Default to solo. Don't over-decompose.

## Choose Backend

Pick the backend before creating tasks, and make it explicit on each task with `--backend`.

- If the user explicitly asks for `claude` or `codex`, use that.
- If the user does not specify a backend, default to `codex` in this skill.
- Always persist the final choice on the task with `--backend`.
- Valid values are `claude` and `codex`.
- Do not mix backends across tightly coupled tasks unless there is a clear reason.

Whip owns the backend-specific prompt, model, effort, and resume behavior. Do not describe raw backend flags in the task description unless the user explicitly asked for that level of detail.

---

## Solo Flow

Dispatch without heavy planning, but define clear scope and acceptance criteria in the description.

```bash
whip create "<title>" --backend <chosen-backend> --difficulty <level> --desc "## Objective
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

Parallelization guardrails:
- If two tasks need to edit the same file, shared interface, or session plumbing, do not parallelize that part.
- Create a single owner task for shared files or contracts first, then make dependent tasks consume the result.
- If a task says "match Task X" or "implement the shared interface", that task is `medium` minimum and usually should wait for the owner task to land.

### Step 2: Create & deploy agents

Create all tasks, set dependencies if needed, then assign independent tasks. Tasks with dependencies will auto-assign when their prerequisites complete.

```bash
whip create "<agent role/title>" --backend <chosen-backend> --difficulty <level> --desc "## Objective
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
- Mirror important decisions, blockers, and review requests into the main user chat. IRC is for agents; the user does not automatically see it.

### Step 4: Handle completion

As agents complete:
- Review their deliverables
- Dependent agents auto-deploy when prerequisites are met
- If a shell died but the task still has a valid session: use `whip resume <id>` or dashboard resume before creating a new session.
- If an agent failed and you want to preserve context/notes/session history: use `whip retry <id>`.
- Use `whip unassign <id>` when you need to kill/reset a live or stuck task before retrying from scratch.

### Step 5: Wrap up

When all agents are done, summarize what was accomplished across the team. Do NOT run `claude-irc quit` — stay connected for future dispatches.

---

## Difficulty Classification

Set `--difficulty` when creating tasks to control the agent's model and reasoning effort. Omit it only when the user's configured backend default is explicitly preferred.

| Level | Whip flag | When to use |
|---------|------------------|----------------------------------------------|
| `hard` | `--difficulty hard` | Complex architecture, multi-file refactors, subtle bugs, security-sensitive work |
| `medium`| `--difficulty medium` | Moderate features, cross-file changes with clear scope, non-trivial but well-defined work |
| `easy` | `--difficulty easy` | Simple/mechanical tasks: config changes, rename, boilerplate, docs, formatting |
| *(omit)* | *(none)* | Only when you intentionally want the configured backend default |

Backend mapping is owned by whip. The same `difficulty` may map to different model/effort settings on Claude vs Codex, so do not hardcode backend CLI flags in this skill.

**Choosing the right level is critical.** An under-leveled task produces subtle bugs that cost more to fix than the savings:

1. **Interface boundaries require `medium` minimum.** If a task must match an API contract, type signature, or protocol defined by another task, it needs higher-reasoning mode. Lower-effort settings may approximate names, paths, or edge cases instead of matching exactly.
   - Bad: `[easy] API client` that must match server endpoints or a shared session contract
   - Good: `[medium] API client` or session integration task — cross-referencing another task's interface needs precision

2. **`easy` is only for tasks with zero ambiguity.** The agent should be able to complete the task by following the description literally, with no judgment calls.
   - Good `easy`: CI/CD workflow YAML, project scaffold from template, rename/move files
   - Bad `easy`: anything that says "match the existing pattern", "implement the interface from Task X", or "touch shared plumbing"

3. **When in doubt, use `medium`.** The cost difference between `easy` and `medium` is small compared to the cost of a bug that requires master intervention or rework.

4. **Reserve `hard` for tasks where correctness is non-obvious.** Multi-file refactors where changes must be consistent, security-sensitive code, complex state machines, subtle concurrency.

---

## Review Flow

For tasks where you want to review changes before the agent commits, use the `--review` flag. This is only available for `medium` and `hard` difficulty tasks.

### How it works

1. **Create with review**: `whip create "title" --backend <chosen-backend> --difficulty medium --review --desc "..."`
2. **Agent works**: The agent's prompt instructs it to NOT commit and to report via `whip status <id> review` when done.
3. **Review**: Check the agent's changes (e.g., via `git diff` in the task's working directory).
4. **Approve**: `whip approve <id>` notifies the agent via IRC to commit and finish the task.
   - Approval does not directly mark the task `completed`; the agent still needs to commit and run `whip status <id> completed --note "..."`
   - In the dashboard, press `A` on a task in `review` status to approve it.

### When to use review

- Tasks that modify shared/critical code paths
- When you want to verify changes before they're committed
- Complex refactors where the output quality matters

### When NOT to use review

- `easy` tasks (simple/mechanical — let them commit directly)
- Tasks with no difficulty set (default flow)
- When speed is more important than review
