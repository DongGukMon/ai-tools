import type { Note, NoteWithRelations, SearchParams, SearchResult, Relation } from "./types.js";
import { Store } from "./store.js";
import { computeEmbedding } from "./embedder.js";

export async function search(store: Store, params: SearchParams): Promise<SearchResult[]> {
  const tags = store.tagsIndex();
  const sources = store.sourcesIndex();

  // Collect candidate sets from index lookups
  const candidateSets: Set<string>[] = [];

  if (params.tag) {
    candidateSets.push(new Set(tags[params.tag] ?? []));
  }

  if (params.source) {
    const set = new Set<string>();
    for (const [key, ids] of Object.entries(sources)) {
      if (key.startsWith(params.source)) {
        for (const id of ids) set.add(id);
      }
    }
    candidateSets.push(set);
  }

  // Intersect sets
  let candidateIDs: Set<string> | null = null;
  if (candidateSets.length > 0) {
    candidateIDs = candidateSets[0];
    for (let i = 1; i < candidateSets.length; i++) {
      const intersected = new Set<string>();
      for (const id of candidateIDs) {
        if (candidateSets[i].has(id)) intersected.add(id);
      }
      candidateIDs = intersected;
    }
  }

  // Load candidates
  let candidates: Note[];
  if (candidateIDs) {
    candidates = [];
    for (const id of candidateIDs) {
      try { candidates.push(store.get(id)); } catch { /* skip */ }
    }
  } else {
    candidates = store.list().map((s) => {
      try { return store.get(s.id); } catch { return null; }
    }).filter((n): n is Note => n !== null);
  }

  // Post-filter by status
  if (params.status) {
    candidates = candidates.filter((n) => n.status === params.status);
  }

  // Rank by semantic similarity
  if (params.query) {
    const queryEmb = await computeEmbedding(params.query);
    const allEmbs = store.allEmbeddings();

    const scored: SearchResult[] = [];
    for (const note of candidates) {
      const emb = allEmbs[note.id];
      const score = emb ? cosineSimilarity(queryEmb, emb) : 0;
      scored.push({ note, score });
    }

    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    // Apply min_score filter
    let results: SearchResult[] = scored;
    if (params.min_score != null) {
      results = results.filter((r) => (r.score ?? 0) >= params.min_score!);
    }

    // Apply limit
    if (params.limit != null && params.limit > 0) {
      return results.slice(0, params.limit);
    }

    return results;
  }

  let results = candidates.map((note) => ({ note }));
  if (params.limit != null && params.limit > 0) {
    return results.slice(0, params.limit);
  }
  return results;
}

export function context(store: Store, source: string, maxHops = 3): NoteWithRelations[] {
  const sources = store.sourcesIndex();
  const graph = store.graphIndex();

  // Find seed note IDs matching source prefix
  const seeds = new Set<string>();
  for (const [key, ids] of Object.entries(sources)) {
    if (key.startsWith(source)) {
      for (const id of ids) seeds.add(id);
    }
  }

  if (seeds.size === 0) return [];

  // BFS traversal
  const visited = new Set<string>();
  const queue: string[] = [];
  const depth = new Map<string, number>();

  for (const id of seeds) {
    queue.push(id);
    depth.set(id, 0);
    visited.add(id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depth.get(current)!;
    if (currentDepth >= maxHops) continue;

    // Follow outgoing edges
    for (const edge of graph[current] ?? []) {
      if (!visited.has(edge.target_id)) {
        visited.add(edge.target_id);
        depth.set(edge.target_id, currentDepth + 1);
        queue.push(edge.target_id);
      }
    }

    // Follow incoming edges
    for (const [nid, edges] of Object.entries(graph)) {
      for (const edge of edges) {
        if (edge.target_id === current && !visited.has(nid)) {
          visited.add(nid);
          depth.set(nid, currentDepth + 1);
          queue.push(nid);
        }
      }
    }
  }

  // Load notes with relation metadata
  const results: NoteWithRelations[] = [];
  for (const id of visited) {
    try {
      const note = store.get(id);
      const incoming: Relation[] = [];

      for (const [nid, edges] of Object.entries(graph)) {
        if (nid === id) continue;
        for (const edge of edges) {
          if (edge.target_id === id) {
            incoming.push({ target_id: nid, type: edge.type });
          }
        }
      }

      results.push({ note, incoming: incoming.length > 0 ? incoming : undefined });
    } catch { /* skip */ }
  }

  return results;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
