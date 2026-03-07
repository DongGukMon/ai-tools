package whip

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestFindCodexSession_PromptMatchWins(t *testing.T) {
	dir := t.TempDir()
	launchedAt := time.Now()

	writeCodexSessionFixture(t, dir, "a.jsonl", "session-a", "/repo", "Read and follow /tmp/other.txt", launchedAt.Add(1*time.Second))
	writeCodexSessionFixture(t, dir, "b.jsonl", "session-b", "/repo", "Read and follow /tmp/target.txt", launchedAt.Add(2*time.Second))

	id, err := findCodexSession(dir, "/repo", "/tmp/target.txt", launchedAt)
	if err != nil {
		t.Fatalf("findCodexSession: %v", err)
	}
	if id != "session-b" {
		t.Fatalf("id = %q, want %q", id, "session-b")
	}
}

func TestFindCodexSession_FallbackSingleCandidate(t *testing.T) {
	dir := t.TempDir()
	launchedAt := time.Now()

	writeCodexSessionFixture(t, dir, "a.jsonl", "session-a", "/repo", "no prompt yet", launchedAt.Add(1*time.Second))

	id, err := findCodexSession(dir, "/repo", "/tmp/missing.txt", launchedAt)
	if err != nil {
		t.Fatalf("findCodexSession: %v", err)
	}
	if id != "session-a" {
		t.Fatalf("id = %q, want %q", id, "session-a")
	}
}

func TestFindCodexSession_ErrorsOnAmbiguousFallback(t *testing.T) {
	dir := t.TempDir()
	launchedAt := time.Now()

	writeCodexSessionFixture(t, dir, "a.jsonl", "session-a", "/repo", "first", launchedAt.Add(1*time.Second))
	writeCodexSessionFixture(t, dir, "b.jsonl", "session-b", "/repo", "second", launchedAt.Add(2*time.Second))

	_, err := findCodexSession(dir, "/repo", "/tmp/missing.txt", launchedAt)
	if err == nil {
		t.Fatal("expected ambiguous fallback error")
	}
	if !strings.Contains(err.Error(), "multiple Codex sessions found") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestFindCodexSession_NormalizesCWD(t *testing.T) {
	dir := t.TempDir()
	launchedAt := time.Now()

	realCWD := filepath.Join(t.TempDir(), "real")
	if err := os.MkdirAll(realCWD, 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	aliasCWD := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(realCWD, aliasCWD); err != nil {
		t.Skipf("Symlink unsupported: %v", err)
	}

	writeCodexSessionFixture(t, dir, "a.jsonl", "session-a", realCWD, "Read and follow /tmp/target.txt", launchedAt.Add(1*time.Second))

	id, err := findCodexSession(dir, aliasCWD, "/tmp/target.txt", launchedAt)
	if err != nil {
		t.Fatalf("findCodexSession: %v", err)
	}
	if id != "session-a" {
		t.Fatalf("id = %q, want %q", id, "session-a")
	}
}

func writeCodexSessionFixture(t *testing.T, root, name, id, cwd, body string, modTime time.Time) {
	t.Helper()

	path := filepath.Join(root, "2026", "03", "08", name)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}

	content := strings.Join([]string{
		`{"type":"session_meta","payload":{"id":"` + id + `","cwd":"` + cwd + `"}}`,
		`{"type":"event_msg","payload":{"message":"` + body + `"}}`,
		"",
	}, "\n")

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := os.Chtimes(path, modTime, modTime); err != nil {
		t.Fatalf("Chtimes: %v", err)
	}
}
