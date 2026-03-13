package whip

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCancelTaskSnapshotsMessagesBeforeRuntimeClear(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	store := tempStore(t)
	task := NewTask("Cancelable", "desc", "/tmp")
	task.Status = StatusInProgress
	task.IRCName = "wp-cancelable"
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	msg := ircMessage{
		From:      task.IRCName,
		Content:   "preserve me",
		Timestamp: time.Now().UTC(),
	}
	writeIRCTestMessage(t, home, task.IRCName, "001.json", msg)

	if _, err := CancelTask(store, task.ID, LaunchSource{Actor: "test", Command: "cancel"}, "cleanup"); err != nil {
		t.Fatalf("CancelTask: %v", err)
	}

	stored, err := store.LoadMessages(task.ID)
	if err != nil {
		t.Fatalf("LoadMessages: %v", err)
	}
	if len(stored) != 1 || stored[0].Content != msg.Content {
		t.Fatalf("stored messages = %+v, want preserved IRC snapshot", stored)
	}

	updated, err := store.LoadTask(task.ID)
	if err != nil {
		t.Fatalf("LoadTask: %v", err)
	}
	if updated.IRCName != "" {
		t.Fatalf("IRCName = %q, want runtime cleared after cancel", updated.IRCName)
	}
}

func writeIRCTestMessage(t *testing.T, home string, peer string, filename string, msg ircMessage) {
	t.Helper()

	dir := filepath.Join(home, ".claude-irc", "inbox", peer)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, filename), data, 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
}
