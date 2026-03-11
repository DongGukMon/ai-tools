package whip

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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

	id, err := s.ResolveID(task.ID)
	if err != nil {
		t.Fatalf("ResolveID exact: %v", err)
	}
	if id != task.ID {
		t.Errorf("ResolveID = %q, want %q", id, task.ID)
	}

	id, err = s.ResolveID(task.ID[:3])
	if err != nil {
		t.Fatalf("ResolveID prefix: %v", err)
	}
	if id != task.ID {
		t.Errorf("ResolveID prefix = %q, want %q", id, task.ID)
	}

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

	t3 := NewTask("Canceled", "desc", "/tmp")
	t3.Status = StatusCanceled
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

	t2.Status = StatusCompleted
	s.SaveTask(t2)

	met, _, err = s.AreDependenciesMet(t3)
	if err != nil {
		t.Fatalf("AreDependenciesMet: %v", err)
	}
	if !met {
		t.Error("should be met")
	}

	deps, err := s.GetDependents(t1.ID)
	if err != nil {
		t.Fatalf("GetDependents: %v", err)
	}
	if len(deps) != 1 || deps[0].ID != t3.ID {
		t.Errorf("dependents = %v, want [%s]", deps, t3.ID)
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

func TestSaveTaskAndPrompt_UsePrivatePermissions(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Secure Task", "desc", "/tmp")

	if err := s.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	taskDir := filepath.Join(s.BaseDir, tasksDir, task.ID)
	assertMode(t, taskDir, privateDirPerm)
	assertMode(t, filepath.Join(taskDir, taskFile), privateFilePerm)

	if err := s.SavePrompt(task.ID, "secure prompt"); err != nil {
		t.Fatalf("SavePrompt: %v", err)
	}
	assertMode(t, s.PromptPath(task.ID), privateFilePerm)
}

func TestSaveTask_UsesLegacyGlobalPathByDefault(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Global Task", "desc", "/tmp")

	if err := s.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	if _, err := os.Stat(filepath.Join(s.BaseDir, tasksDir, task.ID, taskFile)); err != nil {
		t.Fatalf("expected legacy global path: %v", err)
	}
}

func TestSaveTask_UsesWorkspaceNamespace(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Workspace Task", "desc", "/tmp")
	task.Workspace = "issue-sweep"

	if err := s.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	taskPath := filepath.Join(s.BaseDir, workspacesDir, "issue-sweep", tasksDir, task.ID, taskFile)
	if _, err := os.Stat(taskPath); err != nil {
		t.Fatalf("expected workspace task path: %v", err)
	}

	promptContent := "workspace prompt"
	if err := s.SavePrompt(task.ID, promptContent); err != nil {
		t.Fatalf("SavePrompt: %v", err)
	}

	promptPath := filepath.Join(s.BaseDir, workspacesDir, "issue-sweep", tasksDir, task.ID, promptFile)
	data, err := os.ReadFile(promptPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(data) != promptContent {
		t.Fatalf("prompt = %q, want %q", string(data), promptContent)
	}
}

func TestSaveTask_InvalidStatusFails(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Invalid Status", "desc", "/tmp")
	task.Status = TaskStatus("approved_pending_finalize")

	err := s.SaveTask(task)
	if err == nil {
		t.Fatal("SaveTask should fail for an invalid status")
	}
	if !strings.Contains(err.Error(), "invalid task status") {
		t.Fatalf("SaveTask error = %v, want invalid task status", err)
	}
}

func TestLoadTask_InvalidStatusFails(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Legacy Status", "desc", "/tmp")

	dir := filepath.Join(s.BaseDir, tasksDir, task.ID)
	if err := os.MkdirAll(dir, privateDirPerm); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}

	payload := map[string]any{
		"id":          task.ID,
		"title":       task.Title,
		"description": task.Description,
		"cwd":         task.CWD,
		"status":      "approved_pending_finalize",
		"created_at":  task.CreatedAt,
		"updated_at":  task.UpdatedAt,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, taskFile), data, privateFilePerm); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	_, err = s.LoadTask(task.ID)
	if err == nil {
		t.Fatal("LoadTask should fail for an invalid status")
	}
	if !strings.Contains(err.Error(), `invalid status "approved_pending_finalize"`) {
		t.Fatalf("LoadTask error = %v, want invalid legacy status", err)
	}
}

