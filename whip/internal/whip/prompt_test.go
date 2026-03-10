package whip

import (
	"strings"
	"testing"
)

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
	if !strings.Contains(prompt, "Home context (READ-ONLY): WHIP_HOME/home/ (default: ~/.whip/home/)") {
		t.Fatalf("prompt should include whip home guidance")
	}
	if !strings.Contains(prompt, "memory.md: User preferences and operational guidelines") {
		t.Fatalf("prompt should reference memory.md")
	}
	if !strings.Contains(prompt, "projects.md: Project registry with paths and tech stacks") {
		t.Fatalf("prompt should reference projects.md")
	}
}

func TestClaudeBackend_GeneratePrompt(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Test Prompt", "Build the auth module", "/tmp")
	task.IRCName = "whip-abc12"
	task.MasterIRCName = "whip-master"

	prompt := b.GeneratePrompt(task)

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
	if !strings.Contains(prompt, "Home context (READ-ONLY): WHIP_HOME/home/ (default: ~/.whip/home/)") {
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
	task := NewTask("Dispatch Test", "desc", "/tmp")
	task.Backend = "claude"
	task.IRCName = "whip-test"
	task.MasterIRCName = "whip-master"

	prompt := GeneratePrompt(task)
	if !strings.Contains(prompt, "Dispatch Test") {
		t.Error("dispatched prompt should contain task title")
	}

	task.Backend = ""
	prompt = GeneratePrompt(task)
	if !strings.Contains(prompt, "Dispatch Test") {
		t.Error("default-dispatched prompt should contain task title")
	}
}

func TestClaudeBackend_GenerateLeadPrompt(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Lead Task", "## Worker Tasks\n### Worker 1: Auth module\n- Backend: claude\n- Difficulty: medium", "/tmp")
	task.Role = TaskRoleLead
	task.Workspace = "my-ws"
	task.IRCName = "wp-lead-my-ws"
	task.MasterIRCName = "wp-master-my-ws"

	prompt := b.GeneratePrompt(task)

	if !strings.Contains(prompt, "Workspace Lead") {
		t.Error("lead prompt should contain 'Workspace Lead'")
	}
	if !strings.Contains(prompt, "whip task create") {
		t.Error("lead prompt should contain task create instruction")
	}
	if !strings.Contains(prompt, "whip task assign") {
		t.Error("lead prompt should contain task assign instruction")
	}
	if !strings.Contains(prompt, "Do NOT run `whip task complete` on your own task") {
		t.Error("lead prompt should contain cannot self-complete warning")
	}
	if !strings.Contains(prompt, "whip task list --workspace my-ws") {
		t.Error("lead prompt should contain recovery check")
	}
	if strings.Contains(prompt, "You are an agent working under a lead session") {
		t.Error("lead prompt should NOT contain worker intro")
	}
	if !strings.Contains(prompt, "/loop 1m claude-irc inbox") {
		t.Error("Claude lead prompt should contain loop command")
	}
	if !strings.Contains(prompt, "memory.md") {
		t.Error("lead prompt should reference home context")
	}
}

func TestCodexBackend_GenerateLeadPrompt(t *testing.T) {
	b := &CodexBackend{}
	task := NewTask("Lead Task", "Worker specs here", "/tmp")
	task.Role = TaskRoleLead
	task.Workspace = "my-ws"
	task.IRCName = "wp-lead-my-ws"
	task.MasterIRCName = "wp-master-my-ws"

	prompt := b.GeneratePrompt(task)

	if !strings.Contains(prompt, "Workspace Lead") {
		t.Error("codex lead prompt should contain 'Workspace Lead'")
	}
	if strings.Contains(prompt, "/loop 1m claude-irc inbox") {
		t.Error("codex lead prompt should NOT contain loop command")
	}
	if !strings.Contains(prompt, "Run claude-irc inbox now") {
		t.Error("codex lead prompt should contain manual polling guidance")
	}
}

func TestWorkerPromptUnchangedWhenLeadExists(t *testing.T) {
	b := &ClaudeBackend{}
	task := NewTask("Worker Task", "Do the work", "/tmp")
	task.IRCName = "wp-abc12"
	task.MasterIRCName = "wp-lead-my-ws" // routed to Lead

	prompt := b.GeneratePrompt(task)

	if strings.Contains(prompt, "Workspace Lead") {
		t.Error("worker prompt should NOT contain lead intro even when routed to Lead")
	}
	if !strings.Contains(prompt, "You are an agent working under a lead session") {
		t.Error("worker prompt should contain worker intro")
	}
}

func TestGeneratePrompt_LeadDispatch(t *testing.T) {
	task := NewTask("Lead Dispatch", "desc", "/tmp")
	task.Role = TaskRoleLead
	task.Workspace = "test-ws"
	task.Backend = "claude"
	task.IRCName = "wp-lead-test-ws"
	task.MasterIRCName = "wp-master-test-ws"

	prompt := GeneratePrompt(task)
	if !strings.Contains(prompt, "Workspace Lead") {
		t.Error("dispatched lead prompt should contain lead intro")
	}

	task.Backend = "codex"
	prompt = GeneratePrompt(task)
	if !strings.Contains(prompt, "Workspace Lead") {
		t.Error("codex dispatched lead prompt should contain lead intro")
	}
	if strings.Contains(prompt, "/loop 1m") {
		t.Error("codex dispatched lead prompt should not contain /loop")
	}
}

func TestTaskIsLead(t *testing.T) {
	task := NewTask("Test", "", "/tmp")
	if task.IsLead() {
		t.Error("new task should not be lead")
	}
	task.Role = TaskRoleLead
	if !task.IsLead() {
		t.Error("task with lead role should be lead")
	}
	task.Role = "other"
	if task.IsLead() {
		t.Error("task with non-lead role should not be lead")
	}
}

func TestWorkspaceLeadIRCName(t *testing.T) {
	tests := []struct {
		workspace string
		want      string
	}{
		{"my-ws", "wp-lead-my-ws"},
		{"global", ""},
		{"", ""},
		{"  Global  ", ""},
		{"issue-sweep", "wp-lead-issue-sweep"},
	}
	for _, tt := range tests {
		got := WorkspaceLeadIRCName(tt.workspace)
		if got != tt.want {
			t.Errorf("WorkspaceLeadIRCName(%q) = %q, want %q", tt.workspace, got, tt.want)
		}
	}
}

func TestReviewPrompt_IncludesRequestChangesFlow(t *testing.T) {
	task := NewTask("Review Prompt", "Build the auth module", "/tmp")
	task.Review = true
	task.IRCName = "whip-abc12"
	task.MasterIRCName = "whip-master"

	claudePrompt := (&ClaudeBackend{}).GeneratePrompt(task)
	if !strings.Contains(claudePrompt, "review -> request-changes -> review -> approve -> complete") {
		t.Fatalf("Claude review prompt should describe the request-changes loop")
	}
	if !strings.Contains(claudePrompt, "whip task request-changes <id>") {
		t.Fatalf("Claude review prompt should mention the request-changes command")
	}
	if !strings.Contains(claudePrompt, "do NOT run `whip task start` again") {
		t.Fatalf("Claude review prompt should explain how rework resumes")
	}

	codexPrompt := (&CodexBackend{}).GeneratePrompt(task)
	if !strings.Contains(codexPrompt, "continue from the task's returned in_progress state") {
		t.Fatalf("Codex review prompt should mention resuming after request-changes")
	}
}
