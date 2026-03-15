package whip

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

func (m DashboardModel) renderRemoteStatusView(w int) string {
	var b strings.Builder

	breadcrumb := lipgloss.NewStyle().Foreground(colorSubtle).Render("  Tasks") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("Remote")
	b.WriteString(breadcrumb + "\n\n")

	labelStyle := lipgloss.NewStyle().Bold(true).Foreground(colorMuted).Width(14)
	valStyle := lipgloss.NewStyle().Foreground(colorText)

	var statusDot string
	if m.remoteHandle != nil {
		statusDot = lipgloss.NewStyle().Foreground(colorSuccess).Render("●") + " " +
			lipgloss.NewStyle().Foreground(colorSuccess).Render("running")
	} else {
		statusDot = lipgloss.NewStyle().Foreground(colorDanger).Render("●") + " " +
			lipgloss.NewStyle().Foreground(colorDanger).Render("stopped")
	}
	b.WriteString("  " + labelStyle.Render("Status") + " " + statusDot + "\n")
	b.WriteString("  " + labelStyle.Render("Workspace") + " " + valStyle.Render(m.remoteWorkspace) + "\n")

	var masterDot string
	if m.masterAlive {
		masterDot = lipgloss.NewStyle().Foreground(colorSuccess).Render("●") + " " +
			lipgloss.NewStyle().Foreground(colorSuccess).Render("alive")
	} else {
		masterDot = lipgloss.NewStyle().Foreground(colorDanger).Render("○") + " " +
			lipgloss.NewStyle().Foreground(colorSubtle).Render("dead")
	}
	b.WriteString("  " + labelStyle.Render("Master") + " " + masterDot + "\n")
	b.WriteString("  " + labelStyle.Render("Master IRC") + " " + valStyle.Render(WorkspaceMasterIRCName(m.remoteWorkspace)) + "\n")

	urlLabel := labelStyle.Render("URL")
	displayURL := m.shortURL
	if displayURL == "" {
		displayURL = m.serveURL
	}
	if displayURL != "" {
		b.WriteString("  " + urlLabel + " " + valStyle.Render(displayURL) + "\n")
	} else {
		b.WriteString("  " + urlLabel + " " + lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render("(parsing...)") + "\n")
	}

	qrTarget := m.shortURL
	if qrTarget == "" {
		qrTarget = m.webURL
	}
	if qrTarget != "" {
		qr := renderQR(qrTarget)
		if qr != "" {
			b.WriteString("\n")
			for _, line := range strings.Split(qr, "\n") {
				b.WriteString("  " + line + "\n")
			}
		}
	}

	// Serve notice log box
	{
		const logBoxHeight = 6
		logTitle := lipgloss.NewStyle().Bold(true).Foreground(colorMuted).Render("Device Auth")
		var logLines []string
		if len(m.serveNotices) == 0 {
			logLines = []string{lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render("(waiting for device auth...)")}
		} else {
			start := 0
			if len(m.serveNotices) > logBoxHeight {
				start = len(m.serveNotices) - logBoxHeight
			}
			for _, n := range m.serveNotices[start:] {
				logLines = append(logLines, lipgloss.NewStyle().Foreground(colorText).Render(n))
			}
		}
		// Pad to fixed height
		for len(logLines) < logBoxHeight {
			logLines = append(logLines, "")
		}
		logContent := strings.Join(logLines, "\n")
		logBox := lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(colorDim).
			Padding(0, 1).
			Width(50).
			Render(logTitle + "\n" + logContent)
		b.WriteString("\n")
		for _, line := range strings.Split(logBox, "\n") {
			b.WriteString("  " + line + "\n")
		}
	}

	b.WriteString("\n")
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	var parts []string
	parts = append(parts, footerKey("←/esc", "back"))
	if m.shortURL != "" || m.serveURL != "" {
		parts = append(parts, footerKey("c", "copy URL"))
		parts = append(parts, footerKey("o", "open in browser"))
	}
	if IsMasterSessionAlive(m.remoteWorkspace) {
		parts = append(parts, footerKey("T", "attach master"))
	}
	parts = append(parts, footerKey("t", "reset token"))
	parts = append(parts, footerKey("S", "stop remote"))
	line := "  " + strings.Join(parts, dot)
	b.WriteString(lipgloss.NewStyle().MarginTop(1).Render(line))

	return b.String()
}

