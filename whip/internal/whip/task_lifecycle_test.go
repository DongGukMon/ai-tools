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
	if err := task.ValidateTransition(StatusApprovedPendingFinalize); err != nil {
		t.Errorf("review→approved_pending_finalize: %v", err)
	}
	if err := task.ValidateTransition(StatusCompleted); err == nil {
		t.Error("review→completed should fail")
	}

	task.Status = StatusApprovedPendingFinalize
	if err := task.ValidateTransition(StatusCompleted); err != nil {
		t.Errorf("approved_pending_finalize→completed: %v", err)
	}

	task.Status = StatusCompleted
	if err := task.ValidateTransition(StatusAssigned); err == nil {
		t.Error("completed→assigned should fail")
	}
}

func TestRetryFlow(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Retry Me", "desc", "/tmp")
	task.Backend = "claude"
	s.SaveTask(task)

	task.Status = StatusAssigned
	task.Runner = "tmux"
	task.IRCName = "whip-" + task.ID
	task.ShellPID = 12345
	s.SaveTask(task)

	task.Status = StatusInProgress
	s.SaveTask(task)

	task.Status = StatusFailed
	task.AddNote("Auth module 80% done. Failed due to missing API key. Next agent: finish OAuth flow in auth.go")
	s.SaveTask(task)

	loaded, _ := s.LoadTask(task.ID)
	if len(loaded.Notes) != 1 {
		t.Fatalf("Notes count = %d, want 1", len(loaded.Notes))
	}
	if loaded.Notes[0].Status != "failed" {
		t.Errorf("Note status = %q, want %q", loaded.Notes[0].Status, "failed")
	}

	if err := loaded.Retry(); err != nil {
		t.Fatalf("Retry: %v", err)
	}
	s.SaveTask(loaded)

	retried, _ := s.LoadTask(task.ID)
	if retried.Status != StatusCreated {
		t.Errorf("Status = %q, want %q", retried.Status, StatusCreated)
	}
	if retried.Runner != "" {
		t.Errorf("Runner = %q, want empty", retried.Runner)
	}
	if retried.IRCName != "" {
		t.Errorf("IRCName = %q, want empty", retried.IRCName)
	}
	if retried.ShellPID != 0 {
		t.Errorf("ShellPID = %d, want 0", retried.ShellPID)
	}
	if retried.AssignedAt != nil {
		t.Error("AssignedAt should be nil")
	}
	if retried.CompletedAt != nil {
		t.Error("CompletedAt should be nil")
	}
	if retried.HeartbeatAt != nil {
		t.Error("HeartbeatAt should be nil")
	}
	if retried.Backend != "claude" {
		t.Errorf("Backend = %q, want %q (should be preserved across retry)", retried.Backend, "claude")
	}
	if len(retried.Notes) != 1 {
		t.Fatalf("Notes count after retry = %d, want 1", len(retried.Notes))
	}
	if retried.Notes[0].Content != "Auth module 80% done. Failed due to missing API key. Next agent: finish OAuth flow in auth.go" {
		t.Errorf("Note content not preserved: %q", retried.Notes[0].Content)
	}
	if err := retried.Retry(); err == nil {
		t.Error("Retry on created task should fail")
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

func TestFailedToCreatedTransition(t *testing.T) {
	task := NewTask("Test", "desc", "/tmp")
	task.Status = StatusFailed

	if err := task.ValidateTransition(StatusCreated); err != nil {
		t.Errorf("failed→created: %v", err)
	}
	if err := task.ValidateTransition(StatusAssigned); err == nil {
		t.Error("failed→assigned should fail")
	}
}
