package main

import (
	"strings"
	"testing"

	whiplib "github.com/bang9/ai-tools/whip/internal/whip"
)

func TestTaskArchiveAndDeleteSemantics(t *testing.T) {
	h := newSkillFlowHarness(t)

	ready := whiplib.NewTask("Ready", "desc", "/tmp")
	ready.Status = whiplib.StatusCompleted
	if err := h.store.SaveTask(ready); err != nil {
		t.Fatalf("SaveTask ready: %v", err)
	}

	blocked := whiplib.NewTask("Blocked", "desc", "/tmp")
	blocked.Status = whiplib.StatusCanceled
	if err := h.store.SaveTask(blocked); err != nil {
		t.Fatalf("SaveTask blocked: %v", err)
	}

	dependent := whiplib.NewTask("Dependent", "desc", "/tmp")
	dependent.Status = whiplib.StatusCreated
	dependent.DependsOn = []string{blocked.ID}
	if err := h.store.SaveTask(dependent); err != nil {
		t.Fatalf("SaveTask dependent: %v", err)
	}

	active := whiplib.NewTask("Active", "desc", "/tmp")
	active.Status = whiplib.StatusInProgress
	if err := h.store.SaveTask(active); err != nil {
		t.Fatalf("SaveTask active: %v", err)
	}

	_, stderr, err := execWhipCLICapture(t, "task", "archive", ready.ID)
	if err != nil {
		t.Fatalf("task archive ready: %v", err)
	}
	if !strings.Contains(stderr, "Archived task "+ready.ID) {
		t.Fatalf("archive stderr = %q, want archived task line", stderr)
	}
	if _, err := h.store.LoadArchivedTask(ready.ID); err != nil {
		t.Fatalf("LoadArchivedTask ready: %v", err)
	}

	listArchive, _, err := execWhipCLICapture(t, "task", "list", "--archive")
	if err != nil {
		t.Fatalf("task list --archive: %v", err)
	}
	if !strings.Contains(listArchive, ready.ID) {
		t.Fatalf("task list --archive missing archived task:\n%s", listArchive)
	}

	viewArchive, _, err := execWhipCLICapture(t, "task", "view", ready.ID)
	if err != nil {
		t.Fatalf("task view archived: %v", err)
	}
	if !strings.Contains(viewArchive, "(archived)") {
		t.Fatalf("task view should mark archived tasks:\n%s", viewArchive)
	}

	_, _, err = execWhipCLICapture(t, "task", "archive", ready.ID)
	if err == nil || !strings.Contains(err.Error(), "already archived") {
		t.Fatalf("task archive archived task error = %v, want already archived", err)
	}

	_, _, err = execWhipCLICapture(t, "task", "archive", active.ID)
	if err == nil || !strings.Contains(err.Error(), "only completed or canceled tasks can be archived") {
		t.Fatalf("task archive active task error = %v, want terminal-task rejection", err)
	}

	_, _, err = execWhipCLICapture(t, "task", "archive", blocked.ID)
	if err == nil || !strings.Contains(err.Error(), "non-terminal dependents still reference it") {
		t.Fatalf("task archive blocked task error = %v, want dependency rejection", err)
	}

	_, _, err = execWhipCLICapture(t, "task", "delete", active.ID)
	if err == nil || !strings.Contains(err.Error(), "archive it before deleting") {
		t.Fatalf("task delete active task error = %v, want archived-only rejection", err)
	}

	_, stderr, err = execWhipCLICapture(t, "task", "delete", ready.ID)
	if err != nil {
		t.Fatalf("task delete archived task: %v", err)
	}
	if !strings.Contains(stderr, "Deleted archived task "+ready.ID) {
		t.Fatalf("delete stderr = %q, want deleted archived task line", stderr)
	}
	if _, err := h.store.LoadArchivedTask(ready.ID); err == nil {
		t.Fatal("archived task should be deleted")
	}
}

func TestTaskCleanArchivesArchiveableTasks(t *testing.T) {
	h := newSkillFlowHarness(t)

	free := whiplib.NewTask("Free", "desc", "/tmp")
	free.Status = whiplib.StatusCompleted
	if err := h.store.SaveTask(free); err != nil {
		t.Fatalf("SaveTask free: %v", err)
	}

	protected := whiplib.NewTask("Protected", "desc", "/tmp")
	protected.Status = whiplib.StatusCanceled
	if err := h.store.SaveTask(protected); err != nil {
		t.Fatalf("SaveTask protected: %v", err)
	}

	dependent := whiplib.NewTask("Dependent", "desc", "/tmp")
	dependent.Status = whiplib.StatusCreated
	dependent.DependsOn = []string{protected.ID}
	if err := h.store.SaveTask(dependent); err != nil {
		t.Fatalf("SaveTask dependent: %v", err)
	}

	_, stderr, err := execWhipCLICapture(t, "task", "clean")
	if err != nil {
		t.Fatalf("task clean: %v", err)
	}
	if !strings.Contains(stderr, "Archived 1 task(s)") {
		t.Fatalf("clean stderr = %q, want archived count", stderr)
	}

	if _, err := h.store.LoadArchivedTask(free.ID); err != nil {
		t.Fatalf("LoadArchivedTask free: %v", err)
	}
	if _, err := h.store.LoadTask(protected.ID); err != nil {
		t.Fatalf("LoadTask protected: %v", err)
	}

	archiveList, _, err := execWhipCLICapture(t, "task", "list", "--archive")
	if err != nil {
		t.Fatalf("task list --archive: %v", err)
	}
	if !strings.Contains(archiveList, free.ID) {
		t.Fatalf("task list --archive missing cleaned task:\n%s", archiveList)
	}
}

func TestTaskOperationHelpText(t *testing.T) {
	archiveHelp, _, err := execWhipCLICapture(t, "task", "archive", "--help")
	if err != nil {
		t.Fatalf("task archive --help: %v", err)
	}
	if !strings.Contains(archiveHelp, "Archive one completed or canceled active task") {
		t.Fatalf("archive help missing updated summary:\n%s", archiveHelp)
	}

	cleanHelp, _, err := execWhipCLICapture(t, "task", "clean", "--help")
	if err != nil {
		t.Fatalf("task clean --help: %v", err)
	}
	if !strings.Contains(cleanHelp, "Archive all archiveable completed and canceled tasks") {
		t.Fatalf("clean help missing updated summary:\n%s", cleanHelp)
	}

	deleteHelp, _, err := execWhipCLICapture(t, "task", "delete", "--help")
	if err != nil {
		t.Fatalf("task delete --help: %v", err)
	}
	if !strings.Contains(deleteHelp, "Permanently delete an archived task") {
		t.Fatalf("delete help missing updated summary:\n%s", deleteHelp)
	}
}
