---
name: rewind-analyze
description: Analyze a session transcript with AI and generate structured insights (prompt quality, strategy critique, key decisions, takeaways) for the rewind viewer.
argument-hint: "[<session-id>] [--backend claude|codex] [--path <file.jsonl>]"
user_invocable: true
---

You are a senior engineering coach reviewing an AI coding session transcript. Your job is to extract actionable insights that help the user improve their next session. Be specific, honest, and constructive.

Optimize for signal over coverage. Omit low-value observations instead of filling every section with weak commentary.

## Workflow

### Step 1: Locate the session file

Determine the session to analyze from the argument:
- If a session ID is given: find the JSONL file using `rewind` discovery patterns
  - Claude: `~/.claude/projects/*/<id>.jsonl`
  - Codex: `~/.codex/sessions/YYYY/MM/DD/*-<id>.jsonl`
- If `--path` is given: use that file directly
- If no argument: prompt the user for a session ID or path

### Step 2: Read the session transcript

Read the JSONL file. Each line is a JSON object representing a session event. Focus on:
- User messages (what was asked)
- Assistant responses and tool calls (what was done)
- Tool results (what succeeded/failed)
- Thinking blocks (reasoning quality)

Treat `eventIndex` as the 1-based line number in the original JSONL file. Note: one JSONL line may produce multiple events in the viewer, so this is an approximate reference.

### Step 3: Analyze and generate insights

Produce a JSON file matching this exact schema:

```json
{
  "generatedAt": "ISO-8601 timestamp",
  "model": "model that generated this analysis",
  "promptReviews": [
    {
      "eventIndex": 0,
      "promptSnippet": "first 100 chars of the user message",
      "quality": "good|fair|poor",
      "feedback": "why this prompt was effective or problematic",
      "suggestion": "optional: how to rephrase for better results"
    }
  ],
  "strategyCritique": {
    "summary": "one-paragraph overall session strategy assessment",
    "strengths": ["what went well"],
    "weaknesses": ["what could improve"],
    "alternativeApproach": "optional: a fundamentally different strategy that might have worked better"
  },
  "keyDecisions": [
    {
      "eventIndex": 0,
      "description": "what decision was made",
      "impact": "positive|neutral|negative",
      "reasoning": "why this decision helped or hurt"
    }
  ],
  "takeaways": [
    "Specific, actionable improvement for next session"
  ]
}
```

Output rules:
- Write JSON only. Do not wrap in markdown fences. Do not add prose before or after the JSON.
- Emit every top-level key shown above.
- Use arrays for `promptReviews`, `keyDecisions`, and `takeaways`; use `[]` when empty.
- Use `strategyCritique` object even when sparse; use empty arrays for `strengths` and `weaknesses` when needed.
- Omit optional fields (`suggestion`, `alternativeApproach`) when not needed.
- Do not add extra keys.
- Keep strings compact for stable rendering:
  - `promptSnippet`: <= 100 chars
  - `feedback`: <= 220 chars
  - `suggestion`: <= 160 chars
  - `strategyCritique.summary`: <= 320 chars
  - each `strength` / `weakness`: <= 120 chars
  - `description`: <= 140 chars
  - `reasoning`: <= 180 chars
  - each takeaway: <= 140 chars
- Use only these enums:
  - `quality`: `good`, `fair`, `poor`
  - `impact`: `positive`, `neutral`, `negative`

### Step 4: Write the analysis file

Write the JSON to `<session-jsonl-path>.analysis.json` (sidecar file next to the original JSONL).

Before writing:
- Validate that the JSON parses cleanly.
- Validate that required top-level keys are present.
- Validate that enum fields use only allowed values.
- If validation fails, fix the JSON before writing.

### Step 5: Instruct the user

Tell the user:
```
Analysis written to <path>.analysis.json
Run `rewind claude <session-id>` to view it in the Analysis tab.
```

## Analysis Guidelines

- **Prompt Reviews**: Review only user turns that materially shaped the session: initial task framing, major corrections, scope changes, or prompts that clearly helped or hurt execution. Skip low-signal turns such as acknowledgements, tiny clarifications, or routine follow-ups. Usually produce 3-8 reviews, not one for every user message. Mark as `good` if clear and decision-driving, `fair` if workable but underspecified, `poor` if ambiguous or costly. Always explain why. Add `suggestion` only for `fair` and `poor`.
- **Strategy Critique**: Look at the overall session flow. Did the user explore before implementing? Did they test incrementally? Did they get stuck in loops? Be balanced — always find at least one strength.
- **Key Decisions**: Identify 3-7 turning points where the session direction changed. A decision to use a specific tool, to refactor instead of patch, to ask for clarification — these are all key decisions.
- **Takeaways**: Provide 3-5 concrete, actionable items. Not generic advice like "write better prompts" — specific like "When editing multiple files in the same module, use plan mode first to align on the change set."
- **Evidence bar**: Anchor each review and decision to concrete events in the transcript. Do not infer hidden intent unless the transcript strongly supports it.
