package whip

import (
	"strings"
	"testing"
)

func TestTaskArchiveability(t *testing.T) {
	done := NewTask("Done", "desc", "/tmp")
	done.Status = StatusCompleted

	blockedBy := NewTask("Blocked by active", "desc", "/tmp")
	blockedBy.Status = StatusCreated
	blockedBy.DependsOn = []string{done.ID}

	free := NewTask("Free", "desc", "/tmp")
	free.Status = StatusCanceled

	blockers := archiveDependencyBlockers([]*Task{done, blockedBy, free})

	archiveable, deps := taskArchiveability(done, blockers)
	if archiveable {
		t.Fatal("done task should not be archiveable while a non-terminal dependent references it")
	}
	if len(deps) != 1 || deps[0] != blockedBy.ID {
		t.Fatalf("blocked dependents = %v, want [%s]", deps, blockedBy.ID)
	}

	archiveable, deps = taskArchiveability(free, blockers)
	if !archiveable {
		t.Fatal("free terminal task should be archiveable")
	}
	if len(deps) != 0 {
		t.Fatalf("free task blockers = %v, want none", deps)
	}

	archiveable, _ = taskArchiveability(blockedBy, blockers)
	if archiveable {
		t.Fatal("non-terminal task should never be archiveable")
	}
}

func TestArchiveTaskRejectsNonTerminalTask(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Working", "desc", "/tmp")
	task.Status = StatusInProgress
	if err := s.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	err := s.ArchiveTask(task.ID)
	if err == nil {
		t.Fatal("ArchiveTask should reject a non-terminal task")
	}
	if !strings.Contains(err.Error(), "only completed or canceled tasks can be archived") {
		t.Fatalf("ArchiveTask error = %v, want non-terminal archive rejection", err)
	}
}

func TestArchiveTaskRejectsBlockedTerminalTask(t *testing.T) {
	s := tempStore(t)

	task := NewTask("Done", "desc", "/tmp")
	task.Status = StatusCompleted
	if err := s.SaveTask(task); err != nil {
		t.Fatalf("SaveTask task: %v", err)
	}

	dependent := NewTask("Dependent", "desc", "/tmp")
	dependent.Status = StatusCreated
	dependent.DependsOn = []string{task.ID}
	if err := s.SaveTask(dependent); err != nil {
		t.Fatalf("SaveTask dependent: %v", err)
	}

	err := s.ArchiveTask(task.ID)
	if err == nil {
		t.Fatal("ArchiveTask should reject a blocked terminal task")
	}
	if !strings.Contains(err.Error(), "non-terminal dependents still reference it") {
		t.Fatalf("ArchiveTask error = %v, want dependency rejection", err)
	}
	if !strings.Contains(err.Error(), dependent.ID) {
		t.Fatalf("ArchiveTask error = %v, want dependent id %s", err, dependent.ID)
	}
}

func TestArchiveTaskRejectsArchivedTask(t *testing.T) {
	s := tempStore(t)

	task := NewTask("Archived", "desc", "/tmp")
	task.Status = StatusCompleted
	if err := s.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}
	if err := s.archiveTask(task.ID); err != nil {
		t.Fatalf("archiveTask: %v", err)
	}

	err := s.ArchiveTask(task.ID)
	if err == nil {
		t.Fatal("ArchiveTask should reject an already archived task")
	}
	if !strings.Contains(err.Error(), "already archived") {
		t.Fatalf("ArchiveTask error = %v, want already archived", err)
	}
}

func TestDeleteArchivedTask(t *testing.T) {
	s := tempStore(t)

	task := NewTask("Archived", "desc", "/tmp")
	task.Status = StatusCompleted
	if err := s.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}
	if err := s.archiveTask(task.ID); err != nil {
		t.Fatalf("archiveTask: %v", err)
	}

	if err := s.DeleteArchivedTask(task.ID); err != nil {
		t.Fatalf("DeleteArchivedTask: %v", err)
	}
	if _, err := s.LoadArchivedTask(task.ID); err == nil {
		t.Fatal("LoadArchivedTask should fail after archived delete")
	}
}

func TestDeleteArchivedTaskRejectsActiveTask(t *testing.T) {
	s := tempStore(t)

	task := NewTask("Active", "desc", "/tmp")
	task.Status = StatusCompleted
	if err := s.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	err := s.DeleteArchivedTask(task.ID)
	if err == nil {
		t.Fatal("DeleteArchivedTask should reject an active task")
	}
	if !strings.Contains(err.Error(), "archive it before deleting") {
		t.Fatalf("DeleteArchivedTask error = %v, want active-task rejection", err)
	}
}

func TestCleanTerminalArchivesTasks(t *testing.T) {
	s := tempStore(t)

	active := NewTask("Active", "desc", "/tmp")
	active.Status = StatusInProgress
	if err := s.SaveTask(active); err != nil {
		t.Fatalf("SaveTask active: %v", err)
	}

	done := NewTask("Done", "desc", "/tmp")
	done.Status = StatusCompleted
	if err := s.SaveTask(done); err != nil {
		t.Fatalf("SaveTask done: %v", err)
	}

	canceled := NewTask("Canceled", "desc", "/tmp")
	canceled.Status = StatusCanceled
	if err := s.SaveTask(canceled); err != nil {
		t.Fatalf("SaveTask canceled: %v", err)
	}

	count, err := s.CleanTerminal()
	if err != nil {
		t.Fatalf("CleanTerminal: %v", err)
	}
	if count != 2 {
		t.Fatalf("CleanTerminal count = %d, want 2", count)
	}

	if _, err := s.LoadArchivedTask(done.ID); err != nil {
		t.Fatalf("LoadArchivedTask done: %v", err)
	}
	if _, err := s.LoadArchivedTask(canceled.ID); err != nil {
		t.Fatalf("LoadArchivedTask canceled: %v", err)
	}
	tasks, err := s.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(tasks) != 1 || tasks[0].ID != active.ID {
		t.Fatalf("active tasks after clean = %v, want only %s", taskIDs(tasks), active.ID)
	}
}

func taskIDs(tasks []*Task) []string {
	ids := make([]string, 0, len(tasks))
	for _, task := range tasks {
		ids = append(ids, task.ID)
	}
	return ids
}
