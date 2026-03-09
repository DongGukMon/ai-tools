package whip

import (
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"

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

func (m DashboardModel) ircPeers() []peerInfo {
	var master *peerInfo
	var online, offline []peerInfo
	for _, p := range m.peers {
		if p.Name == "user" {
			continue
		}
		if strings.HasPrefix(p.Name, "whip-master") {
			cp := p
			master = &cp
		} else if p.Online {
			online = append(online, p)
		} else {
			offline = append(offline, p)
		}
	}
	sort.Slice(online, func(i, j int) bool { return online[i].Name < online[j].Name })
	sort.Slice(offline, func(i, j int) bool { return offline[i].Name < offline[j].Name })
	var result []peerInfo
	if master != nil {
		result = append(result, *master)
	}
	result = append(result, online...)
	result = append(result, offline...)
	return result
}

func (m DashboardModel) updateIRC(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	peers := m.ircPeers()
	switch msg.String() {
	case "esc", "backspace", "left":
		m.view = viewList
	case "up", "k":
		if len(peers) > 0 {
			m.ircCursor--
			if m.ircCursor < 0 {
				m.ircCursor = len(peers) - 1
			}
		}
	case "down", "j":
		if len(peers) > 0 {
			m.ircCursor++
			if m.ircCursor >= len(peers) {
				m.ircCursor = 0
			}
		}
	case "enter":
		if len(peers) > 0 && m.ircCursor < len(peers) {
			m.ircTarget = peers[m.ircCursor].Name
			m.ircInput = ""
			m.ircLastSendErr = nil
			m.ircLastSendAt = time.Time{}
			m.view = viewIRCMsg
		}
	case "ctrl+c":
		return m, tea.Quit
	}
	return m, nil
}

func (m DashboardModel) updateIRCMsg(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyRunes:
		m.ircInput += string(msg.Runes)
	case tea.KeySpace:
		m.ircInput += " "
	case tea.KeyBackspace:
		runes := []rune(m.ircInput)
		if len(runes) > 0 {
			m.ircInput = string(runes[:len(runes)-1])
		}
	case tea.KeyEnter:
		if strings.TrimSpace(m.ircInput) != "" {
			cmd := m.sendIRCMsg(m.ircTarget, m.ircInput)
			m.ircInput = ""
			return m, cmd
		}
	case tea.KeyEsc:
		m.ircInput = ""
		m.view = viewIRC
	case tea.KeyCtrlC:
		return m, tea.Quit
	}
	return m, nil
}

func (m DashboardModel) updateRemoteConfig(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyRunes:
		if m.configCursor == 0 {
			m.tunnelInput += string(msg.Runes)
		} else {
			m.portInput += string(msg.Runes)
		}
	case tea.KeySpace:
		if m.configCursor == 0 {
			m.tunnelInput += " "
		} else {
			m.portInput += " "
		}
	case tea.KeyBackspace:
		if m.configCursor == 0 {
			runes := []rune(m.tunnelInput)
			if len(runes) > 0 {
				m.tunnelInput = string(runes[:len(runes)-1])
			}
		} else {
			runes := []rune(m.portInput)
			if len(runes) > 0 {
				m.portInput = string(runes[:len(runes)-1])
			}
		}
	case tea.KeyTab, tea.KeyUp, tea.KeyDown:
		m.configCursor = (m.configCursor + 1) % 2
	case tea.KeyEnter:
		if m.remoteStarting {
			return m, nil
		}
		port, _ := strconv.Atoi(strings.TrimSpace(m.portInput))
		if port <= 0 {
			port = 8585
		}
		cfg := RemoteConfig{
			Backend:    "claude",
			Difficulty: "hard",
			Tunnel:     strings.TrimSpace(m.tunnelInput),
			Port:       port,
			CWD:        m.cwd,
		}
		_, _ = m.store.UpdateConfig(func(storeCfg *Config) error {
			storeCfg.Tunnel = cfg.Tunnel
			storeCfg.RemotePort = cfg.Port
			return nil
		})
		m.remoteStarting = true
		m.remoteErr = nil
		return m, m.startRemote(cfg)
	case tea.KeyEsc:
		m.view = viewList
	case tea.KeyCtrlC:
		return m, tea.Quit
	}
	return m, nil
}

func (m DashboardModel) updateRemoteStatus(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "s", "S":
		m.view = viewList
		return m, m.stopRemote()
	case "o":
		openURL := m.shortURL
		if openURL == "" {
			openURL = m.webURL
		}
		if openURL != "" {
			exec.Command("open", openURL).Start()
		}
	case "c":
		copyURL := m.shortURL
		if copyURL == "" {
			copyURL = m.serveURL
		}
		if copyURL != "" {
			copyCmd := exec.Command("pbcopy")
			copyCmd.Stdin = strings.NewReader(copyURL)
			copyCmd.Run()
		}
	case "t":
		_, _ = m.store.UpdateConfig(func(storeCfg *Config) error {
			storeCfg.ServeToken = ""
			return nil
		})
	case "T":
		if IsMasterSessionAlive() {
			m.pendingAttach = MasterSessionName
			return m, tea.Quit
		}
	case "esc", "left", "backspace":
		m.view = viewList
	case "q", "ctrl+c":
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
