package whip

import (
	"os/exec"
	"strconv"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

func (m DashboardModel) updateRemoteConfig(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyRunes:
		if m.configCursor == 0 {
			m.tunnelInput += string(msg.Runes)
		} else if m.configCursor == 1 {
			m.portInput += string(msg.Runes)
		} else {
			m.workspaceInput += string(msg.Runes)
		}
	case tea.KeySpace:
		if m.configCursor == 0 {
			m.tunnelInput += " "
		} else if m.configCursor == 1 {
			m.portInput += " "
		} else {
			m.workspaceInput += " "
		}
	case tea.KeyBackspace:
		if m.configCursor == 0 {
			runes := []rune(m.tunnelInput)
			if len(runes) > 0 {
				m.tunnelInput = string(runes[:len(runes)-1])
			}
		} else if m.configCursor == 1 {
			runes := []rune(m.portInput)
			if len(runes) > 0 {
				m.portInput = string(runes[:len(runes)-1])
			}
		} else {
			runes := []rune(m.workspaceInput)
			if len(runes) > 0 {
				m.workspaceInput = string(runes[:len(runes)-1])
			}
		}
	case tea.KeyTab, tea.KeyUp, tea.KeyDown:
		m.configCursor = (m.configCursor + 1) % 3
	case tea.KeyEnter:
		if m.remoteStarting {
			return m, nil
		}
		workspace := NormalizeWorkspaceName(m.workspaceInput)
		if err := ValidateWorkspaceName(workspace); err != nil {
			m.remoteErr = err
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
			Workspace:  workspace,
		}
		_, _ = m.store.UpdateConfig(func(storeCfg *Config) error {
			storeCfg.Tunnel = cfg.Tunnel
			storeCfg.RemotePort = cfg.Port
			return nil
		})
		m.remoteWorkspace = workspace
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
		if IsMasterSessionAlive(m.remoteWorkspace) {
			m.pendingAttach = WorkspaceMasterSessionName(m.remoteWorkspace)
			return m, tea.Quit
		}
	case "esc", "left", "backspace":
		m.view = viewList
	case "q", "ctrl+c":
		return m, tea.Quit
	}
	return m, nil
}
