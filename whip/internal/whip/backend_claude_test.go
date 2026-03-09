package whip

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestClaudeBackend_BuildLaunchCmd_FirstSpawn(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Test", "desc", "/tmp")

	cmd := b.BuildLaunchCmd(task, "/path/to/prompt.txt")

	if !strings.Contains(cmd, "claude --dangerously-skip-permissions") {
		t.Errorf("cmd should contain claude launch: %s", cmd)
	}
	if !strings.Contains(cmd, "--session-id") {
		t.Errorf("cmd should contain --session-id: %s", cmd)
	}
	if !strings.Contains(cmd, "prompt.txt") {
		t.Errorf("cmd should contain prompt path: %s", cmd)
	}
	if task.SessionID == "" {
		t.Error("SessionID should be set after BuildLaunchCmd")
	}
}

func TestClaudeBackend_BuildLaunchCmd_ForksRetrySession(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Test", "desc", "/tmp")
	oldID := "11111111-1111-4111-8111-111111111111"
	task.SessionID = oldID

	cmd := b.BuildLaunchCmd(task, "/path/to/prompt.txt")

	if !strings.Contains(cmd, "--resume") {
		t.Errorf("cmd should contain --resume: %s", cmd)
	}
	if !strings.Contains(cmd, oldID) {
		t.Errorf("cmd should reference old session ID: %s", cmd)
	}
	if !strings.Contains(cmd, "--fork-session") {
		t.Errorf("cmd should contain --fork-session: %s", cmd)
	}
	if !strings.Contains(cmd, "--session-id") {
		t.Errorf("cmd should contain --session-id for forked retries: %s", cmd)
	}
	if task.SessionID == oldID {
		t.Error("SessionID should be updated after resume BuildLaunchCmd")
	}
	if task.SessionID == "" {
		t.Error("SessionID should not be empty after resume BuildLaunchCmd")
	}
	if _, err := uuid.Parse(task.SessionID); err != nil {
		t.Fatalf("SessionID should be a valid UUID, got %q: %v", task.SessionID, err)
	}
	if !strings.Contains(cmd, task.SessionID) {
		t.Errorf("cmd should reference new session ID: %s", cmd)
	}
}

func TestClaudeBackend_ModelFlags_Difficulty(t *testing.T) {
	b := &ClaudeBackend{}

	tests := []struct {
		difficulty string
		wantModel  string
	}{
		{"hard", "--model opus --effort high"},
		{"medium", "--model opus --effort medium"},
		{"easy", "--model sonnet"},
		{"", ""},
	}

	for _, tt := range tests {
		task := NewTask("Test", "desc", "/tmp")
		task.Difficulty = tt.difficulty

		cmd := b.BuildLaunchCmd(task, "/prompt.txt")

		if tt.wantModel != "" {
			if !strings.Contains(cmd, tt.wantModel) {
				t.Errorf("difficulty=%q: cmd should contain %q: %s", tt.difficulty, tt.wantModel, cmd)
			}
		} else if strings.Contains(cmd, "--model") {
			t.Errorf("difficulty=%q: cmd should not contain --model: %s", tt.difficulty, cmd)
		}
	}
}

func TestClaudeBackend_BuildResumeCmd(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Test", "desc", "/tmp")
	task.SessionID = "test-session-123"

	cmd := b.BuildResumeCmd(task)

	if !strings.Contains(cmd, "claude --resume") {
		t.Errorf("cmd should contain 'claude --resume': %s", cmd)
	}
	if !strings.Contains(cmd, "test-session-123") {
		t.Errorf("cmd should contain session ID: %s", cmd)
	}
}

func TestClaudeBackend_ResumeExec(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Test", "desc", "/tmp")
	task.SessionID = "test-session-456"

	path, args, err := b.ResumeExec(task)
	if err != nil {
		if !strings.Contains(err.Error(), "claude not found") {
			t.Fatalf("unexpected error: %v", err)
		}
		return
	}

	if path == "" {
		t.Error("path should not be empty")
	}
	if len(args) != 3 {
		t.Fatalf("args len = %d, want 3", len(args))
	}
	if args[0] != "claude" {
		t.Errorf("args[0] = %q, want %q", args[0], "claude")
	}
	if args[1] != "--resume" {
		t.Errorf("args[1] = %q, want %q", args[1], "--resume")
	}
	if args[2] != "test-session-456" {
		t.Errorf("args[2] = %q, want %q", args[2], "test-session-456")
	}
}

func TestClaudeBackend_SyncSession_NoOp(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Test", "desc", "/tmp")
	task.SessionID = "existing"

	if err := b.SyncSession(task, "/prompt.txt", time.Now()); err != nil {
		t.Fatalf("SyncSession: %v", err)
	}
	if task.SessionID != "existing" {
		t.Fatalf("SessionID = %q, want unchanged", task.SessionID)
	}
}
