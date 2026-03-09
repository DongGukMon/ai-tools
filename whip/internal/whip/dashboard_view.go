package whip

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/mdp/qrterminal/v3"
)

func padRight(s string, width int) string {
	w := lipgloss.Width(s)
	if w >= width {
		return s
	}
	return s + strings.Repeat(" ", width-w)
}

func styledSep() string {
	return lipgloss.NewStyle().Foreground(colorDim).Render(" │ ")
}

func (m DashboardModel) View() string {
	var b strings.Builder
	w := min(m.width, 120)
	if m.view == viewList && len(m.tasks) > 0 {
		w = max(w, tableContentWidth()+1)
	}

	b.WriteString(m.renderHeader(w))

	if m.err != nil {
		errLabel := lipgloss.NewStyle().Foreground(colorDanger).Bold(true).Render("  ✗ Error:")
		errMsg := lipgloss.NewStyle().Foreground(colorDanger).Render(fmt.Sprintf(" %v", m.err))
		b.WriteString(errLabel + errMsg + "\n")
	}

	switch m.view {
	case viewList:
		b.WriteString(m.renderListView(w))
	case viewDetail:
		b.WriteString(m.renderDetailView(w))
	case viewTmux:
		b.WriteString(m.renderTmuxView(w))
	case viewIRC:
		b.WriteString(m.renderIRCView(w))
	case viewIRCMsg:
		b.WriteString(m.renderIRCMsgView(w))
	case viewRemoteConfig:
		b.WriteString(m.renderRemoteConfigView(w))
	case viewRemoteStatus:
		b.WriteString(m.renderRemoteStatusView(w))
	}

	return b.String()
}

func (m DashboardModel) renderHeader(w int) string {
	var b strings.Builder

	spinner := lipgloss.NewStyle().Foreground(colorSecondary).Render(spinnerFrames[m.spinnerIndex])
	badge := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#FFFFFF")).
		Background(colorPrimary).
		Padding(0, 1).
		Render("WHIP")
	subtitle := lipgloss.NewStyle().Foreground(colorAccent).Render("Task Orchestrator")
	left := badge + " " + subtitle

	var rightParts []string
	if m.version != "" {
		rightParts = append(rightParts, lipgloss.NewStyle().Foreground(colorSubtle).Render(m.version))
	}
	rightParts = append(rightParts, spinner, lipgloss.NewStyle().Foreground(colorMuted).Render(time.Now().Format("15:04:05")))
	right := strings.Join(rightParts, "  ")

	leftW := lipgloss.Width(left)
	rightW := lipgloss.Width(right)
	gap := w - leftW - rightW - 2
	if gap < 2 {
		gap = 2
	}
	b.WriteString(" " + left + strings.Repeat(" ", gap) + right)
	b.WriteString("\n")
	b.WriteString(" " + lipgloss.NewStyle().Foreground(colorPrimary).Render(strings.Repeat("━", w-2)))
	b.WriteString("\n")

	return b.String()
}

func footerKey(k, desc string) string {
	return lipgloss.NewStyle().Bold(true).Foreground(colorText).Render(k) +
		" " +
		lipgloss.NewStyle().Foreground(colorSubtle).Render(desc)
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max <= 3 {
		return s[:max]
	}
	return s[:max-2] + ".."
}

func timeAgo(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func tableContentWidth() int {
	cols := []int{5, 12, 24, 13, 7, 6, 8, 10, 12, 16, 8}
	total := 2
	for i, c := range cols {
		total += c
		if i < len(cols)-1 {
			total += 3
		}
	}
	return total
}

func renderQR(text string) string {
	var buf bytes.Buffer
	qrterminal.Generate(text, qrterminal.L, &buf)
	return strings.TrimRight(buf.String(), "\n")
}
