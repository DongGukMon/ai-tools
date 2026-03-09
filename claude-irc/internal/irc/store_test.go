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
	return &Store{BaseDir: dir}
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
}

func TestSessionMarker(t *testing.T) {
	store := newTestStore(t)
	daemonPID := 12345
	sessionPID := 67890

	// Write marker (new format: keyed by daemonPID, stores name + sessionPID)
	if err := store.WriteSessionMarker("testpeer", daemonPID, sessionPID); err != nil {
		t.Fatalf("WriteSessionMarker failed: %v", err)
	}

	// Read and parse marker
	data, err := os.ReadFile(store.SessionMarkerPath(daemonPID))
	if err != nil {
		t.Fatalf("reading session marker failed: %v", err)
	}
	name, parsedSessionPID := parseSessionMarker(data)
	if name != "testpeer" {
		t.Errorf("expected 'testpeer', got '%s'", name)
	}
	if parsedSessionPID != sessionPID {
		t.Errorf("expected sessionPID %d, got %d", sessionPID, parsedSessionPID)
	}

	// Non-existent marker
	_, err = os.ReadFile(store.SessionMarkerPath(99999))
	if err == nil {
		t.Error("expected error for non-existent marker")
	}

	// Remove marker
	if err := store.RemoveSessionMarker(daemonPID); err != nil {
		t.Fatalf("RemoveSessionMarker failed: %v", err)
	}

	// Verify removed
	_, err = os.ReadFile(store.SessionMarkerPath(daemonPID))
	if err == nil {
		t.Error("expected error after removing marker")
	}
}

func TestDetectSession(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	ircDir := filepath.Join(tmpHome, baseDir)
	os.MkdirAll(ircDir, 0755)

	// Write a session marker in new format: keyed by daemonPID, content is "name\nsessionPID"
	sessionPID := os.Getpid()
	daemonPID := 55555
	markerPath := filepath.Join(ircDir, fmt.Sprintf(".session_%d", daemonPID))
	os.WriteFile(markerPath, []byte(fmt.Sprintf("mypeer\n%d", sessionPID)), 0644)

	// DetectSession should find it by matching sessionPID in ancestor chain
	store, name, err := DetectSession(sessionPID)
	if err != nil {
		t.Fatalf("DetectSession failed: %v", err)
	}
	if name != "mypeer" {
		t.Errorf("expected 'mypeer', got '%s'", name)
	}
	if store == nil {
		t.Fatal("expected non-nil store")
	}
}

func TestDetectSession_LegacyFormat(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	ircDir := filepath.Join(tmpHome, baseDir)
	os.MkdirAll(ircDir, 0755)

	// Write a legacy marker: keyed by sessionPID, content is just name (no sessionPID)
	pid := os.Getpid()
	markerPath := filepath.Join(ircDir, fmt.Sprintf(".session_%d", pid))
	os.WriteFile(markerPath, []byte("mypeer"), 0644)

	// DetectSession should still find it via daemonPID (filename PID) fallback
	store, name, err := DetectSession(pid)
	if err != nil {
		t.Fatalf("DetectSession (legacy) failed: %v", err)
	}
	if name != "mypeer" {
		t.Errorf("expected 'mypeer', got '%s'", name)
	}
	if store == nil {
		t.Fatal("expected non-nil store")
	}
}

func TestDetectSession_MultiPeerSameSession(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	ircDir := filepath.Join(tmpHome, baseDir)
	os.MkdirAll(ircDir, 0755)

	// Simulate two peers joining from the same sessionPID with different daemonPIDs
	sessionPID := os.Getpid()
	daemonPID1 := 55551
	daemonPID2 := 55552

	marker1 := filepath.Join(ircDir, fmt.Sprintf(".session_%d", daemonPID1))
	marker2 := filepath.Join(ircDir, fmt.Sprintf(".session_%d", daemonPID2))
	os.WriteFile(marker1, []byte(fmt.Sprintf("peer-a\n%d", sessionPID)), 0644)
	os.WriteFile(marker2, []byte(fmt.Sprintf("peer-b\n%d", sessionPID)), 0644)

	// Both markers should exist independently (no collision)
	data1, err := os.ReadFile(marker1)
	if err != nil {
		t.Fatalf("marker1 should exist: %v", err)
	}
	data2, err := os.ReadFile(marker2)
	if err != nil {
		t.Fatalf("marker2 should exist: %v", err)
	}

	name1, sid1 := parseSessionMarker(data1)
	name2, sid2 := parseSessionMarker(data2)

	if name1 != "peer-a" {
		t.Errorf("marker1: expected 'peer-a', got '%s'", name1)
	}
	if name2 != "peer-b" {
		t.Errorf("marker2: expected 'peer-b', got '%s'", name2)
	}
	if sid1 != sessionPID || sid2 != sessionPID {
		t.Errorf("both markers should have sessionPID %d, got %d and %d", sessionPID, sid1, sid2)
	}

	// DetectSession should find a peer (either one, since both share the same sessionPID
	// and neither daemon is actually running in tests)
	store, name, err := DetectSession(sessionPID)
	if err != nil {
		t.Fatalf("DetectSession should find a session: %v", err)
	}
	if name != "peer-a" && name != "peer-b" {
		t.Errorf("expected 'peer-a' or 'peer-b', got '%s'", name)
	}
	if store == nil {
		t.Fatal("expected non-nil store")
	}
}

func TestParseSessionMarker(t *testing.T) {
	tests := []struct {
		input          string
		expectedName   string
		expectedSessPID int
	}{
		{"peer-a\n12345", "peer-a", 12345},
		{"peer-b\n99999", "peer-b", 99999},
		{"legacy-peer", "legacy-peer", 0},           // legacy format
		{"peer-c\n", "peer-c", 0},                   // newline but no PID
		{"peer-d\ninvalid", "peer-d", 0},             // non-numeric PID
		{" peer-e \n 42 ", "peer-e", 42},             // whitespace tolerance
	}
	for _, tt := range tests {
		name, sessionPID := parseSessionMarker([]byte(tt.input))
		if name != tt.expectedName {
			t.Errorf("parseSessionMarker(%q): name = %q, want %q", tt.input, name, tt.expectedName)
		}
		if sessionPID != tt.expectedSessPID {
			t.Errorf("parseSessionMarker(%q): sessionPID = %d, want %d", tt.input, sessionPID, tt.expectedSessPID)
		}
	}
}

func containsPath(full, suffix string) bool {
	return filepath.Join(filepath.Dir(full), filepath.Base(full)) != "" &&
		len(full) > len(suffix) &&
		full[len(full)-len(suffix):] == suffix
}

