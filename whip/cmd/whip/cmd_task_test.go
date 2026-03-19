package main

import (
	"strings"
	"testing"

	whiplib "github.com/bang9/ai-tools/whip/internal/whip"
)

func TestTaskCreate_TypeOverride(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	stdout, stderr, err := execWhipCLICapture(
		t,
		"task", "create", "Fix API panic",
		"--cwd", t.TempDir(),
		"--desc", "Implement a new handler",
		"--type", whiplib.TaskTypeCoding,
	)
	if err != nil {
		t.Fatalf("task create: %v", err)
	}

	taskID := strings.TrimSpace(stdout)
	store, err := whiplib.NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	task, err := store.LoadTask(taskID)
	if err != nil {
		t.Fatalf("LoadTask: %v", err)
	}
	if task.Type != whiplib.TaskTypeCoding {
		t.Fatalf("task Type = %q, want %q", task.Type, whiplib.TaskTypeCoding)
	}
	if !strings.Contains(stderr, "type: "+whiplib.TaskTypeCoding) {
		t.Fatalf("stderr missing type output:\n%s", stderr)
	}
}

func TestTaskCreate_InvalidType(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	_, _, err := execWhipCLICapture(
		t,
		"task", "create", "Fix API panic",
		"--cwd", t.TempDir(),
		"--type", "unknown",
	)
	if err == nil {
		t.Fatal("task create should reject invalid --type")
	}
	if !strings.Contains(err.Error(), "invalid task type") {
		t.Fatalf("task create error = %v, want invalid task type", err)
	}
}
