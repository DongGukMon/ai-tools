---
name: whip-simulate
description: Run multi-agent simulations to measure consistency of non-deterministic behavior. Use when the user wants to A/B test, validate behavioral equivalence, or stress-test outputs at scale.
argument-hint: "<scenario> [--runs N]"
user_invocable: true
---

Run multi-agent simulations from a user-provided scenario. Concretize the scenario into test cases, spawn agents via `whip task create`, and analyze output patterns for consistency.

## Input

Extract from `$ARGUMENTS`:
- **Scenario**: what to simulate, compare, or verify
- **`--runs N`**: number of simulation runs (default: 5)
- **`--backend`**: backend for simulation agents — `claude` or `codex` (default: `codex`)
- **`--difficulty`**: difficulty level for simulation agents — `easy`, `medium`, or `hard` (default: `hard`)
- **`--agent`**: use Agent tool directly instead of `whip task create` (lightweight, faster, good for quick sims)

## Execution Modes

**Default (whip mode):** Each simulation run is a `whip task create` task. Gives you tracked execution, backend/difficulty control, and workspace integration.

**`--agent` flag:** Each run uses the Agent tool directly. Faster, no task overhead, good for quick consistency checks.
- Use `model: sonnet` unless the scenario requires higher reasoning
- Batching: ≤10 spawn all at once with `run_in_background: true`, >10 in groups of 10

## Workspace Context

If you are running inside a whip workspace:
1. Run `whip workspace view <workspace-name>` to get the worktree path
2. Use that path for reading code artifacts referenced in the scenario
3. In whip mode, simulation tasks are created in the `global` workspace (they are ephemeral and should not pollute the active workspace)

## Workflow

### 1. Concretize

Read any files, git refs, or codebase artifacts referenced in the scenario, then transform it into concrete test cases:

| Field | Description |
|-------|-------------|
| Name | Short identifier (e.g., `deprecated-move-1`) |
| Setup | Context the agent receives (file contents, code, instructions) |
| Action | What the agent executes |
| Output contract | Structured format the agent must produce |

The **output contract** is critical — all agents must produce the same structure so results are mechanically comparable:

```
### Result
- pattern: [short label for the approach taken]
- output:
  ```
  [code block, JSON, or other structured output]
  ```
- decisions: [key judgment calls made]
```

For A/B comparisons, choose a strategy:

| Strategy | When to use | Agent count |
|----------|-------------|-------------|
| Sequential | Outputs are structured (code, configs) — one agent runs A then B | N |
| Isolated | Outputs involve judgment or prose — separate agents per version | 2N |

For **cross-backend A/B** comparisons (e.g., claude vs codex on the same scenario), use isolated strategy with `--backend` set per group. Run N agents on backend A and N agents on backend B, then compare consistency within and across backends.

Present the test plan including:
- Test cases with output contracts
- Execution mode (whip or agent)
- Backend and difficulty settings
- A/B strategy if applicable
- Total agent count

**Wait for user approval before executing.**

### 2. Execute

#### Whip mode (default)

Create one task per simulation run:

```bash
whip task create "sim-{test-case}-{run}" \
  --backend <backend> \
  --difficulty <difficulty> \
  --desc "You are a simulation agent. Execute the task and produce structured output.

## Context
<all file contents and reference material embedded inline>

## Task
<the test case action>

## Output Contract
<the exact format to produce — copy verbatim from the test plan>"
```

Then assign all tasks. For cross-backend A/B, create separate groups with different `--backend` values.

Monitor progress with `whip task list`. Collect outputs from completed tasks.

#### Agent mode (`--agent`)

Spawn agents in parallel. Each run is one agent named `sim-{test-case}-{run}`.

Agent prompt structure — every prompt must be **self-contained**:

1. **Role**: "You are a simulation agent. Execute the task and produce structured output."
2. **Context**: All file contents and reference material embedded inline — not file paths
3. **Task**: The test case action
4. **Output contract**: The exact format to produce

Batching:
- ≤ 10 agents: spawn all at once with `run_in_background: true`
- \> 10 agents: groups of 10, next batch after previous completes

Use `model: sonnet` unless the scenario requires higher reasoning.

### 3. Analyze

Classify outputs into patterns:

1. Collect all agent outputs
2. Group by **structural similarity** — ignore cosmetic differences (whitespace, comment style, translation wording)
3. Label each group (A, B, C...)
4. Identify **root cause** of each divergent pattern
5. Flag agents with malformed output as "unclassifiable"

For cross-backend A/B: analyze consistency within each backend first, then compare across backends.

### 4. Report

```
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

Save the full report with raw agent outputs to `/tmp/simulate-{slug}-{timestamp}.md` and tell the user the path.

## Rules

- Never execute before user approves the test plan
- Embed all context inline in agent prompts — no shared state assumptions
- For A/B comparisons, both versions receive identical inputs
- Use real file contents from the codebase — never fabricate code
- In whip mode, use `global` workspace for simulation tasks to avoid polluting active workspaces
- Clean up simulation tasks after collecting results: `whip task clean`
