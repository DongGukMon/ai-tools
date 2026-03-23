package whip

import tea "github.com/charmbracelet/bubbletea"

func (m DashboardModel) updateStats(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "left", "backspace":
		m.view = viewList
		m.statsScroll = 0
	case "up", "k":
		m.statsScroll = stepScrollOffset(m.statsScroll, -1, m.statsMaxScroll())
	case "down", "j":
		m.statsScroll = stepScrollOffset(m.statsScroll, 1, m.statsMaxScroll())
	case "r":
		return m, m.loadTasks()
	case "ctrl+c":
		return m, tea.Quit
	}
	return m, nil
}
