package whip

import (
	"strings"
	"testing"
)

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
