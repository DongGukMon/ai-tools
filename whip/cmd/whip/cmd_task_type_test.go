package main

import (
	"strings"
	"testing"

	whiplib "github.com/bang9/ai-tools/whip/internal/whip"
)

func TestTaskTypeCommand_UpdatesTaskType(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	store, err := whiplib.NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	task := whiplib.NewTask("Investigate panic", "", t.TempDir())
	task.Type = whiplib.TaskTypeGeneral
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	stdout, stderr, err := execWhipCLICapture(t, "task", "type", task.ID, whiplib.TaskTypeCoding)
	if err != nil {
		t.Fatalf("task type: %v", err)
	}
	if strings.TrimSpace(stdout) != task.ID {
		t.Fatalf("task type stdout = %q, want %q", strings.TrimSpace(stdout), task.ID)
	}
	if !strings.Contains(stderr, task.ID+": type → "+whiplib.TaskTypeCoding) {
		t.Fatalf("task type stderr = %q, want type confirmation", stderr)
	}

	updated, err := store.LoadTask(task.ID)
	if err != nil {
		t.Fatalf("LoadTask: %v", err)
	}
	if updated.Type != whiplib.TaskTypeCoding {
		t.Fatalf("task Type = %q, want %q", updated.Type, whiplib.TaskTypeCoding)
	}
	if len(updated.Events) == 0 {
		t.Fatal("task type should record an event")
	}
	lastEvent := updated.Events[len(updated.Events)-1]
	if lastEvent.Actor != "cli" || lastEvent.Command != "type" || lastEvent.Action != "type_changed" {
		t.Fatalf("last event = %+v, want cli/type/type_changed", lastEvent)
	}
}

func TestTaskTypeCommand_InvalidType(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	store, err := whiplib.NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	task := whiplib.NewTask("Investigate panic", "", t.TempDir())
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	_, _, err = execWhipCLICapture(t, "task", "type", task.ID, "unknown")
	if err == nil {
		t.Fatal("task type should reject invalid types")
	}
	if !strings.Contains(err.Error(), "invalid task type") {
		t.Fatalf("task type error = %v, want invalid task type", err)
	}
	if !strings.Contains(err.Error(), whiplib.TaskTypeCoding) {
		t.Fatalf("task type error = %v, want valid type list", err)
	}
}
