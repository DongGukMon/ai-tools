package whip

import (
	"os/exec"
	"strings"
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

func TestResumeResultMsg_QueuesResumeSessionAttach(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")

	model, cmd := m.Update(resumeResultMsg{sessionName: "whip-resume-abc12"})
	dm := model.(DashboardModel)
	if dm.PendingAttach() != "whip-resume-abc12" {
		t.Fatalf("pendingAttach = %q, want resume session name", dm.PendingAttach())
	}
	if cmd == nil {
		t.Fatal("expected tea.Quit command")
	}
}

func TestResumeTask_ReusesExistingResumeSession(t *testing.T) {
	if _, err := exec.LookPath("tmux"); err != nil {
		t.Skip("tmux not installed")
	}

	store := tempStore(t)
	task := NewTask("Test", "desc", "/tmp")
	task.Backend = "claude"
	task.SessionID = "11111111-1111-4111-8111-111111111111"
	store.SaveTask(task)

	sessionName := tmuxResumeSessionName(task.ID)
	if err := SpawnTmuxSession(sessionName, "sleep 30"); err != nil {
		t.Fatalf("SpawnTmuxSession: %v", err)
	}
	defer KillTmuxSessionName(sessionName)

	m := NewDashboardModel(store, "test")
	msg := m.resumeTask(task)()

	result, ok := msg.(resumeResultMsg)
	if !ok {
		t.Fatalf("resumeTask returned %T, want resumeResultMsg", msg)
	}
	if result.err != nil {
		t.Fatalf("resumeTask returned error: %v", result.err)
	}
	if result.sessionName != sessionName {
		t.Fatalf("sessionName = %q, want %q", result.sessionName, sessionName)
	}
}

func TestIRC_PressIOpensIRCView(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.peers = []peerInfo{
		{Name: "whip-abc12", Online: true},
		{Name: "whip-def34", Online: false},
	}
	m.view = viewList

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'i'}})
	dm := model.(DashboardModel)
	if dm.view != viewIRC {
		t.Errorf("expected viewIRC, got %d", dm.view)
	}
	if dm.ircCursor != 0 {
		t.Errorf("expected ircCursor=0, got %d", dm.ircCursor)
	}
}

func TestIRC_PressIWithNoPeers(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.peers = nil
	m.view = viewList

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'i'}})
	dm := model.(DashboardModel)
	if dm.view != viewList {
		t.Error("should stay in viewList when no peers exist")
	}
}

func TestIRC_FilterUserFromPeers(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.peers = []peerInfo{
		{Name: "user", Online: true},
		{Name: "whip-abc12", Online: true},
	}

	peers := m.ircPeers()
	if len(peers) != 1 {
		t.Fatalf("expected 1 peer after filtering, got %d", len(peers))
	}
	if peers[0].Name != "whip-abc12" {
		t.Errorf("expected whip-abc12, got %s", peers[0].Name)
	}
}

func TestIRC_NavigatePeers(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.peers = []peerInfo{
		{Name: "peer-a", Online: true},
		{Name: "peer-b", Online: true},
		{Name: "peer-c", Online: false},
	}
	m.view = viewIRC
	m.ircCursor = 0

	// Down
	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	dm := model.(DashboardModel)
	if dm.ircCursor != 1 {
		t.Errorf("expected ircCursor=1, got %d", dm.ircCursor)
	}

	// Down again
	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	dm = model.(DashboardModel)
	if dm.ircCursor != 2 {
		t.Errorf("expected ircCursor=2, got %d", dm.ircCursor)
	}

	// Down wraps
	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	dm = model.(DashboardModel)
	if dm.ircCursor != 0 {
		t.Errorf("expected ircCursor=0 (wrap), got %d", dm.ircCursor)
	}

	// Up wraps
	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	dm = model.(DashboardModel)
	if dm.ircCursor != 2 {
		t.Errorf("expected ircCursor=2 (wrap up), got %d", dm.ircCursor)
	}
}

func TestIRC_SelectPeerOpensMsg(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.peers = []peerInfo{
		{Name: "whip-abc12", Online: true},
	}
	m.view = viewIRC
	m.ircCursor = 0

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	dm := model.(DashboardModel)
	if dm.view != viewIRCMsg {
		t.Errorf("expected viewIRCMsg, got %d", dm.view)
	}
	if dm.ircTarget != "whip-abc12" {
		t.Errorf("expected target whip-abc12, got %s", dm.ircTarget)
	}
	if dm.ircInput != "" {
		t.Error("expected empty ircInput")
	}
}

func TestIRC_EscFromIRCGoesBack(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.view = viewIRC

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	dm := model.(DashboardModel)
	if dm.view != viewList {
		t.Errorf("expected viewList, got %d", dm.view)
	}
}

func TestIRCMsg_TextInput(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.view = viewIRCMsg
	m.ircTarget = "whip-abc12"

	// Type "hi"
	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'h'}})
	dm := model.(DashboardModel)
	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'i'}})
	dm = model.(DashboardModel)
	if dm.ircInput != "hi" {
		t.Errorf("expected 'hi', got '%s'", dm.ircInput)
	}

	// Space
	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeySpace})
	dm = model.(DashboardModel)
	if dm.ircInput != "hi " {
		t.Errorf("expected 'hi ', got '%s'", dm.ircInput)
	}

	// Backspace
	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyBackspace})
	dm = model.(DashboardModel)
	if dm.ircInput != "hi" {
		t.Errorf("expected 'hi' after backspace, got '%s'", dm.ircInput)
	}
}

func TestIRCMsg_EnterSends(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.view = viewIRCMsg
	m.ircTarget = "whip-abc12"
	m.ircInput = "hello world"

	model, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	dm := model.(DashboardModel)
	if dm.ircInput != "" {
		t.Errorf("expected cleared input after send, got '%s'", dm.ircInput)
	}
	if cmd == nil {
		t.Error("expected a command for sending IRC message")
	}
	// Should stay in viewIRCMsg for multi-message convenience
	if dm.view != viewIRCMsg {
		t.Errorf("expected to stay in viewIRCMsg, got %d", dm.view)
	}
}

func TestIRCMsg_EmptyEnterDoesNotSend(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.view = viewIRCMsg
	m.ircTarget = "whip-abc12"
	m.ircInput = ""

	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd != nil {
		t.Error("should not send when input is empty")
	}
}

func TestIRCMsg_EscGoesBack(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.view = viewIRCMsg
	m.ircInput = "draft"

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	dm := model.(DashboardModel)
	if dm.view != viewIRC {
		t.Errorf("expected viewIRC, got %d", dm.view)
	}
	if dm.ircInput != "" {
		t.Error("expected ircInput cleared on esc")
	}
}

func TestIRC_RenderView(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.peers = []peerInfo{
		{Name: "whip-abc12", Online: true},
		{Name: "whip-def34", Online: false},
	}
	m.view = viewIRC
	m.ircCursor = 0

	output := m.View()
	if !strings.Contains(output, "IRC") {
		t.Error("expected IRC breadcrumb in output")
	}
	if !strings.Contains(output, "whip-abc12") {
		t.Error("expected peer name in output")
	}
}

func TestIRCMsg_RenderView(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.view = viewIRCMsg
	m.ircTarget = "whip-abc12"
	m.ircInput = "hello"

	output := m.View()
	if !strings.Contains(output, "whip-abc12") {
		t.Error("expected target name in breadcrumb")
	}
	if !strings.Contains(output, "hello") {
		t.Error("expected input text in output")
	}
}
