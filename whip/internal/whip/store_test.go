package whip

import (
	"os"
	"path/filepath"
	"testing"
)

func tempStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	s := &Store{BaseDir: dir}
	os.MkdirAll(filepath.Join(dir, tasksDir), 0755)
	return s
}

func TestCreateAndLoadTask(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Test Task", "A test description", "/tmp")

	if err := s.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	loaded, err := s.LoadTask(task.ID)
	if err != nil {
		t.Fatalf("LoadTask: %v", err)
	}

	if loaded.Title != "Test Task" {
		t.Errorf("Title = %q, want %q", loaded.Title, "Test Task")
	}
	if loaded.Status != StatusCreated {
		t.Errorf("Status = %q, want %q", loaded.Status, StatusCreated)
	}
	if loaded.CWD != "/tmp" {
		t.Errorf("CWD = %q, want %q", loaded.CWD, "/tmp")
	}
}

func TestBackendPersistence(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Backend Test", "desc", "/tmp")
	task.Backend = "claude"
	s.SaveTask(task)

	loaded, err := s.LoadTask(task.ID)
	if err != nil {
		t.Fatalf("LoadTask: %v", err)
	}
	if loaded.Backend != "claude" {
		t.Errorf("Backend = %q, want %q", loaded.Backend, "claude")
	}
}

func TestBackendEmptyDefault(t *testing.T) {
	s := tempStore(t)
	task := NewTask("No Backend", "desc", "/tmp")
	// Backend left empty
	s.SaveTask(task)

	loaded, err := s.LoadTask(task.ID)
	if err != nil {
		t.Fatalf("LoadTask: %v", err)
	}
	if loaded.Backend != "" {
		t.Errorf("Backend = %q, want empty", loaded.Backend)
	}

	// GetBackend should handle empty gracefully
	b, err := GetBackend(loaded.Backend)
	if err != nil {
		t.Fatalf("GetBackend: %v", err)
	}
	if b.Name() != "claude" {
		t.Errorf("default backend = %q, want %q", b.Name(), "claude")
	}
}

func TestListTasks(t *testing.T) {
	s := tempStore(t)

	t1 := NewTask("First", "desc1", "/tmp")
	t2 := NewTask("Second", "desc2", "/tmp")
	s.SaveTask(t1)
	s.SaveTask(t2)

	tasks, err := s.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("len(tasks) = %d, want 2", len(tasks))
	}
}

func TestResolveID(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Test", "desc", "/tmp")
	s.SaveTask(task)

	// Exact match
	id, err := s.ResolveID(task.ID)
	if err != nil {
		t.Fatalf("ResolveID exact: %v", err)
	}
	if id != task.ID {
		t.Errorf("ResolveID = %q, want %q", id, task.ID)
	}

	// Prefix match
	id, err = s.ResolveID(task.ID[:3])
	if err != nil {
		t.Fatalf("ResolveID prefix: %v", err)
	}
	if id != task.ID {
		t.Errorf("ResolveID prefix = %q, want %q", id, task.ID)
	}

	// Not found
	_, err = s.ResolveID("zzzzz")
	if err == nil {
		t.Error("ResolveID should fail for unknown ID")
	}
}

func TestDeleteTask(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Delete Me", "desc", "/tmp")
	s.SaveTask(task)

	if err := s.DeleteTask(task.ID); err != nil {
		t.Fatalf("DeleteTask: %v", err)
	}

	_, err := s.LoadTask(task.ID)
	if err == nil {
		t.Error("LoadTask should fail after delete")
	}
}

func TestCleanTerminal(t *testing.T) {
	s := tempStore(t)

	t1 := NewTask("Active", "desc", "/tmp")
	t1.Status = StatusInProgress
	s.SaveTask(t1)

	t2 := NewTask("Done", "desc", "/tmp")
	t2.Status = StatusCompleted
	s.SaveTask(t2)

	t3 := NewTask("Failed", "desc", "/tmp")
	t3.Status = StatusFailed
	s.SaveTask(t3)

	count, err := s.CleanTerminal()
	if err != nil {
		t.Fatalf("CleanTerminal: %v", err)
	}
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}

	tasks, _ := s.ListTasks()
	if len(tasks) != 1 {
		t.Errorf("remaining tasks = %d, want 1", len(tasks))
	}
}

func TestDependencies(t *testing.T) {
	s := tempStore(t)

	t1 := NewTask("Auth", "auth", "/tmp")
	t1.Status = StatusCompleted
	s.SaveTask(t1)

	t2 := NewTask("API", "api", "/tmp")
	t2.Status = StatusInProgress
	s.SaveTask(t2)

	t3 := NewTask("Deploy", "deploy", "/tmp")
	t3.DependsOn = []string{t1.ID, t2.ID}
	s.SaveTask(t3)

	// Not all met
	met, unmet, err := s.AreDependenciesMet(t3)
	if err != nil {
		t.Fatalf("AreDependenciesMet: %v", err)
	}
	if met {
		t.Error("should not be met")
	}
	if len(unmet) != 1 || unmet[0] != t2.ID {
		t.Errorf("unmet = %v, want [%s]", unmet, t2.ID)
	}

	// Complete t2
	t2.Status = StatusCompleted
	s.SaveTask(t2)

	met, _, err = s.AreDependenciesMet(t3)
	if err != nil {
		t.Fatalf("AreDependenciesMet: %v", err)
	}
	if !met {
		t.Error("should be met")
	}

	// Get dependents
	deps, err := s.GetDependents(t1.ID)
	if err != nil {
		t.Fatalf("GetDependents: %v", err)
	}
	if len(deps) != 1 || deps[0].ID != t3.ID {
		t.Errorf("dependents = %v, want [%s]", deps, t3.ID)
	}
}

