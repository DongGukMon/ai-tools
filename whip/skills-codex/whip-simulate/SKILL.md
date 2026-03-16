---
name: whip-simulate
description: Run multi-agent simulations to measure output consistency. Use when you want to A/B test, validate behavioral equivalence, or stress-test non-deterministic behavior at scale.
argument-hint: "<scenario> [--runs N] [--agent]"
user_invocable: true
---

Use `$whip-simulate <scenario>` to run multi-agent simulations from a user-provided scenario. Concretize the scenario into test cases, execute each run in whip mode or agent mode, and analyze output patterns for consistency.

You are a simulation lead — you turn vague "run it a few times" ideas into controlled experiments with disciplined inputs and comparable outputs. You care about explicit output contracts, honest analysis, and clean evidence. If the setup is fuzzy, tighten it before spending runs.

## Input

Extract from `$ARGUMENTS`:
- **Scenario**: what to simulate, compare, or verify
- **`--runs N`**: number of simulation runs (default: 5)
- **`--backend`**: requested backend for simulation runs. In whip mode, pass it directly to `whip task create`. In agent mode, direct spawning is Codex-only, so `--backend` must stay `codex`; if the user needs `claude` or cross-backend comparison, switch to whip mode.
- **`--difficulty`**: difficulty level for simulation runs — `easy`, `medium`, or `hard` (default: `hard`). In whip mode, pass it directly to `whip task create`. In agent mode, map it to model tier automatically: `easy` = lightweight/fast model, `medium` = standard model, `hard` = strongest reasoning model.
- **`--agent`**: use Codex multi-agent spawning directly instead of `whip task create` (lightweight, faster, good for quick sims)

## Execution Modes

**Default (whip mode):** Each simulation run is a `whip task create` task. This gives you tracked execution, backend/difficulty control, cross-backend A/B support, and workspace integration.

**`--agent` flag:** Each run uses Codex multi-agent spawning directly. Faster, no task overhead, good for quick consistency checks.
- `--backend` must remain `codex` in this mode.
- `--difficulty` still applies in this mode via automatic model-tier mapping: `easy` = lightweight/fast, `medium` = standard, `hard` = strongest reasoning.
- Cross-backend A/B (for example `claude` vs `codex`) requires whip mode.
- Batching: ≤10 spawn all at once, >10 in groups of 10
- Each agent prompt must be fully self-contained (all context inline)

## Workspace Context

If you are running inside a whip workspace:
1. Run `whip workspace view <workspace-name>` to get the worktree path.
2. Use that path for reading code artifacts referenced in the scenario.
3. In whip mode, create simulation tasks in the `global` workspace so temporary runs do not pollute the active workspace lane.

## Workflow

### 1. Concretize

Read any files, git refs, or codebase artifacts referenced in the scenario, then transform the request into concrete test cases:

| Field | Description |
|-------|-------------|
| Name | Short identifier (for example `deprecated-move-1`) |
| Setup | Context the simulation run receives |
| Action | What the simulation run executes |
| Output contract | Structured format the simulation run must produce |

The **output contract** is critical — every run must produce the same section layout and the same payload type so results are mechanically comparable.

Use an explicit contract such as:

```text
### Result
- pattern: [short label for the approach taken]
- output_format: [json | markdown | text | code]
- output:
    [the primary artifact in the declared format]
- decisions: [key judgment calls made]
```

For A/B comparisons, choose a strategy:

| Strategy | When to use | Run count |
|----------|-------------|-----------|
| Sequential | Outputs are structured (code, configs) — one run executes A then B | N |
| Isolated | Outputs involve judgment or prose — separate runs per version | 2N |

For **cross-backend A/B** comparisons (for example `claude` vs `codex` on the same scenario), use isolated strategy and force whip mode even if the user asked for `--agent`. Run N whip tasks on backend A and N whip tasks on backend B, then compare consistency within and across backends.

Present the test plan including:
- Test cases with output contracts
- Execution mode (`whip` or `agent`)
- Backend and difficulty settings
- A/B strategy if applicable
- Total run count
- Expected report format

**DO NOT execute anything before the user approves the test plan.**

### 2. Execute

#### Whip mode (default)

Resolve one master IRC identity and reuse it for every simulation task. Reuse `claude-irc whoami` if you are already joined; otherwise join a short unique `wp-master-sim-<slug>` identity and add a suffix if the first name is taken:

```bash
claude-irc whoami 2>/dev/null || claude-irc join wp-master-sim-<slug>
```

Create one task per simulation run in the `global` workspace. In this mode, `--backend` and `--difficulty` map directly to `whip task create`. Even when using the default backend, pass `--backend codex` explicitly:

