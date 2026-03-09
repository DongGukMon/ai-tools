package whip

import (
	"strconv"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

func (m DashboardModel) updateList(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		return m, tea.Quit
	case "c":
		return m, m.cleanTasks()
	case "up", "k":
		if len(m.tasks) > 0 {
			m.cursor--
			if m.cursor < 0 {
				m.cursor = len(m.tasks) - 1
			}
		}
	case "down", "j":
		if len(m.tasks) > 0 {
			m.cursor++
			if m.cursor >= len(m.tasks) {
				m.cursor = 0
			}
		}
	case "enter":
		if len(m.tasks) > 0 && m.cursor < len(m.tasks) {
			m.selectedTask = m.tasks[m.cursor]
			m.detailScroll = 0
			m.view = viewDetail
		}
	case "i":
		peers := m.ircPeers()
		if len(peers) > 0 {
			m.ircCursor = 0
			m.view = viewIRC
		}
	case "R":
		if m.serveProcess != nil {
			m.view = viewRemoteStatus
		} else {
			cfg, _ := m.store.LoadConfig()
			m.tunnelInput = cfg.Tunnel
			if cfg.RemotePort > 0 {
				m.portInput = strconv.Itoa(cfg.RemotePort)
			} else {
				m.portInput = "8585"
			}
			m.configCursor = 0
			m.view = viewRemoteConfig
		}
	}
	return m, nil
}

func (m DashboardModel) updateDetail(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "backspace", "left":
		m.view = viewList
		m.selectedTask = nil
		m.detailScroll = 0
	case "up", "k":
		if m.detailScroll > 0 {
			m.detailScroll--
		}
	case "down", "j":
		if m.selectedTask != nil && m.detailScroll < m.detailMaxScroll() {
			m.detailScroll++
		}
	case "a":
		if m.selectedTask != nil && m.selectedTask.Runner == "tmux" && IsTmuxSession(m.selectedTask.ID) {
			m.view = viewTmux
			if content, err := CaptureTmuxPane(m.selectedTask.ID); err == nil {
				m.tmuxContent = content
			}
		}
	case "r":
		if m.selectedTask != nil && m.selectedTask.Status == StatusFailed {
			return m, m.retryTask(m.selectedTask.ID)
		}
	case "s":
		if m.selectedTask != nil && m.selectedTask.Status != StatusCompleted && m.selectedTask.SessionID != "" && m.selectedTask.ShellPID > 0 && !IsProcessAlive(m.selectedTask.ShellPID) {
			return m, m.resumeTask(m.selectedTask)
		}
	case "ctrl+c":
		return m, tea.Quit
	}
	return m, nil
}

func (m DashboardModel) updateTmux(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "backspace", "left":
		m.view = viewDetail
		m.tmuxContent = ""
	case "enter":
		if m.selectedTask != nil && IsTmuxSession(m.selectedTask.ID) {
			m.pendingAttach = tmuxSessionName(m.selectedTask.ID)
			return m, tea.Quit
		}
	case "ctrl+c":
		return m, tea.Quit
	}
	return m, nil
}

func (m DashboardModel) detailMaxScroll() int {
	t := m.selectedTask
	if t == nil || t.Description == "" {
		return 0
	}

	fieldCount := 9
	if t.IRCName != "" {
		fieldCount++
	}
	if t.MasterIRCName != "" {
		fieldCount++
	}
	if t.ShellPID > 0 {
		fieldCount++
	}
	if t.Note != "" {
		fieldCount++
	}
	if len(t.DependsOn) > 0 {
		fieldCount++
	}
	if t.CWD != "" {
		fieldCount++
	}
	if t.AssignedAt != nil {
		fieldCount++
	}
	if t.CompletedAt != nil {
		fieldCount++
	}

	overhead := 2 + 2 + fieldCount + 2 + 3 + 2
	maxDescLines := m.height - overhead
	if maxDescLines < 3 {
		maxDescLines = 3
	}

	descLines := strings.Split(t.Description, "\n")
	maxScroll := len(descLines) - maxDescLines
	if maxScroll < 0 {
		maxScroll = 0
	}
	return maxScroll
}
