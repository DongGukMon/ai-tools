import type { Turn } from "./collector.js";
import type { NoteCandidate, Source } from "./types.js";

// --- Output types ---

export interface AnalysisResult {
  notes: NoteCandidate[];
}

// JSON Schema for structured output
export const analysisSchema = {
  type: "object",
  properties: {
    notes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                project: { type: "string" },
                path: { type: "string" },
              },
              required: ["project", "path"],
            },
          },
        },
        required: ["content", "keywords", "tags", "sources"],
      },
    },
  },
  required: ["notes"],
};

// --- Prompt builder ---

export function buildAnalysisPrompt(
  newTurns: Turn[],
  sessionSummary: string,
  cwd: string,
): string {
  let prompt = `You are a strict knowledge extraction agent for a developer's local knowledge graph.
Analyze the conversation turns below and extract ONLY high-value knowledge worth persisting across sessions.

## What to extract (be highly selective):
- Architectural decisions — technology choices, design patterns, and the reasoning/tradeoffs behind them
- Recurring patterns — code conventions, project idioms, non-obvious rules that someone new would need to know
- Gotchas — surprising behavior, hidden constraints, things that caused debugging pain
- Risks — security concerns, performance bottlenecks, fragile assumptions

## What NOT to extract:
- Todos, tasks, follow-up work, or deferred items — this is a knowledge graph, not a task tracker
- Open questions that haven't been answered yet — only extract the resolved insight
- Step-by-step debugging logs — only extract the root cause and fix, not the investigation process
- Information already obvious from the code itself (function signatures, file structure)
- Session-specific context (current branch, temp file paths, one-time commands)
- Implementation details that are better captured in code comments or commit messages

## Quality bar:
Ask yourself: "Would a developer in a future session waste significant time without this knowledge?"
If the answer is no, do NOT extract it. When in doubt, leave it out.
Prefer fewer, high-quality notes over many low-quality ones.

## Content format:
Write each note as: "[topic] — [concise explanation]"
- Lead with the core subject/concept
- Keep it to 1-2 sentences max
- Use specific technical terms, not vague descriptions
- Bad: "There was an issue with how modules were loaded in the bundled environment"
- Good: "esbuild ESM bundle import() resolution — resolves from caller URL, not bundle location. Use require() via createRequire for correct node_modules resolution"

## Keywords field:
Extract 5-10 search keywords per note. These drive similarity matching, so choose terms a developer would search for:
- Include the core concept, technology names, function/method names, file names
- Include synonyms and related terms someone might search with
- Bad keywords: ["issue", "problem", "fix", "code", "change"]
- Good keywords: ["esbuild", "ESM", "import", "require", "bundle", "module-resolution", "createRequire"]

## Rules:
- Use tags for broad categorization (e.g., "architecture", "auth", "performance")
- Set sources to the relevant file paths discussed (project from cwd basename)
- Do NOT worry about deduplication — that is handled downstream by embeddings

## Working directory: ${cwd}

## Session context (for background):
${sessionSummary}

## New conversation turns to analyze:
`;

  for (const turn of newTurns) {
    prompt += `[${turn.role}] ${turn.text}\n\n`;
  }

  prompt += `
## Instructions:
Return the extracted knowledge. If nothing worth persisting is found, return an empty notes array.
`;

  return prompt;
}

// --- Analyzer ---

export async function analyzeSession(
  newTurns: Turn[],
  sessionSummary: string,
  cwd: string,
  authToken?: string,
  apiKey?: string,
  model?: string,
): Promise<AnalysisResult> {
  // Use require() instead of dynamic import() — esbuild's ESM banner creates
  // a require function bound to the bundle location, which correctly resolves
  // node_modules. Dynamic import() resolves from the caller's URL, which may
  // differ from the bundle location in plugin environments.
  const { query } = require("@anthropic-ai/claude-agent-sdk");

  const prompt = buildAnalysisPrompt(newTurns, sessionSummary, cwd);

  // Strip CLAUDECODE env to avoid nested session error
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.CLAUDECODE;

  // Auth priority: env > config.auth_token > config.api_key
  if (!env.CLAUDE_CODE_OAUTH_TOKEN && !env.ANTHROPIC_API_KEY) {
    if (authToken) {
      env.CLAUDE_CODE_OAUTH_TOKEN = authToken;
    } else if (apiKey) {
      env.ANTHROPIC_API_KEY = apiKey;
    }
  }

  if (!env.CLAUDE_CODE_OAUTH_TOKEN && !env.ANTHROPIC_API_KEY) {
    console.error("analyzer: no auth found. Set via: memex config set auth_token <token>");
    return emptyResult();
  }

  try {
    for await (const message of query({
      prompt,
      options: {
        allowedTools: [],
        // maxTurns must be > 1 — Agent SDK structured output validation
        // consumes additional turns for schema retry.
        maxTurns: 3,
        tools: [],
        model: model ?? "claude-haiku-4-5-20251001",
        effort: "low" as const,
        persistSession: false,
        env,
        outputFormat: {
          type: "json_schema",
          schema: analysisSchema,
        },
      },
    })) {
      const msg = message as any;
      if (msg.type === "result") {
        if (msg.subtype === "success" && msg.structured_output) {
          return validateResult(msg.structured_output);
        }
        if (msg.subtype === "error_max_structured_output_retries") {
          console.error("analyzer: structured output failed after retries");
          return emptyResult();
        }
      }
    }
  } catch (err) {
    console.error("analyzer: query failed:", err);
  }

  return emptyResult();
}

function emptyResult(): AnalysisResult {
  return { notes: [] };
}

function validateResult(output: unknown): AnalysisResult {
  const result = output as AnalysisResult;
  return {
    notes: Array.isArray(result.notes) ? result.notes : [],
  };
}