func TestCleanTerminal_SkipsReferencedByNonTerminal(t *testing.T) {
	s := tempStore(t)

	// a: completed, b: in_progress, c: in_progress
	a := NewTask("A", "dep a", "/tmp")
	a.Status = StatusCompleted
	s.SaveTask(a)

	b := NewTask("B", "dep b", "/tmp")
	b.Status = StatusInProgress
	s.SaveTask(b)

	c := NewTask("C", "dep c", "/tmp")
	c.Status = StatusInProgress
	s.SaveTask(c)

	// x depends on a, b, c — still in_progress
	x := NewTask("X", "depends on a,b,c", "/tmp")
	x.DependsOn = []string{a.ID, b.ID, c.ID}
	x.Status = StatusCreated
	s.SaveTask(x)

	// Clean should NOT delete a because x (non-terminal) references it.
	count, err := s.CleanTerminal()
	if err != nil {
		t.Fatalf("CleanTerminal: %v", err)
	}
	if count != 0 {
		t.Errorf("count = %d, want 0 (a is still referenced)", count)
	}

	// a should still exist
	if _, err := s.LoadTask(a.ID); err != nil {
		t.Fatalf("a should still exist: %v", err)
	}
}

func TestCleanTerminal_DeletesUnreferencedTerminal(t *testing.T) {
	s := tempStore(t)

	// a: completed, b: completed — both unreferenced
	a := NewTask("A", "done", "/tmp")
	a.Status = StatusCompleted
	s.SaveTask(a)

	b := NewTask("B", "canceled", "/tmp")
	b.Status = StatusCanceled
	s.SaveTask(b)

	// x depends on a, b — but x is also completed (terminal)
	x := NewTask("X", "also done", "/tmp")
	x.DependsOn = []string{a.ID, b.ID}
	x.Status = StatusCompleted
	s.SaveTask(x)

	// All are terminal and only referenced by another terminal task — all should be cleaned.
	count, err := s.CleanTerminal()
	if err != nil {
		t.Fatalf("CleanTerminal: %v", err)
	}
	if count != 3 {
		t.Errorf("count = %d, want 3", count)
	}

	tasks, _ := s.ListTasks()
	if len(tasks) != 0 {
		t.Errorf("remaining = %d, want 0", len(tasks))
	}
}

func TestAreDependenciesMet_CleanedDepTreatedAsMet(t *testing.T) {
	s := tempStore(t)

	// a existed and was cleaned (not in store), b is completed
	b := NewTask("B", "done", "/tmp")
	b.Status = StatusCompleted
	s.SaveTask(b)

	x := NewTask("X", "depends on cleaned a and b", "/tmp")
	x.DependsOn = []string{"nonexistent-cleaned-id", b.ID}
	s.SaveTask(x)

	met, unmet, err := s.AreDependenciesMet(x)
	if err != nil {
		t.Fatalf("AreDependenciesMet: %v", err)
	}
	if !met {
		t.Errorf("should be met, unmet = %v", unmet)
	}
}

func TestArchiveTask(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Archive Me", "desc", "/tmp")
	task.Status = StatusCompleted
	s.SaveTask(task)

	if err := s.ArchiveTask(task.ID); err != nil {
		t.Fatalf("ArchiveTask: %v", err)
	}

	// Should no longer be found in active tasks
	_, err := s.LoadTask(task.ID)
	if err == nil {
		t.Error("LoadTask should fail after archive")
	}

	// Should be loadable from archive
	archived, err := s.LoadArchivedTask(task.ID)
	if err != nil {
		t.Fatalf("LoadArchivedTask: %v", err)
	}
	if archived.Title != "Archive Me" {
		t.Errorf("Title = %q, want %q", archived.Title, "Archive Me")
	}
}

func TestArchiveTerminal(t *testing.T) {
	s := tempStore(t)

	t1 := NewTask("Active", "desc", "/tmp")
	t1.Status = StatusInProgress
	s.SaveTask(t1)

	t2 := NewTask("Done", "desc", "/tmp")
	t2.Status = StatusCompleted
	s.SaveTask(t2)

	t3 := NewTask("Canceled", "desc", "/tmp")
	t3.Status = StatusCanceled
	s.SaveTask(t3)

	count, err := s.ArchiveTerminal()
	if err != nil {
		t.Fatalf("ArchiveTerminal: %v", err)
	}
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}

	// Active task still in list
	tasks, _ := s.ListTasks()
	if len(tasks) != 1 {
		t.Errorf("remaining tasks = %d, want 1", len(tasks))
	}

	// Archived tasks should be in archive
	archived, _ := s.ListArchivedTasks()
	if len(archived) != 2 {
		t.Errorf("archived tasks = %d, want 2", len(archived))
	}
}

