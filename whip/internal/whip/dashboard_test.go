package whip

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestUpdateTmux_EnterWithDeadSession(t *testing.T) {
	store := tempStore(t)
	task := NewTask("Test", "desc", "/tmp")
	task.Runner = "tmux"
	store.SaveTask(task)

	m := NewDashboardModel(store, "test")
	m.selectedTask = task
	m.view = viewTmux

	// Simulate pressing enter — tmux session doesn't exist
	model, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("enter")})

	// Enter key is actually sent as individual runes, use the string-based approach
	model, cmd = m.Update(tea.KeyMsg{Type: tea.KeyEnter})

	dm := model.(DashboardModel)
	if dm.PendingAttach() != "" {
		t.Error("pendingAttach should be empty when tmux session is dead")
	}
	if cmd != nil {
		// Should not return tea.Quit
		t.Error("should not return a command when tmux session is dead")
	}
}

func TestUpdateDetail_AttachKeyWithDeadSession(t *testing.T) {
	store := tempStore(t)
	task := NewTask("Test", "desc", "/tmp")
	task.Runner = "tmux"
	store.SaveTask(task)

	m := NewDashboardModel(store, "test")
	m.selectedTask = task
	m.view = viewDetail

	// Press 'a' — tmux session doesn't exist, should stay in detail view
	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'a'}})

	dm := model.(DashboardModel)
	if dm.view != viewDetail {
		t.Error("should stay in detail view when tmux session is dead")
	}
}

func TestDetailScroll(t *testing.T) {
	store := tempStore(t)
	task := NewTask("Test", "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10", "/tmp")
	store.SaveTask(task)

	m := NewDashboardModel(store, "test")
	m.selectedTask = task
	m.view = viewDetail
	m.height = 20
	m.detailScroll = 0

	// Scroll down
	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	dm := model.(DashboardModel)
	if dm.detailScroll != 1 {
		t.Errorf("expected detailScroll=1, got %d", dm.detailScroll)
	}

	// Scroll up
	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	dm = model.(DashboardModel)
	if dm.detailScroll != 0 {
		t.Errorf("expected detailScroll=0, got %d", dm.detailScroll)
	}

	// Scroll up at 0 stays at 0
	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	dm = model.(DashboardModel)
	if dm.detailScroll != 0 {
		t.Errorf("expected detailScroll=0, got %d", dm.detailScroll)
	}
}

func TestDetailScrollBound(t *testing.T) {
	store := tempStore(t)
	// 30 lines of description
	lines := "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n" +
		"line11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20\n" +
		"line21\nline22\nline23\nline24\nline25\nline26\nline27\nline28\nline29\nline30"
	task := NewTask("Test", lines, "/tmp")
	store.SaveTask(task)

	m := NewDashboardModel(store, "test")
	m.selectedTask = task
	m.view = viewDetail
	m.height = 40 // small viewport so description needs scrolling

	maxScroll := m.detailMaxScroll()
	if maxScroll <= 0 {
		t.Fatal("expected maxScroll > 0 for 30-line description in small viewport")
	}

	// Scroll down many times past maxScroll
	dm := m
	for i := 0; i < maxScroll+10; i++ {
		model, _ := dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
		dm = model.(DashboardModel)
	}

	if dm.detailScroll != maxScroll {
		t.Errorf("expected detailScroll clamped at %d, got %d", maxScroll, dm.detailScroll)
	}

	// Now scroll up once — should immediately decrease
	model, _ := dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	dm = model.(DashboardModel)
	if dm.detailScroll != maxScroll-1 {
		t.Errorf("expected detailScroll=%d after one up, got %d", maxScroll-1, dm.detailScroll)
	}
}

func TestDetailScrollResetOnEnter(t *testing.T) {
	store := tempStore(t)
	task := NewTask("Test", "desc", "/tmp")
	store.SaveTask(task)

	m := NewDashboardModel(store, "test")
	m.tasks = []*Task{task}
	m.cursor = 0
	m.detailScroll = 5
	m.view = viewList

	// Press enter to go to detail
	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	dm := model.(DashboardModel)
	if dm.detailScroll != 0 {
		t.Errorf("expected detailScroll reset to 0, got %d", dm.detailScroll)
	}
}
