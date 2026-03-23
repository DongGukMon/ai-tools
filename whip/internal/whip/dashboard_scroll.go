package whip

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

func clampScrollOffset(scroll, maxScroll int) int {
	if maxScroll < 0 {
		maxScroll = 0
	}
	if scroll < 0 {
		return 0
	}
	if scroll > maxScroll {
		return maxScroll
	}
	return scroll
}

func stepScrollOffset(scroll, delta, maxScroll int) int {
	return clampScrollOffset(scroll+delta, maxScroll)
}

func scrollMax(totalLines, visibleLines int) int {
	maxScroll := totalLines - visibleLines
	if maxScroll < 0 {
		return 0
	}
	return maxScroll
}

func visibleLineCount(height, reservedLines, minLines int) int {
	visible := height - reservedLines
	if visible < minLines {
		return minLines
	}
	return visible
}

func (m DashboardModel) statsMaxLines() int {
	return visibleLineCount(m.height, 8, 4)
}

func (m DashboardModel) statsMaxScroll() int {
	lines := m.renderStatsContentLines(min(m.width, 120))
	return scrollMax(len(lines), m.statsMaxLines())
}

func (m DashboardModel) historyMaxLines() int {
	return visibleLineCount(m.height, 8, 3)
}

func (m DashboardModel) noteHistoryLines(w int) []string {
	t := m.selectedTask
	if t == nil {
		return nil
	}

	notes := make([]Note, len(t.Notes))
	for i, n := range t.Notes {
		notes[len(t.Notes)-1-i] = n
	}

	var lines []string
	for _, n := range notes {
		ts := lipgloss.NewStyle().Foreground(colorSubtle).Render(n.Timestamp.Format("01/02 15:04"))
		st := renderNoteStatus(TaskStatus(n.Status))

		prefixWidth := 2 + 11 + 2 + lipgloss.Width(st) + 2
		contentWidth := w - prefixWidth
		indent := strings.Repeat(" ", prefixWidth)

		wrappedContent := wrapWithIndent(
			lipgloss.NewStyle().Foreground(colorText).Render(n.Content),
			contentWidth,
			indent,
		)
		entry := fmt.Sprintf("  %s  %s  %s", ts, st, wrappedContent)
		lines = append(lines, strings.Split(entry, "\n")...)
	}

	if len(lines) == 0 {
		lines = append(lines, lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render("  (no notes)"))
	}

	return lines
}

func (m DashboardModel) noteHistoryMaxScroll() int {
	lines := m.noteHistoryLines(min(m.width, 120))
	return scrollMax(len(lines), m.historyMaxLines())
}

func (m DashboardModel) buildMsgHistoryLines(w int) []string {
	var lines []string
	for _, msg := range m.msgHistoryLines {
		ts := lipgloss.NewStyle().Foreground(colorSubtle).Render(msg.Timestamp.Format("01/02 15:04"))
		from := lipgloss.NewStyle().Foreground(colorAccent).Render(msg.From)

		prefixWidth := 2 + 11 + 2 + lipgloss.Width(from) + 2
		contentWidth := w - prefixWidth
		indent := strings.Repeat(" ", prefixWidth)

		wrappedContent := wrapWithIndent(
			lipgloss.NewStyle().Foreground(colorText).Render(msg.Content),
			contentWidth,
			indent,
		)
		entry := fmt.Sprintf("  %s  %s: %s", ts, from, wrappedContent)
		lines = append(lines, strings.Split(entry, "\n")...)
	}

	if len(lines) == 0 {
		lines = append(lines, lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render("  (no messages)"))
	}

	return lines
}

func (m DashboardModel) msgHistoryMaxScroll() int {
	lines := m.buildMsgHistoryLines(min(m.width, 120))
	return scrollMax(len(lines), m.historyMaxLines())
}
