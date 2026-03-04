package irc

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	return &Store{BaseDir: dir, RepoID: "test-repo-id"}
}

func TestHashID(t *testing.T) {
	id := hashID("https://github.com/test/repo.git")
	if len(id) != 16 { // 8 bytes = 16 hex chars
		t.Errorf("expected 16 char hash, got %d: %s", len(id), id)
	}

	// Same input should produce same hash
	id2 := hashID("https://github.com/test/repo.git")
	if id != id2 {
		t.Errorf("hash not deterministic: %s != %s", id, id2)
	}

	// Different input should produce different hash
	id3 := hashID("https://github.com/other/repo.git")
	if id == id3 {
		t.Errorf("different inputs produced same hash: %s", id)
	}
}

func TestPathHelpers(t *testing.T) {
	store := newTestStore(t)

	if got := store.SocketPath("server"); !containsPath(got, "sockets/server.sock") {
		t.Errorf("unexpected socket path: %s", got)
	}
	if got := store.PIDPath("server"); !containsPath(got, "sockets/server.pid") {
		t.Errorf("unexpected PID path: %s", got)
	}
	if got := store.InboxDir("server"); !containsPath(got, "inbox/server") {
		t.Errorf("unexpected inbox dir: %s", got)
	}
	if got := store.TopicsDir("server"); !containsPath(got, "topics/server") {
		t.Errorf("unexpected topics dir: %s", got)
	}
}

func TestSessionMarker(t *testing.T) {
	store := newTestStore(t)
	ppid := 12345

	// Write marker
	if err := store.WriteSessionMarker("testpeer", ppid); err != nil {
		t.Fatalf("WriteSessionMarker failed: %v", err)
	}

	// Read marker
	name, err := store.ReadSessionMarker(ppid)
	if err != nil {
		t.Fatalf("ReadSessionMarker failed: %v", err)
	}
	if name != "testpeer" {
		t.Errorf("expected 'testpeer', got '%s'", name)
	}

	// Read non-existent marker
	_, err = store.ReadSessionMarker(99999)
	if err == nil {
		t.Error("expected error for non-existent marker")
	}

	// Remove marker
	if err := store.RemoveSessionMarker(ppid); err != nil {
		t.Fatalf("RemoveSessionMarker failed: %v", err)
	}

	// Verify removed
	_, err = store.ReadSessionMarker(ppid)
	if err == nil {
		t.Error("expected error after removing marker")
	}
}

func TestDetectSession(t *testing.T) {
	// Create a temp structure mimicking ~/.claude-irc/<repo-id>/
	tmpHome := t.TempDir()
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpHome)
	defer os.Setenv("HOME", origHome)

	repoDir := filepath.Join(tmpHome, baseDir, "fakerepo123")
	os.MkdirAll(repoDir, 0755)

	// Write a session marker
	ppid := os.Getpid() // Use our own PID for testing
	markerPath := filepath.Join(repoDir, fmt.Sprintf(".session_%d", ppid))
	os.WriteFile(markerPath, []byte("mypeer"), 0644)

	// DetectSession should find it
	store, name, err := DetectSession(ppid)
	if err != nil {
		t.Fatalf("DetectSession failed: %v", err)
	}
	if name != "mypeer" {
		t.Errorf("expected 'mypeer', got '%s'", name)
	}
	if store == nil {
		t.Fatal("expected non-nil store")
	}
	if store.RepoID != "fakerepo123" {
		t.Errorf("expected repo ID 'fakerepo123', got '%s'", store.RepoID)
	}
}

func containsPath(full, suffix string) bool {
	return filepath.Join(filepath.Dir(full), filepath.Base(full)) != "" &&
		len(full) > len(suffix) &&
		full[len(full)-len(suffix):] == suffix
}

