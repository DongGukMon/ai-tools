package whip

import (
	"strings"
	"testing"
)

func TestGetBackend_Default(t *testing.T) {
	b, err := GetBackend("")
	if err != nil {
		t.Fatalf("GetBackend empty: %v", err)
	}
	if b.Name() != "claude" {
		t.Errorf("Name = %q, want %q", b.Name(), "claude")
	}
}

func TestGetBackend_Claude(t *testing.T) {
	b, err := GetBackend("claude")
	if err != nil {
		t.Fatalf("GetBackend claude: %v", err)
	}
	if b.Name() != "claude" {
		t.Errorf("Name = %q, want %q", b.Name(), "claude")
	}
}

func TestGetBackend_Unknown(t *testing.T) {
	_, err := GetBackend("codex")
	if err == nil {
		t.Error("GetBackend should fail for unknown backend")
	}
	if !strings.Contains(err.Error(), "unknown backend") {
		t.Errorf("error = %q, want 'unknown backend'", err.Error())
	}
}

func TestClaudeBackend_BuildLaunchCmd_FirstSpawn(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Test", "desc", "/tmp")

	cmd := b.BuildLaunchCmd(task, "/path/to/prompt.txt")

	// Should contain claude command
	if !strings.Contains(cmd, "claude --dangerously-skip-permissions") {
		t.Errorf("cmd should contain claude launch: %s", cmd)
	}
	// Should use --session-id for first spawn
	if !strings.Contains(cmd, "--session-id") {
		t.Errorf("cmd should contain --session-id: %s", cmd)
	}
	// Should reference prompt path
	if !strings.Contains(cmd, "prompt.txt") {
		t.Errorf("cmd should contain prompt path: %s", cmd)
	}
	// SessionID should be set
	if task.SessionID == "" {
		t.Error("SessionID should be set after BuildLaunchCmd")
	}
}

func TestClaudeBackend_BuildLaunchCmd_Resume(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Test", "desc", "/tmp")
	task.SessionID = "old-session-id"

	cmd := b.BuildLaunchCmd(task, "/path/to/prompt.txt")

	// Should use --resume for retry
	if !strings.Contains(cmd, "--resume") {
		t.Errorf("cmd should contain --resume: %s", cmd)
	}
	// Should reference old session ID
	if !strings.Contains(cmd, "old-session-id") {
		t.Errorf("cmd should reference old session ID: %s", cmd)
	}
	// SessionID should be updated to new UUID
	if task.SessionID == "old-session-id" {
		t.Error("SessionID should be updated after resume BuildLaunchCmd")
	}
	if task.SessionID == "" {
		t.Error("SessionID should not be empty after resume BuildLaunchCmd")
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
		} else {
			if strings.Contains(cmd, "--model") {
				t.Errorf("difficulty=%q: cmd should not contain --model: %s", tt.difficulty, cmd)
			}
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
	// claude may or may not be installed in test environment
	if err != nil {
		if !strings.Contains(err.Error(), "claude not found") {
			t.Fatalf("unexpected error: %v", err)
		}
		return // skip further checks if claude isn't installed
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

func TestSpawn_UsesTaskBackend(t *testing.T) {
	// Verify that Spawn reads the backend from the task.
	// We can't actually spawn, but we can verify GetBackend works
	// with the task's Backend field.
	task := NewTask("Test", "desc", "/tmp")
	task.Backend = "claude"

	b, err := GetBackend(task.Backend)
	if err != nil {
		t.Fatalf("GetBackend: %v", err)
	}
	if b.Name() != "claude" {
		t.Errorf("backend name = %q, want %q", b.Name(), "claude")
	}

	// Empty backend should default to claude
	task.Backend = ""
	b, err = GetBackend(task.Backend)
	if err != nil {
		t.Fatalf("GetBackend empty: %v", err)
	}
	if b.Name() != "claude" {
		t.Errorf("default backend name = %q, want %q", b.Name(), "claude")
	}
}

func TestDefaultBackendName(t *testing.T) {
	if DefaultBackendName != "claude" {
		t.Errorf("DefaultBackendName = %q, want %q", DefaultBackendName, "claude")
	}
}

func TestClaudeBackend_GeneratePrompt(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Test Prompt", "Build the auth module", "/tmp")
	task.IRCName = "whip-abc12"
	task.MasterIRCName = "whip-master"

	prompt := b.GeneratePrompt(task)

	// Should contain task details
	if !strings.Contains(prompt, "Test Prompt") {
		t.Error("prompt should contain task title")
	}
	if !strings.Contains(prompt, "Build the auth module") {
		t.Error("prompt should contain task description")
	}
	if !strings.Contains(prompt, "whip-abc12") {
		t.Error("prompt should contain IRC name")
	}
	if !strings.Contains(prompt, "whip-master") {
		t.Error("prompt should contain master IRC name")
	}
}

func TestGeneratePrompt_DispatchesByBackend(t *testing.T) {
	// GeneratePrompt (top-level) should dispatch to the task's backend
	task := NewTask("Dispatch Test", "desc", "/tmp")
	task.Backend = "claude"
	task.IRCName = "whip-test"
	task.MasterIRCName = "whip-master"

	prompt := GeneratePrompt(task)
	if !strings.Contains(prompt, "Dispatch Test") {
		t.Error("dispatched prompt should contain task title")
	}

	// Empty backend should also work (defaults to claude)
	task.Backend = ""
	prompt = GeneratePrompt(task)
	if !strings.Contains(prompt, "Dispatch Test") {
		t.Error("default-dispatched prompt should contain task title")
	}
}
