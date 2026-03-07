package main

import (
	"os"
	"testing"

	"github.com/bang9/ai-tools/claude-irc/internal/irc"
)

// TestResolveMyName_NoFallbackToSinglePeer verifies that resolveMyName does NOT
// fall back to the only registered peer when session detection fails.
// This is a regression test for: SessionEnd hook running "claude-irc quit" from
// an unrelated session would resolve to whip-master (the only peer) and kill it.
func TestResolveMyName_NoFallbackToSinglePeer(t *testing.T) {
	// Create a temp store
	tmpDir := t.TempDir()
	store, err := irc.NewStoreWithBaseDir(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	// Register a peer (simulating whip-master)
	if err := store.Register("whip-master", os.Getpid()); err != nil {
		t.Fatal(err)
	}

	// Reset global nameFlag to ensure no --name override
	nameFlag = ""

	// resolveMyName should fail because:
	// - DetectSession won't find a session marker for this test process
	// - There's exactly 1 peer registered
	// - The old code would fallback to that peer (BUG)
	// - The fix should return an error instead
	_, err = resolveMyName(store)
	if err == nil {
		t.Fatal("resolveMyName should have returned error when no session marker exists, even with 1 peer registered")
	}
}

// TestResolveMyName_NameFlagWorks verifies that --name flag still works as fallback.
func TestResolveMyName_NameFlagWorks(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := irc.NewStoreWithBaseDir(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	nameFlag = "test-peer"
	defer func() { nameFlag = "" }()

	name, err := resolveMyName(store)
	if err != nil {
		t.Fatalf("resolveMyName with --name flag should succeed: %v", err)
	}
	if name != "test-peer" {
		t.Fatalf("expected 'test-peer', got '%s'", name)
	}
}
