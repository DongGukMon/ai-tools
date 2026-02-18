import { Store } from "./store.js";
import { extractNewTurns, readCursor, writeCursor, totalLines, buildSessionSummary } from "./collector.js";
import { analyzeSession } from "./analyzer.js";
import { computeEmbedding, routeByEmbedding } from "./embedder.js";
import { appendFileSync, writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync, openSync, closeSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import type { NoteCandidate, Source } from "./types.js";

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
}

const MAX_PASSES = 5;

// --- Logging ---

function createLogger(baseDir: string, debug: boolean) {
  if (!debug) return (_msg: string) => {};
  const logPath = join(baseDir, "hook.log");
  return (msg: string) => {
    const fd = openSync(logPath, "a", 0o600);
    writeFileSync(fd, `${new Date().toISOString()} ${msg}\n`);
    closeSync(fd);
  };
}

// --- Lock ---

function lockPath(baseDir: string): string {
  return join(baseDir, "hook.lock");
}

function acquireLock(baseDir: string): boolean {
  const lp = lockPath(baseDir);
  // Check for existing lock
  if (existsSync(lp)) {
    try {
      const pid = parseInt(readFileSync(lp, "utf-8").trim(), 10);
      process.kill(pid, 0);
      return false; // process alive → locked
    } catch {
      // Process dead → stale lock, remove
      try { unlinkSync(lp); } catch {}
    }
  }
  // Atomic create-or-fail via O_EXCL
  try {
    const fd = openSync(lp, "wx", 0o600);
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    return true;
  } catch {
    return false; // another process won the race
  }
}

function releaseLock(baseDir: string): void {
  try { unlinkSync(lockPath(baseDir)); } catch {}
}

// --- Entry point ---

const isWorker = process.argv.includes("--worker");

if (isWorker) {
  const inputFile = process.argv[process.argv.indexOf("--worker") + 1];
  workerMain(inputFile).catch((err) => {
    console.error("hook worker: unhandled error:", err);
    process.exit(0);
  });
} else {
  launcherMain().catch(() => process.exit(0));
}

// --- Launcher ---