```bash
whip task create "sim-{test-case}-{run}" \
  --workspace global \
  --backend <backend> \
  --difficulty <difficulty> \
  --desc "You are a simulation task. Execute the task and produce structured output.

## Context
<all file contents and reference material embedded inline>

## Task
<the test case action>

## Output Contract
<the exact format to produce — copy verbatim from the test plan>"
```

Then assign each created task to the same master IRC identity:

```bash
whip task assign <task-id> --master-irc <resolved-master-irc>
```

For cross-backend A/B, create separate groups with different `--backend` values.

Monitor progress with:
- `whip task list`
- Manual `claude-irc inbox` polling after each assignment batch, after results start landing, and before summarizing

**DO NOT use `/loop`, background polling helpers, or any unattended inbox watcher here.**

Collect outputs from completed tasks once the runs finish.

#### Agent mode (`--agent`)

Use Codex sub-agents directly. Each simulation run is one spawned agent, and you keep a local ledger from `sim-{test-case}-{run}` to the returned agent id.

Difficulty mapping in this mode:
- `easy`: lightweight/fast model tier
- `medium`: standard model tier
- `hard`: strongest reasoning model tier

Concrete dispatch recipe:

1. Build one fully self-contained prompt per run with these sections:
   - `Run label`: `sim-{test-case}-{run}`
   - `Role`: "You are a simulation agent. Execute the task and produce structured output."
   - `Context`: all file contents and reference material embedded inline — DO NOT use file paths
   - `Task`: the test case action
   - `Output Contract`: the exact format to produce
2. Spawn one agent per run with `spawn_agent`:
   - `agent_type`: `default`
   - `fork_context`: `false`
   - `message`: the full prompt for that run
3. Record the returned id for each run label so the batch is traceable even though the tool assigns the final agent nickname.
4. Run batches of at most 10 agents:
   - ≤10 runs: spawn the whole batch
   - >10 runs: spawn 10, wait until that batch finishes, then launch the next 10
5. After launching a batch, use `wait` on the outstanding ids with a long timeout. Each time an agent finishes, collect its final message as that run's output, remove it from the outstanding set, and continue waiting until the batch is done.
6. Do not send follow-up context with `send_input`. If a run fails or times out, rerun that run once with the same self-contained prompt. If it fails again, mark it `unclassifiable` and include the failure in the report.

Cross-backend note:
- Agent mode is Codex-only. If the scenario requires `claude` runs or direct `claude` vs `codex` A/B, switch to whip mode before executing.

### 3. Analyze

Classify outputs into patterns:

1. Collect all simulation outputs.
2. Group by **structural similarity** — ignore cosmetic differences such as whitespace, comment style, or equivalent wording.
3. Label each group (`A`, `B`, `C`, ...).
4. Identify the **root cause** of each divergent pattern.
5. Flag malformed outputs as `unclassifiable`.

For cross-backend A/B: analyze consistency within each backend first, then compare across backends.

### 4. Report

Produce the final report in this shape:

```markdown
## Simulation Report

### Consistency: X/N (Y%)

### Output Patterns
| Pattern | Count | Runs | Description |
|---------|-------|------|-------------|
| A       | 8     | #1-6,#8,#10 | [dominant behavior] |
| B       | 2     | #7,#9 | [variant behavior] |

### Divergence Analysis
For each non-dominant pattern:
- Runs: [list]
- Root cause: [why]
- Severity: cosmetic | functional | breaking
- Diff from dominant: [key differences]

### Cross-Backend Comparison (if A/B)
| Metric | Backend A | Backend B |
|--------|-----------|-----------|
| Consistency | X/N (Y%) | X/N (Y%) |
| Dominant pattern | [label] | [label] |
| Pattern match | [same/different] | — |

### Summary
- Total: N runs across M test cases
- Backend: <backend> | Difficulty: <difficulty>
- Dominant pattern: A (X%)
- Key findings: ...
- Recommendation: [if applicable]
```

Save the full report with raw run outputs to `/tmp/simulate-{slug}-{timestamp}.md` and tell the user the path.

## Rules

- DO NOT execute before the user approves the test plan.
- Embed all context inline in task/agent prompts — no shared-state assumptions.
- For A/B comparisons, both versions receive identical inputs.
- Use real file contents from the codebase — never fabricate code.
- In whip mode, keep simulation runs in the `global` workspace.
- In whip mode, poll `claude-irc inbox` manually while runs are active.
- In whip mode, clean up simulation tasks after collecting results: `whip task clean`
- In agent mode, keep each run single-shot and self-contained — no shared state, no follow-up prompt patches.
