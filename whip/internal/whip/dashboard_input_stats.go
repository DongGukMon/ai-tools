package whip

import tea "github.com/charmbracelet/bubbletea"

func (m DashboardModel) updateStats(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "left", "backspace":
		m.view = viewList
		m.statsScroll = 0
	case "a":
		m.statsIncludeArchived = !m.statsIncludeArchived
		m.err = nil
		m.statsSections = m.computeStatsSections()
	case "up", "k":
		if m.statsScroll > 0 {
			m.statsScroll--
		}
	case "down", "j":
		m.statsScroll++
	case "r":
		return m, m.loadTasks()
	case "ctrl+c":
		return m, tea.Quit
	}
	return m, nil
}