func TestArchiveTerminal_SkipsReferencedByNonTerminal(t *testing.T) {
	s := tempStore(t)

	a := NewTask("A", "dep a", "/tmp")
	a.Status = StatusCompleted
	s.SaveTask(a)

	b := NewTask("B", "dep b", "/tmp")
	b.Status = StatusInProgress
	s.SaveTask(b)

	// x depends on a — still non-terminal
	x := NewTask("X", "depends on a", "/tmp")
	x.DependsOn = []string{a.ID}
	x.Status = StatusCreated
	s.SaveTask(x)

	count, err := s.ArchiveTerminal()
	if err != nil {
		t.Fatalf("ArchiveTerminal: %v", err)
	}
	if count != 0 {
		t.Errorf("count = %d, want 0 (a is still referenced)", count)
	}

	// a should still exist in active store
	if _, err := s.LoadTask(a.ID); err != nil {
		t.Fatalf("a should still exist: %v", err)
	}
}

func TestListArchivedTasks(t *testing.T) {
	s := tempStore(t)

	t1 := NewTask("First", "desc", "/tmp")
	t1.Status = StatusCompleted
	s.SaveTask(t1)

	t2 := NewTask("Second", "desc", "/tmp")
	t2.Status = StatusCanceled
	s.SaveTask(t2)

	s.ArchiveTask(t1.ID)
	s.ArchiveTask(t2.ID)

	tasks, err := s.ListArchivedTasks()
	if err != nil {
		t.Fatalf("ListArchivedTasks: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("len(tasks) = %d, want 2", len(tasks))
	}
}

func TestLoadArchivedTask(t *testing.T) {
	s := tempStore(t)

	task := NewTask("Load Me", "desc", "/tmp")
	task.Status = StatusCompleted
	s.SaveTask(task)

	s.ArchiveTask(task.ID)

	loaded, err := s.LoadArchivedTask(task.ID)
	if err != nil {
		t.Fatalf("LoadArchivedTask: %v", err)
	}
	if loaded.Title != "Load Me" {
		t.Errorf("Title = %q, want %q", loaded.Title, "Load Me")
	}
	if loaded.Status != StatusCompleted {
		t.Errorf("Status = %q, want %q", loaded.Status, StatusCompleted)
	}

	// Not found case
	_, err = s.LoadArchivedTask("nonexistent")
	if err == nil {
		t.Error("LoadArchivedTask should fail for nonexistent id")
	}
}

func TestCleanThenAssign_RegressionScenario(t *testing.T) {
	s := tempStore(t)

	// Setup: a(completed), b(in_progress), c(in_progress), x depends on all three
	a := NewTask("A", "done early", "/tmp")
	a.Status = StatusCompleted
	s.SaveTask(a)

	b := NewTask("B", "still working", "/tmp")
	b.Status = StatusInProgress
	s.SaveTask(b)

	c := NewTask("C", "still working", "/tmp")
	c.Status = StatusInProgress
	s.SaveTask(c)

	x := NewTask("X", "blocked", "/tmp")
	x.DependsOn = []string{a.ID, b.ID, c.ID}
	x.Status = StatusCreated
	s.SaveTask(x)

	// Step 1: clean — a should be protected
	count, _ := s.CleanTerminal()
	if count != 0 {
		t.Fatalf("clean should not delete referenced a, got count=%d", count)
	}

	// Step 2: b and c complete
	b.Status = StatusCompleted
	s.SaveTask(b)
	c.Status = StatusCompleted
	s.SaveTask(c)

	// Step 3: x's dependencies should all be met
	met, unmet, err := s.AreDependenciesMet(x)
	if err != nil {
		t.Fatalf("AreDependenciesMet: %v", err)
	}
	if !met {
		t.Errorf("all deps completed, should be met, unmet = %v", unmet)
	}

	// Step 4: clean again — now a, b, c are all terminal and x is the only non-terminal
	// a, b, c are all referenced by x (non-terminal) so they should stay
	count2, _ := s.CleanTerminal()
	if count2 != 0 {
		t.Fatalf("clean should still protect a,b,c referenced by x, got count=%d", count2)
	}

	// Step 5: x becomes completed too
	x.Status = StatusCompleted
	s.SaveTask(x)

	// Now all terminal, x references a,b,c but x itself is terminal — all should clean
	count3, _ := s.CleanTerminal()
	if count3 != 4 {
		t.Fatalf("all terminal, count = %d, want 4", count3)
	}
}