func (m DashboardModel) renderRemoteConfigView(w int) string {
	var b strings.Builder

	breadcrumb := lipgloss.NewStyle().Foreground(colorSubtle).Render("  Tasks") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("Remote Config")
	b.WriteString(breadcrumb + "\n\n")

	labelStyle := lipgloss.NewStyle().Bold(true).Foreground(colorMuted).Width(12)
	activeLabel := lipgloss.NewStyle().Bold(true).Foreground(colorAccent).Width(12)
	inputStyle := lipgloss.NewStyle().Foreground(colorText)
	cursor := lipgloss.NewStyle().Foreground(colorText).Render("█")

	tLabel := labelStyle
	if m.configCursor == 0 {
		tLabel = activeLabel
	}
	tIndicator := "  "
	if m.configCursor == 0 {
		tIndicator = lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("▸ ")
	}
	tVal := inputStyle.Render(m.tunnelInput)
	if m.configCursor == 0 {
		tVal += cursor
	}
	if m.tunnelInput == "" && m.configCursor != 0 {
		tVal = lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render("(empty = no tunnel)")
	}
	b.WriteString(tIndicator + tLabel.Render("Tunnel") + " " + tVal + "\n")

	pLabel := labelStyle
	if m.configCursor == 1 {
		pLabel = activeLabel
	}
	pIndicator := "  "
	if m.configCursor == 1 {
		pIndicator = lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("▸ ")
	}
	pVal := inputStyle.Render(m.portInput)
	if m.configCursor == 1 {
		pVal += cursor
	}
	b.WriteString(pIndicator + pLabel.Render("Port") + " " + pVal + "\n")

	wLabel := labelStyle
	if m.configCursor == 2 {
		wLabel = activeLabel
	}
	wIndicator := "  "
	if m.configCursor == 2 {
		wIndicator = lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("▸ ")
	}
	wVal := inputStyle.Render(m.workspaceInput)
	if m.configCursor == 2 {
		wVal += cursor
	}
	if strings.TrimSpace(m.workspaceInput) == "" && m.configCursor != 2 {
		wVal = lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render(GlobalWorkspaceName)
	}
	b.WriteString(wIndicator + wLabel.Render("Workspace") + " " + wVal + "\n")

	b.WriteString("\n")
	b.WriteString(lipgloss.NewStyle().Foreground(colorSubtle).Render("  Backend: claude  ·  Difficulty: hard") + "\n")

	if m.remoteStarting {
		spinner := spinnerFrames[m.spinnerIndex%len(spinnerFrames)]
		b.WriteString("\n")
		b.WriteString(lipgloss.NewStyle().Foreground(colorAccent).Render("  "+spinner+" Starting remote...") + "\n")
	}

	if m.remoteErr != nil {
		b.WriteString("\n")
		b.WriteString(lipgloss.NewStyle().Foreground(colorDanger).Render(fmt.Sprintf("  ✗ %v", m.remoteErr)) + "\n")
	}

	b.WriteString("\n")
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	line := "  " + footerKey("tab/↑↓", "switch field") + dot + footerKey("enter", "start remote") + dot + footerKey("esc", "cancel")
	b.WriteString(lipgloss.NewStyle().MarginTop(1).Render(line))

	return b.String()
}

func (m DashboardModel) renderServeStatus() string {
	if m.remoteHandle == nil {
		hint := lipgloss.NewStyle().Foreground(colorSubtle).Render("[R] remote")
		return lipgloss.NewStyle().MarginLeft(3).Render(hint)
	}

	label := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FFFFFF")).
		Background(colorSuccess).Padding(0, 1).Render("REMOTE")
	url := lipgloss.NewStyle().Foreground(colorText).Render(m.serveURL)

	var masterDot string
	if m.masterAlive {
		masterDot = lipgloss.NewStyle().Foreground(colorSuccess).Render("●") + " " +
			lipgloss.NewStyle().Foreground(colorText).Render("master")
	} else {
		masterDot = lipgloss.NewStyle().Foreground(colorDanger).Render("✗") + " " +
			lipgloss.NewStyle().Foreground(colorSubtle).Render("master")
	}

	sep := lipgloss.NewStyle().Foreground(colorDim).Render("  │  ")
	content := label + "  " + url + sep + masterDot

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(colorSuccess).
		Padding(0, 2).
		MarginLeft(2).
		Render(content)
	return box
}
