package whip

import (
	"strings"
	"testing"
)

func TestSaveTaskRejectsCrossWorkspaceDependency(t *testing.T) {
	s := tempStore(t)

	dependency := NewTask("Dependency", "desc", "/tmp")
	dependency.Workspace = "lane-a"
	if err := s.SaveTask(dependency); err != nil {
		t.Fatalf("SaveTask dependency: %v", err)
	}

	task := NewTask("Task", "desc", "/tmp")
	task.Workspace = "lane-b"
	task.DependsOn = []string{dependency.ID}
	err := s.SaveTask(task)
	if err == nil {
		t.Fatal("SaveTask should reject cross-workspace dependency")
	}
	if !strings.Contains(err.Error(), "cross-workspace dependencies are not allowed") {
		t.Fatalf("SaveTask error = %v, want cross-workspace rejection", err)
	}
}

func TestSaveTaskRejectsCrossWorkspaceArchivedDependency(t *testing.T) {
	s := tempStore(t)

	dependency := NewTask("Dependency", "desc", "/tmp")
	dependency.Workspace = "lane-a"
	dependency.Status = StatusCompleted
	if err := s.SaveTask(dependency); err != nil {
		t.Fatalf("SaveTask dependency: %v", err)
	}
	if err := s.archiveTask(dependency.ID); err != nil {
		t.Fatalf("archiveTask dependency: %v", err)
	}

	task := NewTask("Task", "desc", "/tmp")
	task.Workspace = "lane-b"
	task.DependsOn = []string{dependency.ID}
	err := s.SaveTask(task)
	if err == nil {
		t.Fatal("SaveTask should reject cross-workspace archived dependency")
	}
	if !strings.Contains(err.Error(), "cross-workspace dependencies are not allowed") {
		t.Fatalf("SaveTask error = %v, want cross-workspace rejection", err)
	}
}
