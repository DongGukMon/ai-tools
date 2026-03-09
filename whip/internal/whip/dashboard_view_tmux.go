package whip

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

func (m DashboardModel) renderTmuxView(w int) string {
	var b strings.Builder
	t := m.selectedTask
	if t == nil {
		return ""
	}

	breadcrumb := lipgloss.NewStyle().Foreground(colorSubtle).Render("  Tasks") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorSubtle).Render(t.Title) +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorSecondary).Bold(true).Render("tmux")
	b.WriteString(breadcrumb + "\n")

	content := m.tmuxContent
	if content == "" {
		content = lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render("(no output)")
	}

	lines := strings.Split(strings.TrimRight(content, "\n"), "\n")
	maxLines := m.height - 8
	if maxLines < 5 {
		maxLines = 5
	}
	if len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(colorSecondary).
		Padding(0, 1).
		MarginLeft(2).
		Width(w - 6).
		Render(strings.Join(lines, "\n"))
	b.WriteString(box + "\n")
	b.WriteString("\n")
	b.WriteString(m.renderTmuxFooter())

	return b.String()
}

func (m DashboardModel) renderTmuxFooter() string {
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	refresh := lipgloss.NewStyle().Foreground(colorDim).Render("↻ 2s auto-refreshing")

	detachHint := lipgloss.NewStyle().Foreground(colorSubtle).Render("(ctrl+b d to return)")
	line := "  " + footerKey("←/esc", "back") + dot + footerKey("enter", "attach") + " " + detachHint + dot + refresh

	return lipgloss.NewStyle().MarginTop(1).Render(line)
}
