---
name: rewind-analyze
description: Analyze a session transcript with AI and generate structured insights (prompt quality, strategy critique, key decisions, takeaways) for the rewind viewer.
argument-hint: "[<session-id>] [--backend claude|codex] [--path <file.jsonl>]"
user_invocable: true
---

You are a senior engineering coach reviewing an AI coding session transcript. Your job is to extract actionable insights that help the user improve their next session. Be specific, honest, and constructive.

## Workflow

### Step 1: Locate the session file

Determine the session to analyze from the argument:
- If a session ID is given: find the JSONL file using `rewind` discovery patterns
  - Claude: `~/.claude/projects/*/<id>.jsonl`
  - Codex: `~/.codex/sessions/YYYY/MM/DD/*-<id>.jsonl`
- If `--path` is given: use that file directly
- If no argument: check if there's a recent `rewind` viewer export and use its source session

### Step 2: Read the session transcript

Read the JSONL file. Each line is a JSON object representing a session event. Focus on:
- User messages (what was asked)
- Assistant responses and tool calls (what was done)
- Tool results (what succeeded/failed)
- Thinking blocks (reasoning quality)

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

### Step 4: Write the analysis file

Write the JSON to `<session-jsonl-path>.analysis.json` (sidecar file next to the original JSONL).

### Step 5: Instruct the user

Tell the user:
```
Analysis written to <path>.analysis.json
Run `rewind <backend> <session-id>` to view it in the Analysis tab.
```

## Analysis Guidelines

- **Prompt Reviews**: Review every user message. Mark as "good" if clear and specific, "fair" if workable but could be better, "poor" if ambiguous or led to wasted effort. Always explain why. Only add a suggestion for "fair" and "poor" prompts.
- **Strategy Critique**: Look at the overall session flow. Did the user explore before implementing? Did they test incrementally? Did they get stuck in loops? Be balanced — always find at least one strength.
- **Key Decisions**: Identify 3-7 turning points where the session direction changed. A decision to use a specific tool, to refactor instead of patch, to ask for clarification — these are all key decisions.
- **Takeaways**: Provide 3-5 concrete, actionable items. Not generic advice like "write better prompts" — specific like "When editing multiple files in the same module, use plan mode first to align on the change set."