async function launcherMain(): Promise<void> {
  const input = await readStdin();
  if (!input) process.exit(0);

  let hookInput: HookInput;
  try {
    hookInput = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const store = new Store();
  const cfg = store.getConfig();
  const log = createLogger(store.getBaseDir(), cfg.debug);

  const { hook_event_name, session_id } = hookInput;
  log(`launcher: event=${hook_event_name || "unknown"} mode=${cfg.hook_mode} session=${session_id}`);

  // Check hook mode: only run on matching event
  const expectedEvent = cfg.hook_mode === "realtime" ? "Stop" : "SessionEnd";
  if (hook_event_name && hook_event_name !== expectedEvent) {
    log(`launcher: skipping (expected=${expectedEvent})`);
    process.exit(0);
  }

  // Check lock — if another worker is running, skip
  if (existsSync(lockPath(store.getBaseDir()))) {
    try {
      const pid = parseInt(readFileSync(lockPath(store.getBaseDir()), "utf-8").trim(), 10);
      process.kill(pid, 0);
      log(`launcher: another worker running (pid=${pid}), skipping`);
      process.exit(0);
    } catch {
      // stale lock, worker will clean up
    }
  }

  // Save input to temp file
  const tmpDir = join(store.getBaseDir(), "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = join(tmpDir, `hook-input-${Date.now()}.json`);
  writeFileSync(tmpFile, input, { mode: 0o600 });

  // Spawn detached worker
  const scriptPath = new URL(import.meta.url).pathname;
  const child = spawn("node", [scriptPath, "--worker", tmpFile], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();

  log(`launcher: spawned worker pid=${child.pid} input=${tmpFile}`);
  process.exit(0);
}

// --- Worker ---

async function workerMain(inputFile: string): Promise<void> {
  let input: string;
  try {
    input = readFileSync(inputFile, "utf-8");
  } catch {
    return;
  }

  let hookInput: HookInput;
  try {
    hookInput = JSON.parse(input);
  } catch {
    return;
  }

  const { session_id, transcript_path, cwd } = hookInput;
  if (!session_id || !transcript_path) return;

  const store = new Store();
  const cfg = store.getConfig();
  const log = createLogger(store.getBaseDir(), cfg.debug);

  // Acquire lock
  if (!acquireLock(store.getBaseDir())) {
    log(`worker: lock held by another process, exiting`);
    return;
  }

  log(`worker: started session=${session_id}`);

  try {
    let pass = 0;
    while (pass < MAX_PASSES) {
      pass++;
      const cursor = readCursor(store.getBaseDir(), session_id);
      const total = totalLines(transcript_path);

      const newTurns = extractNewTurns(transcript_path, cursor);
      const userAssistantTurns = newTurns.filter((t) => t.role === "user" || t.role === "assistant");

      if (userAssistantTurns.length === 0) {
        writeCursor(store.getBaseDir(), session_id, total);
        log(`worker: pass ${pass} — no new turns, cursor updated to ${total}`);
        break;
      }

      log(`worker: pass ${pass} — ${userAssistantTurns.length} turns to analyze (cursor=${cursor} total=${total})`);

      const sessionSummary = buildSessionSummary(transcript_path, 50);
      const result = await analyzeSession(
        userAssistantTurns,
        sessionSummary,
        cwd,
        cfg.auth_token,
        cfg.api_key,
        cfg.model,
      );

      log(`worker: pass ${pass} — analysis returned ${result.notes.length} notes`);

      for (const candidate of result.notes) {
        await applyCandidate(store, candidate, cfg.embedding_enabled, log);
      }

      writeCursor(store.getBaseDir(), session_id, total);
      log(`worker: pass ${pass} — cursor updated to ${total}`);
    }
  } finally {
    releaseLock(store.getBaseDir());
    try { unlinkSync(inputFile); } catch {}
  }
}

// --- Apply candidate ---

async function applyCandidate(
  store: Store,
  candidate: NoteCandidate,
  embeddingEnabled: boolean,
  log: (msg: string) => void,
): Promise<void> {
  const keywords = candidate.keywords ?? [];

  if (!embeddingEnabled) {
    const id = store.add({
      content: candidate.content,
      keywords,
      tags: candidate.tags,
      sources: candidate.sources,
    });
    log(`added ${id} (embedding disabled)`);
    return;
  }

  // Embed keywords + content: keywords boost term matching, content covers natural language queries
  const embeddingText = keywords.length > 0
    ? keywords.join(" ") + " " + candidate.content
    : candidate.content;
  const embedding = await computeEmbedding(embeddingText);
  const existingEmbeddings = store.activeEmbeddings();
  const decision = routeByEmbedding(embedding, existingEmbeddings);

  switch (decision.action) {
    case "supersede": {
      store.updateStatus(decision.existingId, "superseded");
      const id = store.add({
        content: candidate.content,
        keywords,
        tags: candidate.tags,
        sources: candidate.sources,
        relations: [{ target_id: decision.existingId, type: "supersedes" }],
      });
      store.setEmbedding(id, embedding);
      log(`superseded ${decision.existingId} → ${id} (sim=${decision.similarity.toFixed(3)})`);
      break;
    }
    case "update": {
      const existing = store.get(decision.existingId);
      const mergedKeywords = [...new Set([...(existing.keywords ?? []), ...keywords])];
      const mergedTags = [...new Set([...existing.tags, ...candidate.tags])];
      const mergedSources = mergeSources(existing.sources, candidate.sources);
      store.update(decision.existingId, {
        content: candidate.content,
        keywords: mergedKeywords,
        tags: mergedTags,
        sources: mergedSources,
      });
      store.setEmbedding(decision.existingId, embedding);
      log(`updated ${decision.existingId} (sim=${decision.similarity.toFixed(3)})`);
      break;
    }
    case "add_related": {
      const id = store.add({
        content: candidate.content,
        keywords,
        tags: candidate.tags,
        sources: candidate.sources,
        relations: [{ target_id: decision.existingId, type: "relates_to" }],
      });
      store.setEmbedding(id, embedding);
      log(`added ${id} related to ${decision.existingId} (sim=${decision.similarity.toFixed(3)})`);
      break;
    }
    case "add_independent": {
      const id = store.add({
        content: candidate.content,
        keywords,
        tags: candidate.tags,
        sources: candidate.sources,
      });
      store.setEmbedding(id, embedding);
      log(`added ${id} (independent)`);
      break;
    }
  }
}

// --- Helpers ---

function mergeSources(existing: Source[], incoming: Source[]): Source[] {
  const keys = new Set(existing.map((s) => `${s.project}:${s.path}`));
  const merged = [...existing];
  for (const src of incoming) {
    const key = `${src.project}:${src.path}`;
    if (!keys.has(key)) {
      merged.push(src);
      keys.add(key);
    }
  }
  return merged;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data.trim()));
    setTimeout(() => resolve(data.trim()), 5000);
  });
}
