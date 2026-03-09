package whip

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

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

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	dm := model.(DashboardModel)
	if dm.ircCursor != 1 {
		t.Errorf("expected ircCursor=1, got %d", dm.ircCursor)
	}

	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	dm = model.(DashboardModel)
	if dm.ircCursor != 2 {
		t.Errorf("expected ircCursor=2, got %d", dm.ircCursor)
	}

	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	dm = model.(DashboardModel)
	if dm.ircCursor != 0 {
		t.Errorf("expected ircCursor=0 (wrap), got %d", dm.ircCursor)
	}

	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	dm = model.(DashboardModel)
	if dm.ircCursor != 2 {
		t.Errorf("expected ircCursor=2 (wrap up), got %d", dm.ircCursor)
	}
}

func TestIRC_SelectPeerOpensMsg(t *testing.T) {
	store := tempStore(t)
	m := NewDashboardModel(store, "test")
	m.peers = []peerInfo{{Name: "whip-abc12", Online: true}}
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

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'h'}})
	dm := model.(DashboardModel)
	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'i'}})
	dm = model.(DashboardModel)
	if dm.ircInput != "hi" {
		t.Errorf("expected 'hi', got '%s'", dm.ircInput)
	}

	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeySpace})
	dm = model.(DashboardModel)
	if dm.ircInput != "hi " {
		t.Errorf("expected 'hi ', got '%s'", dm.ircInput)
	}

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
