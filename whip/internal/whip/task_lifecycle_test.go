package whip

import "testing"

func TestTaskStatusTransition(t *testing.T) {
	task := NewTask("Test", "desc", "/tmp")

	if err := task.ValidateTransition(StatusAssigned); err != nil {
		t.Errorf("created→assigned: %v", err)
	}
	if err := task.ValidateTransition(StatusCompleted); err == nil {
		t.Error("created→completed should fail")
	}

	task.Status = StatusAssigned
	if err := task.ValidateTransition(StatusInProgress); err != nil {
		t.Errorf("assigned→in_progress: %v", err)
	}

	task.Status = StatusInProgress
	if err := task.ValidateTransition(StatusAssigned); err == nil {
		t.Error("in_progress→assigned should fail")
	}
	if err := task.ValidateTransition(StatusReview); err != nil {
		t.Errorf("in_progress→review: %v", err)
	}
	if err := task.ValidateTransition(StatusCompleted); err != nil {
		t.Errorf("in_progress→completed: %v", err)
	}
	if err := task.ValidateTransition(StatusFailed); err != nil {
		t.Errorf("in_progress→failed: %v", err)
	}

	task.Status = StatusReview
	if err := task.ValidateTransition(StatusInProgress); err != nil {
		t.Errorf("review→in_progress: %v", err)
	}
	if err := task.ValidateTransition(StatusApproved); err != nil {
		t.Errorf("review→approved: %v", err)
	}
	if err := task.ValidateTransition(StatusCompleted); err == nil {
		t.Error("review→completed should fail")
	}

	task.Status = StatusApproved
	if err := task.ValidateTransition(StatusCompleted); err != nil {
		t.Errorf("approved→completed: %v", err)
	}

	task.Status = StatusCompleted
	if err := task.ValidateTransition(StatusAssigned); err == nil {
		t.Error("completed→assigned should fail")
	}
}

func TestNotesAppend(t *testing.T) {
	task := NewTask("Notes Test", "desc", "/tmp")
	task.Status = StatusInProgress

	task.AddNote("first progress update")
	task.AddNote("second progress update")

	if len(task.Notes) != 2 {
		t.Fatalf("Notes count = %d, want 2", len(task.Notes))
	}
	if task.Notes[0].Content != "first progress update" {
		t.Errorf("Notes[0] = %q", task.Notes[0].Content)
	}
	if task.Notes[1].Content != "second progress update" {
		t.Errorf("Notes[1] = %q", task.Notes[1].Content)
	}
	if task.Note != "second progress update" {
		t.Errorf("Note = %q, want %q", task.Note, "second progress update")
	}
}

func TestFailedToAssignedTransition(t *testing.T) {
	task := NewTask("Test", "desc", "/tmp")
	task.Status = StatusFailed

	if err := task.ValidateTransition(StatusAssigned); err != nil {
		t.Errorf("failed→assigned: %v", err)
	}
	if err := task.ValidateTransition(StatusCreated); err == nil {
		t.Error("failed→created should fail")
	}
}
