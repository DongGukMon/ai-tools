import { Store } from "./store.js";
import { search, context } from "./search.js";

export interface ToolCallParams { name: string; arguments: Record<string, string>; }

export function getTools() {
  return [
    {
      name: "search",
      description: "Search notes by tag, source path, semantic query, type, or status. Multiple filters are AND-combined.",
      inputSchema: {
        type: "object",
        properties: {
          tag: { type: "string", description: "Filter by tag" },
          source: { type: "string", description: "Filter by source path prefix" },
          query: { type: "string", description: "Semantic similarity search query" },
          type: { type: "string", description: "Filter by type" },
          status: { type: "string", description: "Filter by status" },
          min_score: { type: "string", description: "Minimum similarity score (0-1). Only applies when query is provided." },
          limit: { type: "string", description: "Maximum number of results to return." },
        },
      },
    },
    {
      name: "context",
      description: "BFS graph traversal from notes matching a source path. Returns connected subgraph (up to 3 hops).",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Source path prefix to start traversal" },
          hops: { type: "string", description: "Max traversal depth (default: 3)" },
        },
        required: ["source"],
      },
    },
    {
      name: "list",
      description: "List all notes as summaries (ID, first line, type, tags, status).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get",
      description: "Retrieve a single note by ID with all its relations.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "The note ID (8-char hex)" } },
        required: ["id"],
      },
    },
  ];
}

export async function handleToolCall(store: Store, params: ToolCallParams) {
  const a = params.arguments ?? {};
  try {
    switch (params.name) {
      case "search": return await handleSearch(store, a);
      case "context": return handleContext(store, a);
      case "list": return handleList(store);
      case "get": return handleGet(store, a);
      default: return toolError(`Unknown tool: ${params.name}`);
    }
  } catch (e: any) {
    return toolError(e.message);
  }
}

async function handleSearch(store: Store, a: Record<string, string>) {
  const minScore = a.min_score ? parseFloat(a.min_score) : undefined;
  const limit = a.limit ? parseInt(a.limit, 10) : undefined;
  const results = await search(store, {
    tag: a.tag, source: a.source, query: a.query,
    type: a.type, status: a.status,
    min_score: minScore != null && !isNaN(minScore) ? minScore : undefined,
    limit: limit != null && !isNaN(limit) && limit > 0 ? limit : undefined,
  });
  if (results.length === 0) return toolSuccess("No results found");
  const output = results.map((r) => ({
    ...r.note,
    ...(r.score != null ? { similarity: Math.round(r.score * 1000) / 1000 } : {}),
  }));
  return toolSuccess(JSON.stringify(output, null, 2));
}

function handleContext(store: Store, a: Record<string, string>) {
  if (!a.source) return toolError("source is required");
  const hops = a.hops ? parseInt(a.hops, 10) : 3;
  const results = context(store, a.source, hops > 0 ? hops : 3);
  if (results.length === 0) return toolSuccess("No context found for source: " + a.source);
  return toolSuccess(JSON.stringify(results, null, 2));
}

function handleList(store: Store) {
  const items = store.list();
  if (items.length === 0) return toolSuccess("No notes stored");
  return toolSuccess(JSON.stringify(items, null, 2));
}

function handleGet(store: Store, a: Record<string, string>) {
  if (!a.id) return toolError("id is required");
  return toolSuccess(JSON.stringify(store.get(a.id), null, 2));
}

function toolSuccess(text: string) {
  return { content: [{ type: "text", text }] };
}

function toolError(message: string) {
  return { content: [{ type: "text", text: "Error: " + message }], isError: true };
}