func TestConfig(t *testing.T) {
	s := tempStore(t)

	cfg, err := s.LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.MasterIRCName != "" {
		t.Errorf("default MasterIRCName = %q, want empty", cfg.MasterIRCName)
	}

	cfg.MasterIRCName = "whip-master"
	if err := s.SaveConfig(cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	cfg2, err := s.LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig after save: %v", err)
	}
	if cfg2.MasterIRCName != "whip-master" {
		t.Errorf("MasterIRCName = %q, want %q", cfg2.MasterIRCName, "whip-master")
	}
}

func TestResolveWhipBaseDir_UsesEnvOverride(t *testing.T) {
	override := filepath.Join(t.TempDir(), "custom-whip-home")
	t.Setenv("WHIP_HOME", override)

	got, err := ResolveWhipBaseDir()
	if err != nil {
		t.Fatalf("ResolveWhipBaseDir: %v", err)
	}
	if got != override {
		t.Fatalf("ResolveWhipBaseDir = %q, want %q", got, override)
	}
}

func TestTaskStatusTransition(t *testing.T) {
	task := NewTask("Test", "desc", "/tmp")

	// created → assigned: OK
	if err := task.ValidateTransition(StatusAssigned); err != nil {
		t.Errorf("created→assigned: %v", err)
	}

	// created → completed: fail
	if err := task.ValidateTransition(StatusCompleted); err == nil {
		t.Error("created→completed should fail")
	}

	task.Status = StatusAssigned
	// assigned → in_progress: OK
	if err := task.ValidateTransition(StatusInProgress); err != nil {
		t.Errorf("assigned→in_progress: %v", err)
	}

	task.Status = StatusInProgress
	// in_progress → assigned: fail
	if err := task.ValidateTransition(StatusAssigned); err == nil {
		t.Error("in_progress→assigned should fail")
	}
	// in_progress → review: OK
	if err := task.ValidateTransition(StatusReview); err != nil {
		t.Errorf("in_progress→review: %v", err)
	}
	// in_progress → completed: OK
	if err := task.ValidateTransition(StatusCompleted); err != nil {
		t.Errorf("in_progress→completed: %v", err)
	}
	// in_progress → failed: OK
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
	// completed → anything: fail
	if err := task.ValidateTransition(StatusAssigned); err == nil {
		t.Error("completed→assigned should fail")
	}
}

func TestRetryFlow(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Retry Me", "desc", "/tmp")
	task.Backend = "claude"
	s.SaveTask(task)

	// Progress through lifecycle to failed
	task.Status = StatusAssigned
	task.Runner = "tmux"
	task.IRCName = "whip-" + task.ID
	task.ShellPID = 12345
	s.SaveTask(task)

	task.Status = StatusInProgress
	s.SaveTask(task)

	// Fail with a handoff note
	task.Status = StatusFailed
	task.AddNote("Auth module 80% done. Failed due to missing API key. Next agent: finish OAuth flow in auth.go")
	s.SaveTask(task)

	// Verify notes preserved
	loaded, _ := s.LoadTask(task.ID)
	if len(loaded.Notes) != 1 {
		t.Fatalf("Notes count = %d, want 1", len(loaded.Notes))
	}
	if loaded.Notes[0].Status != "failed" {
		t.Errorf("Note status = %q, want %q", loaded.Notes[0].Status, "failed")
	}

	// Retry
	if err := loaded.Retry(); err != nil {
		t.Fatalf("Retry: %v", err)
	}
	s.SaveTask(loaded)

	// Verify retry reset fields
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

	// Backend preserved across retry
	if retried.Backend != "claude" {
		t.Errorf("Backend = %q, want %q (should be preserved across retry)", retried.Backend, "claude")
	}

	// Notes preserved across retry
	if len(retried.Notes) != 1 {
		t.Fatalf("Notes count after retry = %d, want 1", len(retried.Notes))
	}
	if retried.Notes[0].Content != "Auth module 80% done. Failed due to missing API key. Next agent: finish OAuth flow in auth.go" {
		t.Errorf("Note content not preserved: %q", retried.Notes[0].Content)
	}

	// Retry on non-failed task should error
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
	// Legacy field should match last note
	if task.Note != "second progress update" {
		t.Errorf("Note = %q, want %q", task.Note, "second progress update")
	}
}

func TestFailedToCreatedTransition(t *testing.T) {
	task := NewTask("Test", "desc", "/tmp")
	task.Status = StatusFailed

	// failed → created: OK (retry)
	if err := task.ValidateTransition(StatusCreated); err != nil {
		t.Errorf("failed→created: %v", err)
	}

	// failed → assigned: not allowed directly
	if err := task.ValidateTransition(StatusAssigned); err == nil {
		t.Error("failed→assigned should fail")
	}
}

func TestSavePrompt(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Test", "desc", "/tmp")
	s.SaveTask(task)

	content := "Test prompt content"
	if err := s.SavePrompt(task.ID, content); err != nil {
		t.Fatalf("SavePrompt: %v", err)
	}

	data, err := os.ReadFile(s.PromptPath(task.ID))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(data) != content {
		t.Errorf("prompt = %q, want %q", string(data), content)
	}
}
