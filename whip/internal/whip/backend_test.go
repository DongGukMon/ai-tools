package whip

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
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

func TestGetBackend_Codex(t *testing.T) {
	b, err := GetBackend("codex")
	if err != nil {
		t.Fatalf("GetBackend codex: %v", err)
	}
	if b.Name() != "codex" {
		t.Errorf("Name = %q, want %q", b.Name(), "codex")
	}
}

func TestGetBackend_Unknown(t *testing.T) {
	_, err := GetBackend("bogus")
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

func TestCodexBackend_BuildLaunchCmd_FirstSpawn(t *testing.T) {
	b := &CodexBackend{}
	task := NewTask("Test", "desc", "/tmp")
	task.Difficulty = "hard"

	cmd := b.BuildLaunchCmd(task, "/path/to/prompt.txt")

	if !strings.Contains(cmd, "codex") {
		t.Fatalf("cmd should contain codex: %s", cmd)
	}
	if !strings.Contains(cmd, "gpt-5.4") {
		t.Fatalf("cmd should contain codex model: %s", cmd)
	}
	if !strings.Contains(cmd, `model_reasoning_effort="xhigh"`) {
		t.Fatalf("cmd should contain effort override: %s", cmd)
	}
	if strings.Contains(cmd, "fork") {
		t.Fatalf("first launch should not fork: %s", cmd)
	}
	if !strings.Contains(cmd, "prompt.txt") {
		t.Fatalf("cmd should contain prompt path: %s", cmd)
	}
}

func TestCodexBackend_BuildLaunchCmd_Fork(t *testing.T) {
	b := &CodexBackend{}
	task := NewTask("Test", "desc", "/tmp")
	task.SessionID = "session-123"
	task.Difficulty = "medium"

	cmd := b.BuildLaunchCmd(task, "/path/to/prompt.txt")

	if !strings.Contains(cmd, "fork") {
		t.Fatalf("cmd should contain fork: %s", cmd)
	}
	if !strings.Contains(cmd, "session-123") {
		t.Fatalf("cmd should reference previous session: %s", cmd)
	}
	if !strings.Contains(cmd, `model_reasoning_effort="xhigh"`) {
		t.Fatalf("cmd should contain xhigh effort override: %s", cmd)
	}
}

func TestCodexBackend_BuildResumeCmd(t *testing.T) {
	b := &CodexBackend{}
	task := NewTask("Test", "desc", "/tmp")
	task.SessionID = "session-456"
	task.Difficulty = "easy"

	cmd := b.BuildResumeCmd(task)

	if !strings.Contains(cmd, "resume") {
		t.Fatalf("cmd should contain resume: %s", cmd)
	}
	if !strings.Contains(cmd, "session-456") {
		t.Fatalf("cmd should contain session ID: %s", cmd)
	}
	if !strings.Contains(cmd, `model_reasoning_effort="high"`) {
		t.Fatalf("cmd should contain high effort override for easy tasks: %s", cmd)
	}
}

func TestCodexBackend_GeneratePrompt(t *testing.T) {
	b := &CodexBackend{}
	task := NewTask("Test Prompt", "Build the auth module", "/tmp")
	task.IRCName = "whip-abc12"
	task.MasterIRCName = "whip-master"

	prompt := b.GeneratePrompt(task)

	if !strings.Contains(prompt, "Run claude-irc inbox now") {
		t.Fatalf("prompt should contain Codex inbox guidance")
	}
	if strings.Contains(prompt, "/loop 1m claude-irc inbox") {
		t.Fatalf("prompt should not contain Claude-only loop command")
	}
	if !strings.Contains(prompt, "Home context (READ-ONLY): ~/.whip/home/") {
		t.Fatalf("prompt should include whip home guidance")
	}
	if !strings.Contains(prompt, "memory.md: User preferences and operational guidelines") {
		t.Fatalf("prompt should reference memory.md")
	}
	if !strings.Contains(prompt, "projects.md: Project registry with paths and tech stacks") {
		t.Fatalf("prompt should reference projects.md")
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
	if !strings.Contains(prompt, "Home context (READ-ONLY): ~/.whip/home/") {
		t.Error("prompt should include whip home guidance")
	}
	if !strings.Contains(prompt, "memory.md: User preferences and operational guidelines") {
		t.Error("prompt should reference memory.md")
	}
	if !strings.Contains(prompt, "projects.md: Project registry with paths and tech stacks") {
		t.Error("prompt should reference projects.md")
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
