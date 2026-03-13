package whip

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestDashboardTabSwitchesBetweenActiveAndArchivedLists(t *testing.T) {
	store := tempStore(t)

	active := NewTask("Active", "desc", "/tmp")
	if err := store.SaveTask(active); err != nil {
		t.Fatalf("SaveTask active: %v", err)
	}

	archived := NewTask("Archived", "desc", "/tmp")
	archived.Status = StatusCompleted
	if err := store.SaveTask(archived); err != nil {
		t.Fatalf("SaveTask archived: %v", err)
	}
	if err := store.archiveTask(archived.ID); err != nil {
		t.Fatalf("archiveTask: %v", err)
	}

	m := NewDashboardModel(store, "test")
	m.listMode = listModeActive
	m.tasks = []*Task{active}
	m.view = viewList

	model, cmd := m.Update(tea.KeyMsg{Type: tea.KeyTab})
	dm := model.(DashboardModel)
	if dm.listMode != listModeArchived {
		t.Fatalf("listMode = %v, want archived", dm.listMode)
	}
	if cmd == nil {
		t.Fatal("tab should trigger a reload command")
	}

	msg := cmd()
	model, _ = dm.Update(msg)
	dm = model.(DashboardModel)
	if len(dm.tasks) != 1 || dm.tasks[0].ID != archived.ID {
		t.Fatalf("archived list tasks = %v, want [%s]", taskIDs(dm.tasks), archived.ID)
	}
}

func TestDashboardListFooterGatesModeSpecificActions(t *testing.T) {
	store := tempStore(t)
	task := NewTask("Archived", "desc", "/tmp")

	activeModel := NewDashboardModel(store, "test")
	activeModel.listMode = listModeActive
	activeModel.tasks = []*Task{task}
	activeFooter := activeModel.renderListFooter()
	if !strings.Contains(activeFooter, "c clean") {
		t.Fatalf("active footer missing clean action: %s", activeFooter)
	}
	if strings.Contains(activeFooter, "d delete") {
		t.Fatalf("active footer should not show delete: %s", activeFooter)
	}
	if !strings.Contains(activeFooter, "tab archived") {
		t.Fatalf("active footer missing archived toggle: %s", activeFooter)
	}

	archivedModel := NewDashboardModel(store, "test")
	archivedModel.listMode = listModeArchived
	archivedModel.tasks = []*Task{task}
	archivedFooter := archivedModel.renderListFooter()
	if strings.Contains(archivedFooter, "c clean") {
		t.Fatalf("archived footer should not show clean: %s", archivedFooter)
	}
	if !strings.Contains(archivedFooter, "d delete") {
		t.Fatalf("archived footer missing delete action: %s", archivedFooter)
	}
	if !strings.Contains(archivedFooter, "tab active") {
		t.Fatalf("archived footer missing active toggle: %s", archivedFooter)
	}
}

func TestDashboardDetailFooterGatesArchiveAndDelete(t *testing.T) {
	store := tempStore(t)

	activeTask := NewTask("Done", "desc", "/tmp")
	activeTask.Status = StatusCompleted
	activeModel := NewDashboardModel(store, "test")
	activeModel.listMode = listModeActive
	activeModel.view = viewDetail
	activeModel.selectedTask = activeTask
	activeModel.archiveableTasks[activeTask.ID] = true
	activeFooter := activeModel.renderDetailFooter()
	if !strings.Contains(activeFooter, "a archive") {
		t.Fatalf("active detail footer missing archive action: %s", activeFooter)
	}
	if strings.Contains(activeFooter, "d delete") {
		t.Fatalf("active detail footer should not show delete: %s", activeFooter)
	}

	archivedTask := NewTask("Archived", "desc", "/tmp")
	archivedTask.Status = StatusCompleted
	archivedModel := NewDashboardModel(store, "test")
	archivedModel.listMode = listModeArchived
	archivedModel.view = viewDetail
	archivedModel.selectedTask = archivedTask
	archivedFooter := archivedModel.renderDetailFooter()
	if strings.Contains(archivedFooter, "a archive") {
		t.Fatalf("archived detail footer should not show archive: %s", archivedFooter)
	}
	if !strings.Contains(archivedFooter, "d delete") {
		t.Fatalf("archived detail footer missing delete action: %s", archivedFooter)
	}
}

func TestDashboardDetailArchiveKeyArchivesTask(t *testing.T) {
	store := tempStore(t)

	task := NewTask("Done", "desc", "/tmp")
	task.Status = StatusCompleted
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}

	m := NewDashboardModel(store, "test")
	m.listMode = listModeActive
	m.view = viewDetail
	m.selectedTask = task
	m.archiveableTasks[task.ID] = true

	model, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'a'}})
	if cmd == nil {
		t.Fatal("archive key should return a command")
	}

	dm := model.(DashboardModel)
	model, cmd = dm.Update(cmd())
	dm = model.(DashboardModel)
	if cmd == nil {
		t.Fatal("archive result should trigger a reload command")
	}
	model, _ = dm.Update(cmd())
	dm = model.(DashboardModel)

	if dm.view != viewList {
		t.Fatalf("view = %v, want list after archive", dm.view)
	}
	if _, err := store.LoadArchivedTask(task.ID); err != nil {
		t.Fatalf("LoadArchivedTask: %v", err)
	}
}

func TestDashboardArchivedDetailDeleteKeyDeletesTask(t *testing.T) {
	store := tempStore(t)

	task := NewTask("Archived", "desc", "/tmp")
	task.Status = StatusCompleted
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}
	if err := store.archiveTask(task.ID); err != nil {
		t.Fatalf("archiveTask: %v", err)
	}

	m := NewDashboardModel(store, "test")
	m.listMode = listModeArchived
	m.view = viewDetail
	m.selectedTask = task

	model, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'d'}})
	if cmd == nil {
		t.Fatal("delete key should return a command")
	}

	dm := model.(DashboardModel)
	model, cmd = dm.Update(cmd())
	dm = model.(DashboardModel)
	if cmd == nil {
		t.Fatal("delete result should trigger a reload command")
	}
	model, _ = dm.Update(cmd())
	dm = model.(DashboardModel)

	if dm.view != viewList {
		t.Fatalf("view = %v, want list after delete", dm.view)
	}
	if _, err := store.LoadArchivedTask(task.ID); err == nil {
		t.Fatal("archived task should be deleted")
	}
	if dm.listMode != listModeArchived {
		t.Fatalf("listMode = %v, want archived after delete", dm.listMode)
	}
}

func TestDashboardArchivedDetailBackReturnsToArchivedList(t *testing.T) {
	store := tempStore(t)
	task := NewTask("Archived", "desc", "/tmp")

	m := NewDashboardModel(store, "test")
	m.listMode = listModeArchived
	m.view = viewDetail
	m.selectedTask = task

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	dm := model.(DashboardModel)
	if dm.view != viewList {
		t.Fatalf("view = %v, want list", dm.view)
	}
	if dm.listMode != listModeArchived {
		t.Fatalf("listMode = %v, want archived", dm.listMode)
	}
}
