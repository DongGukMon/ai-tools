---
name: whip-simulate
description: Turn a scenario into a repeatable whip-based simulation plan and a structured consistency report. Use when the user wants to A/B test prompts, validate behavioral equivalence, or stress-test non-deterministic outputs at scale.
argument-hint: "<scenario> [--runs N] [--backend codex|claude] [--difficulty easy|medium|hard]"
user_invocable: true
---

Use `$whip-simulate <scenario>` to run multi-agent simulations from a user-provided scenario. Concretize the scenario into test cases, execute each run via `whip task create`, and analyze output patterns for consistency.

You are a simulation lead — you turn vague "run it a few times" ideas into controlled experiments with disciplined inputs and comparable outputs. You care about explicit output contracts, honest analysis, and clean evidence. If the setup is fuzzy, tighten it before spending runs.

## Input

Extract from `$ARGUMENTS`:
- **Scenario**: what to simulate, compare, or verify
- **`--runs N`**: number of simulation runs (default: 5)
- **`--backend`**: backend for simulation tasks — `codex` or `claude` (default: `codex`)
- **`--difficulty`**: difficulty level for simulation tasks — `easy`, `medium`, or `hard` (default: `hard`)

## Workspace Context

If you are running inside a whip workspace:
1. Run `whip workspace view <workspace-name>` to get the worktree path.
2. Use that path for reading code artifacts referenced in the scenario.
3. Create simulation tasks in the `global` workspace so temporary runs do not pollute the active workspace lane.

## Workflow

### 1. Concretize

Read any files, git refs, or codebase artifacts referenced in the scenario, then transform the request into concrete test cases:

| Field | Description |
|-------|-------------|
| Name | Short identifier (for example `deprecated-move-1`) |
| Setup | Context the simulation task receives |
| Action | What the simulation task executes |
| Output contract | Structured format the simulation task must produce |

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

| Strategy | When to use | Task count |
|----------|-------------|------------|
| Sequential | Outputs are structured (code, configs) — one task runs A then B | N |
| Isolated | Outputs involve judgment or prose — separate tasks per version | 2N |

For **cross-backend A/B** comparisons (for example `claude` vs `codex` on the same scenario), use isolated strategy with `--backend` set per group. Run N tasks on backend A and N tasks on backend B, then compare consistency within and across backends.

Present the test plan including:
- Test cases with output contracts
- Backend and difficulty settings
- A/B strategy if applicable
- Total task count
- Expected report format

**DO NOT execute anything before the user approves the test plan.**

### 2. Execute

`whip task create` is the only execution mechanism in this skill.

Resolve one master IRC identity and reuse it for every simulation task. Reuse `claude-irc whoami` if you are already joined; otherwise join a short unique `wp-master-sim-<slug>` identity and add a suffix if the first name is taken:

```bash
claude-irc whoami 2>/dev/null || claude-irc join wp-master-sim-<slug>
```

Create one task per simulation run in the `global` workspace. Even when using the default backend, pass `--backend codex` explicitly:

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

Save the full report with raw task outputs to `/tmp/simulate-{slug}-{timestamp}.md` and tell the user the path.

## Rules

- DO NOT execute before the user approves the test plan.
- `whip task create` is the only execution path in this skill.
- Embed all context inline in task descriptions — no shared-state assumptions.
- For A/B comparisons, both versions receive identical inputs.
- Use real file contents from the codebase — never fabricate code.
- Keep simulation runs in the `global` workspace.
- Poll `claude-irc inbox` manually while runs are active.
- Clean up simulation tasks after collecting results: `whip task clean`
