import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Store } from "../store.js";
import { bowEmbedding, routeByEmbedding } from "../embedder.js";
import { SIMILARITY_THRESHOLDS } from "../types.js";

function newTestStore(): Store {
  return new Store(mkdtempSync(join(tmpdir(), "memex-routing-test-")));
}

describe("Embedding-based routing (integration)", () => {
  it("supersedes identical notes", () => {
    const store = newTestStore();
    const content = "Authentication uses JWT with RS256 signing algorithm";
    const id = store.add({ content, tags: ["auth"] });
    store.setEmbedding(id, bowEmbedding(content));

    // Same content should trigger supersede
    const candidateEmb = bowEmbedding(content);
    const decision = routeByEmbedding(candidateEmb, store.allEmbeddings());

    assert.equal(decision.action, "supersede");
    if (decision.action === "supersede") {
      assert.equal(decision.existingId, id);
      assert.ok(decision.similarity >= SIMILARITY_THRESHOLDS.SUPERSEDE);
    }
  });

  it("updates similar notes", () => {
    const store = newTestStore();
    const existing = "gRPC chosen for type safety between services";
    const id = store.add({ content: existing, tags: ["architecture"] });
    store.setEmbedding(id, bowEmbedding(existing));

    // Very similar but with some differences — should trigger update
    const candidate = "gRPC chosen for type safety between microservices and code generation";
    const candidateEmb = bowEmbedding(candidate);
    const decision = routeByEmbedding(candidateEmb, store.allEmbeddings());

    // BoW similarity for similar-but-not-identical text varies — check it's not independent
    assert.ok(
      decision.action === "update" || decision.action === "supersede" || decision.action === "add_related",
      `expected non-independent routing for similar text, got ${decision.action}`,
    );
  });

  it("adds independent for unrelated content", () => {
    const store = newTestStore();
    const existing = "Authentication uses JWT with RS256 signing";
    const id = store.add({ content: existing, tags: ["auth"] });
    store.setEmbedding(id, bowEmbedding(existing));

    // Completely unrelated
    const candidate = "Python virtual environment setup for data analysis pipeline";
    const candidateEmb = bowEmbedding(candidate);
    const decision = routeByEmbedding(candidateEmb, store.allEmbeddings());

    assert.equal(decision.action, "add_independent");
  });

  it("routes correctly with multiple existing notes", () => {
    const store = newTestStore();

    const notes = [
      { content: "Database uses PostgreSQL with connection pooling", tags: ["database"] },
      { content: "Frontend uses React with TypeScript for type safety", tags: ["frontend"] },
      { content: "CI/CD pipeline runs on GitHub Actions", tags: ["devops"] },
    ];

    for (const n of notes) {
      const id = store.add({ content: n.content, tags: n.tags });
      store.setEmbedding(id, bowEmbedding(n.content));
    }

    // Query about database — should match database note
    const dbCandidate = "Database uses PostgreSQL with connection pooling and read replicas";
    const dbEmb = bowEmbedding(dbCandidate);
    const dbDecision = routeByEmbedding(dbEmb, store.allEmbeddings());
    assert.ok(
      dbDecision.action !== "add_independent",
      "database-related candidate should match existing database note",
    );
  });

  it("applies full routing flow: supersede → add with relation", () => {
    const store = newTestStore();

    // Add original note
    const original = "API rate limiting set to 100 requests per minute";
    const origId = store.add({ content: original, tags: ["api"] });
    store.setEmbedding(origId, bowEmbedding(original));

    // Same content → supersede
    const supersedeEmb = bowEmbedding(original);
    const supersedeDecision = routeByEmbedding(supersedeEmb, store.allEmbeddings());
    assert.equal(supersedeDecision.action, "supersede");

    // Apply supersede: mark old as superseded, add new
    if (supersedeDecision.action === "supersede") {
      store.updateStatus(supersedeDecision.existingId, "superseded");
      const newContent = "API rate limiting updated to 200 requests per minute";
      const newId = store.add({
        content: newContent,
        tags: ["api"],
        relations: [{ target_id: supersedeDecision.existingId, type: "supersedes" }],
      });
      store.setEmbedding(newId, bowEmbedding(newContent));

      // Verify
      assert.equal(store.get(origId).status, "superseded");
      assert.equal(store.get(newId).relations[0].type, "supersedes");
      assert.equal(store.get(newId).relations[0].target_id, origId);
    }
  });

  it("handles empty store gracefully", () => {
    const store = newTestStore();
    const candidateEmb = bowEmbedding("any content");
    const decision = routeByEmbedding(candidateEmb, store.allEmbeddings());
    assert.equal(decision.action, "add_independent");
  });

  it("activeEmbeddings prevents duplicate supersession chains", () => {
    const store = newTestStore();

    // Original note
    const content = "MCP server Store caches embeddings in memory and never reloads";
    const origId = store.add({ content, tags: ["bug"] });
    store.setEmbedding(origId, bowEmbedding(content));

    // Simulate supersede: mark original as superseded, add replacement
    store.updateStatus(origId, "superseded");
    const content1 = "MCP server Store caches embeddings in memory — fixed with reload()";
    const emb1 = bowEmbedding(content1);
    const new1Id = store.add({
      content: content1, tags: ["bug"],
      relations: [{ target_id: origId, type: "supersedes" }],
    });
    store.setEmbedding(new1Id, emb1);

    // Next pass: similar content
    const content2 = "MCP server Store embedding cache bug — now reloads on each tool call";
    const emb2 = bowEmbedding(content2);

    // With activeEmbeddings: superseded origId is excluded, must route to new1Id
    const dActive = routeByEmbedding(emb2, store.activeEmbeddings());
    assert.ok(
      dActive.action === "supersede" || dActive.action === "update" || dActive.action === "add_related",
      `expected non-independent action, got ${dActive.action}`,
    );
    if (dActive.action !== "add_independent") {
      assert.notEqual(dActive.existingId, origId, "should not target superseded note");
      assert.equal(dActive.existingId, new1Id, "should target the active successor");
    }
  });
});

describe("Threshold constants", () => {
  it("thresholds are ordered correctly", () => {
    assert.ok(SIMILARITY_THRESHOLDS.SUPERSEDE > SIMILARITY_THRESHOLDS.UPDATE);
    assert.ok(SIMILARITY_THRESHOLDS.UPDATE > SIMILARITY_THRESHOLDS.RELATE);
    assert.ok(SIMILARITY_THRESHOLDS.RELATE > 0);
  });
});
