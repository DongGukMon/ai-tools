package whip

import (
	"os/exec"
	"testing"
	"time"

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

	model, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("enter")})
	model, cmd = m.Update(tea.KeyMsg{Type: tea.KeyEnter})

	dm := model.(DashboardModel)
	if dm.PendingAttach() != "" {
		t.Error("pendingAttach should be empty when tmux session is dead")
	}
	if cmd != nil {
		t.Error("should not return a command when tmux session is dead")
	}
}

func TestUpdateTmux_EnterQueuesSessionName(t *testing.T) {
	if _, err := exec.LookPath("tmux"); err != nil {
		t.Skip("tmux not installed")
	}

	store := tempStore(t)
	task := NewTask("Test", "desc", "/tmp")
	task.Runner = "tmux"
	store.SaveTask(task)

	sessionName := tmuxSessionName(task.ID)
	if err := SpawnTmuxSession(sessionName, "sleep 30"); err != nil {
		t.Fatalf("SpawnTmuxSession: %v", err)
	}
	defer KillTmuxSessionName(sessionName)

	m := NewDashboardModel(store, "test")
	m.selectedTask = task
	m.view = viewTmux

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	dm := model.(DashboardModel)
	if dm.PendingAttach() != sessionName {
		t.Fatalf("pendingAttach = %q, want %q", dm.PendingAttach(), sessionName)
	}
}

func TestUpdateDetail_TmuxKeyWithDeadSession(t *testing.T) {
	store := tempStore(t)
	task := NewTask("Test", "desc", "/tmp")
	task.Runner = "tmux"
	store.SaveTask(task)

	m := NewDashboardModel(store, "test")
	m.selectedTask = task
	m.view = viewDetail

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'t'}})

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

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	dm := model.(DashboardModel)
	if dm.detailScroll != 1 {
		t.Errorf("expected detailScroll=1, got %d", dm.detailScroll)
	}

	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	dm = model.(DashboardModel)
	if dm.detailScroll != 0 {
		t.Errorf("expected detailScroll=0, got %d", dm.detailScroll)
	}

	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	dm = model.(DashboardModel)
	if dm.detailScroll != 0 {
		t.Errorf("expected detailScroll=0, got %d", dm.detailScroll)
	}
}

func TestDetailScrollBound(t *testing.T) {
	store := tempStore(t)
	lines := "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n" +
		"line11\nline12\nline13\nline14\nline15\nline16\nline17\nline18\nline19\nline20\n" +
		"line21\nline22\nline23\nline24\nline25\nline26\nline27\nline28\nline29\nline30"
	task := NewTask("Test", lines, "/tmp")
	store.SaveTask(task)

	m := NewDashboardModel(store, "test")
	m.selectedTask = task
	m.view = viewDetail
	m.height = 40

	maxScroll := m.detailMaxScroll()
	if maxScroll <= 0 {
		t.Fatal("expected maxScroll > 0 for 30-line description in small viewport")
	}

	dm := m
	for i := 0; i < maxScroll+10; i++ {
		model, _ := dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
		dm = model.(DashboardModel)
	}

	if dm.detailScroll != maxScroll {
		t.Errorf("expected detailScroll clamped at %d, got %d", maxScroll, dm.detailScroll)
	}

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

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	dm := model.(DashboardModel)
	if dm.detailScroll != 0 {
		t.Errorf("expected detailScroll reset to 0, got %d", dm.detailScroll)
	}
}

func TestNoteHistoryScrollBound(t *testing.T) {
	store := tempStore(t)
	task := NewTask("Notes", "desc", "/tmp")
	for i := 0; i < 8; i++ {
		task.Notes = append(task.Notes, Note{
			Timestamp: time.Date(2026, time.March, 20, 10, i, 0, 0, time.Local),
			Status:    string(StatusInProgress),
			Content:   "line one for note\nline two for note\nline three for note",
		})
	}

	m := NewDashboardModel(store, "test")
	m.selectedTask = task
	m.view = viewNoteHistory
	m.height = 12

	maxScroll := m.noteHistoryMaxScroll()
	if maxScroll <= 0 {
		t.Fatal("expected note history to overflow")
	}

	dm := m
	for i := 0; i < maxScroll+10; i++ {
		model, _ := dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
		dm = model.(DashboardModel)
	}

	if dm.noteHistoryScroll != maxScroll {
		t.Fatalf("noteHistoryScroll = %d, want clamped %d", dm.noteHistoryScroll, maxScroll)
	}

	model, _ := dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	dm = model.(DashboardModel)
	if dm.noteHistoryScroll != maxScroll-1 {
		t.Fatalf("noteHistoryScroll = %d, want %d after one up", dm.noteHistoryScroll, maxScroll-1)
	}
}

func TestMsgHistoryScrollBound(t *testing.T) {
	store := tempStore(t)
	task := NewTask("Messages", "desc", "/tmp")

	m := NewDashboardModel(store, "test")
	m.selectedTask = task
	m.view = viewMsgHistory
	m.height = 12
	for i := 0; i < 8; i++ {
		m.msgHistoryLines = append(m.msgHistoryLines, ircMessage{
			From:      "peer",
			Content:   "message line one\nmessage line two\nmessage line three",
			Timestamp: time.Date(2026, time.March, 20, 10, i, 0, 0, time.Local),
		})
	}

	maxScroll := m.msgHistoryMaxScroll()
	if maxScroll <= 0 {
		t.Fatal("expected message history to overflow")
	}

	dm := m
	for i := 0; i < maxScroll+10; i++ {
		model, _ := dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
		dm = model.(DashboardModel)
	}

	if dm.msgHistoryScroll != maxScroll {
		t.Fatalf("msgHistoryScroll = %d, want clamped %d", dm.msgHistoryScroll, maxScroll)
	}

	model, _ := dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	dm = model.(DashboardModel)
	if dm.msgHistoryScroll != maxScroll-1 {
		t.Fatalf("msgHistoryScroll = %d, want %d after one up", dm.msgHistoryScroll, maxScroll-1)
	}
}
