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

func (m DashboardModel) renderListView(w int) string {
	var b strings.Builder

	if len(m.tasks) == 0 {
		b.WriteString("\n")
		b.WriteString(lipgloss.NewStyle().
			Foreground(colorSubtle).
			Italic(true).
			Render("  No tasks yet — create one with: whip create \"title\" --desc \"description\""))
		b.WriteString("\n")
	} else {
		b.WriteString(m.renderTable())
		b.WriteString("\n")
		b.WriteString(" " + lipgloss.NewStyle().Foreground(colorPrimary).Render(strings.Repeat("━", w-2)))
		b.WriteString("\n")
		b.WriteString(m.renderSummary())
	}

	b.WriteString("\n")
	b.WriteString(m.renderPeers())
	b.WriteString("\n")
	b.WriteString(m.renderServeStatus())
	b.WriteString("\n")
	b.WriteString(m.renderListFooter())

	return b.String()
}

func (m DashboardModel) renderDetailView(w int) string {
	var b strings.Builder
	t := m.selectedTask
	if t == nil {
		return ""
	}

	labelStyle := lipgloss.NewStyle().Bold(true).Foreground(colorMuted).Width(14)
	valStyle := lipgloss.NewStyle().Foreground(colorText)
	dimStyle := lipgloss.NewStyle().Foreground(colorDim)

	breadcrumb := lipgloss.NewStyle().Foreground(colorSubtle).Render("  Tasks") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render(t.Title)
	b.WriteString(breadcrumb + "\n\n")

	diffDisplay := t.Difficulty
	if diffDisplay == "" {
		diffDisplay = "default"
	}

	fields := []struct{ label, value string }{
		{"ID", idStyle.Render(t.ID)},
		{"Title", valStyle.Render(t.Title)},
		{"Status", renderStatus(t.Status)},
		{"Backend", renderBackend(t.Backend)},
		{"Difficulty", valStyle.Render(diffDisplay)},
		{"Review", valStyle.Render(fmt.Sprintf("%v", t.Review))},
		{"Runner", renderRunner(t.Runner)},
	}

	if t.IRCName != "" {
		fields = append(fields, struct{ label, value string }{"IRC", valStyle.Render(t.IRCName)})
	}
	if t.MasterIRCName != "" {
		fields = append(fields, struct{ label, value string }{"Master IRC", valStyle.Render(t.MasterIRCName)})
	}
	if t.ShellPID > 0 {
		fields = append(fields, struct{ label, value string }{"Shell PID", renderPID(t)})
	}
	if t.Note != "" {
		fields = append(fields, struct{ label, value string }{"Note", lipgloss.NewStyle().Foreground(colorMuted).Render(t.Note)})
	}
	if len(t.DependsOn) > 0 {
		fields = append(fields, struct{ label, value string }{"Depends on", lipgloss.NewStyle().Foreground(colorWarning).Render(strings.Join(t.DependsOn, ", "))})
	}
	if t.CWD != "" {
		fields = append(fields, struct{ label, value string }{"CWD", lipgloss.NewStyle().Foreground(colorSubtle).Render(t.CWD)})
	}

	fields = append(fields, struct{ label, value string }{"Created", lipgloss.NewStyle().Foreground(colorSubtle).Render(t.CreatedAt.Format(time.RFC3339))})
	fields = append(fields, struct{ label, value string }{"Updated", lipgloss.NewStyle().Foreground(colorSubtle).Render(t.UpdatedAt.Format(time.RFC3339))})
	if t.AssignedAt != nil {
		fields = append(fields, struct{ label, value string }{"Assigned", lipgloss.NewStyle().Foreground(colorSubtle).Render(t.AssignedAt.Format(time.RFC3339))})
	}
	if t.CompletedAt != nil {
		fields = append(fields, struct{ label, value string }{"Completed", lipgloss.NewStyle().Foreground(colorSubtle).Render(t.CompletedAt.Format(time.RFC3339))})
	}

	for _, f := range fields {
		b.WriteString("  " + labelStyle.Render(f.label) + " " + f.value + "\n")
	}

	if t.Description != "" {
		b.WriteString("\n")
		descLabel := "Description"
		descLines := strings.Split(t.Description, "\n")

		overhead := 2 + 2 + len(fields) + 2 + 3 + 2
		maxDescLines := m.height - overhead
		if maxDescLines < 3 {
			maxDescLines = 3
		}

		totalDesc := len(descLines)
		maxScroll := totalDesc - maxDescLines
		if maxScroll < 0 {
			maxScroll = 0
		}
		if m.detailScroll > maxScroll {
			m.detailScroll = maxScroll
		}

		if totalDesc > maxDescLines {
			scrollInfo := lipgloss.NewStyle().Foreground(colorSubtle).Render(
				fmt.Sprintf(" (%d-%d/%d ↑↓)", m.detailScroll+1, min(m.detailScroll+maxDescLines, totalDesc), totalDesc))
			descLabel += scrollInfo
		}

		b.WriteString("  " + lipgloss.NewStyle().Bold(true).Foreground(colorAccent).Render("Description") + descLabel[len("Description"):] + "\n")
		b.WriteString("  " + dimStyle.Render(strings.Repeat("─", w-4)) + "\n")

		end := m.detailScroll + maxDescLines
		if end > totalDesc {
			end = totalDesc
		}
		visible := descLines[m.detailScroll:end]
		for _, line := range visible {
			b.WriteString("  " + lipgloss.NewStyle().Foreground(colorMuted).Render(line) + "\n")
		}
	}

	b.WriteString("\n")
	b.WriteString(m.renderDetailFooter())
	return b.String()
}

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

func (m DashboardModel) renderIRCView(w int) string {
	var b strings.Builder
	peers := m.ircPeers()

	breadcrumb := lipgloss.NewStyle().Foreground(colorSubtle).Render("  Tasks") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("IRC")
	b.WriteString(breadcrumb + "\n\n")

	if len(peers) == 0 {
		b.WriteString(lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render("  No peers available") + "\n")
	} else {
		for i, p := range peers {
			selected := i == m.ircCursor
			indicator := "  "
			if selected {
				indicator = lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("▸ ")
			}

			var dot, name string
			if p.Online {
				dot = lipgloss.NewStyle().Foreground(colorSuccess).Render("●")
				name = lipgloss.NewStyle().Foreground(colorText).Render(p.Name)
			} else {
				dot = lipgloss.NewStyle().Foreground(colorDim).Render("○")
				name = lipgloss.NewStyle().Foreground(colorSubtle).Render(p.Name)
			}

			row := indicator + dot + " " + name
			if selected {
				row = lipgloss.NewStyle().Background(lipgloss.Color("#1E1B4B")).Render(row)
			}
			b.WriteString(row + "\n")
		}
	}

	b.WriteString("\n")
	b.WriteString(m.renderIRCFooter())
	return b.String()
}

func (m DashboardModel) renderIRCMsgView(w int) string {
	var b strings.Builder

	breadcrumb := lipgloss.NewStyle().Foreground(colorSubtle).Render("  Tasks") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorSubtle).Render("IRC") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render(m.ircTarget)
	b.WriteString(breadcrumb + "\n\n")

	if !m.ircLastSendAt.IsZero() {
		if m.ircLastSendErr != nil {
			errMsg := lipgloss.NewStyle().Foreground(colorDanger).Render(fmt.Sprintf("  ✗ %v", m.ircLastSendErr))
			b.WriteString(errMsg + "\n")
		} else if time.Since(m.ircLastSendAt) < 3*time.Second {
			okMsg := lipgloss.NewStyle().Foreground(colorSuccess).Render(fmt.Sprintf("  ✓ sent to %s", m.ircTarget))
			b.WriteString(okMsg + "\n")
		}
	}

	prompt := lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("  > ")
	cursor := lipgloss.NewStyle().Foreground(colorText).Render("█")
	input := lipgloss.NewStyle().Foreground(colorText).Render(m.ircInput)
	b.WriteString(prompt + input + cursor + "\n")

	b.WriteString("\n")
	b.WriteString(m.renderIRCMsgFooter())
	return b.String()
}

func (m DashboardModel) renderRemoteStatusView(w int) string {
	var b strings.Builder

	breadcrumb := lipgloss.NewStyle().Foreground(colorSubtle).Render("  Tasks") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("Remote")
	b.WriteString(breadcrumb + "\n\n")

	labelStyle := lipgloss.NewStyle().Bold(true).Foreground(colorMuted).Width(14)
	valStyle := lipgloss.NewStyle().Foreground(colorText)

	var statusDot string
	if m.serveProcess != nil {
		statusDot = lipgloss.NewStyle().Foreground(colorSuccess).Render("●") + " " +
			lipgloss.NewStyle().Foreground(colorSuccess).Render("running")
	} else {
		statusDot = lipgloss.NewStyle().Foreground(colorDanger).Render("●") + " " +
			lipgloss.NewStyle().Foreground(colorDanger).Render("stopped")
	}
	b.WriteString("  " + labelStyle.Render("Status") + " " + statusDot + "\n")

	var masterDot string
	if m.masterAlive {
		masterDot = lipgloss.NewStyle().Foreground(colorSuccess).Render("●") + " " +
			lipgloss.NewStyle().Foreground(colorSuccess).Render("alive")
	} else {
		masterDot = lipgloss.NewStyle().Foreground(colorDanger).Render("○") + " " +
			lipgloss.NewStyle().Foreground(colorSubtle).Render("dead")
	}
	b.WriteString("  " + labelStyle.Render("Master") + " " + masterDot + "\n")

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

	b.WriteString("\n")
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	var parts []string
	parts = append(parts, footerKey("←/esc", "back"))
	if m.shortURL != "" || m.serveURL != "" {
		parts = append(parts, footerKey("c", "copy URL"))
		parts = append(parts, footerKey("o", "open in browser"))
	}
	if IsMasterSessionAlive() {
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

func (m DashboardModel) renderIRCFooter() string {
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	line := "  " + footerKey("←/esc", "back") + dot + footerKey("↑↓", "navigate") + dot + footerKey("enter", "message")
	return lipgloss.NewStyle().MarginTop(1).Render(line)
}

func (m DashboardModel) renderIRCMsgFooter() string {
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	line := "  " + footerKey("esc", "back") + dot + footerKey("enter", "send")
	return lipgloss.NewStyle().MarginTop(1).Render(line)
}

func (m DashboardModel) renderTable() string {
	colID := 5
	colTitle := 24
	colStatus := 13
	colBackend := 7
	colRunner := 6
	colPID := 8
	colIRC := 10
	colDeps := 12
	colNote := 16
	colUpdated := 8

	sep := styledSep()
	hdrStyle := lipgloss.NewStyle().Bold(true).Foreground(colorMuted)
	hdrCells := []string{
		padRight(hdrStyle.Render("ID"), colID),
		padRight(hdrStyle.Render("TITLE"), colTitle),
		padRight(hdrStyle.Render("STATUS"), colStatus),
		padRight(hdrStyle.Render("BACKEND"), colBackend),
		padRight(hdrStyle.Render("RUNNER"), colRunner),
		padRight(hdrStyle.Render("PID"), colPID),
		padRight(hdrStyle.Render("IRC"), colIRC),
		padRight(hdrStyle.Render("DEPS"), colDeps),
		padRight(hdrStyle.Render("NOTE"), colNote),
		padRight(hdrStyle.Render("UPDATED"), colUpdated),
	}
	header := "  " + strings.Join(hdrCells, sep)
	underline := "  " + lipgloss.NewStyle().Foreground(colorDim).Render(strings.Repeat("─", lipgloss.Width(header)-2))

	var rows []string
	rows = append(rows, header, underline)

	for i, t := range m.tasks {
		selected := i == m.cursor
		indicator := "  "
		if selected {
			indicator = lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("▸ ")
		}

		id := padRight(idStyle.Render(truncate(t.ID, colID)), colID)
		title := padRight(truncate(t.Title, colTitle), colTitle)
		status := padRight(renderStatus(t.Status), colStatus)
		backend := padRight(renderBackend(t.Backend), colBackend)
		runner := padRight(renderRunner(t.Runner), colRunner)
		pid := padRight(renderPID(t), colPID)

		ircName := truncate(t.IRCName, colIRC)
		if ircName == "" {
			ircName = lipgloss.NewStyle().Foreground(colorDim).Render("—")
		}
		irc := padRight(ircName, colIRC)

		deps := padRight(renderDeps(t.DependsOn), colDeps)
		noteStr := truncate(t.Note, colNote)
		if noteStr == "" {
			noteStr = lipgloss.NewStyle().Foreground(colorDim).Render("—")
		} else {
			noteStr = lipgloss.NewStyle().Foreground(colorMuted).Render(noteStr)
		}
		note := padRight(noteStr, colNote)
		updated := padRight(lipgloss.NewStyle().Foreground(colorSubtle).Render(timeAgo(t.UpdatedAt)), colUpdated)

		row := indicator + strings.Join([]string{id, title, status, backend, runner, pid, irc, deps, note, updated}, sep)
		if selected {
			row = lipgloss.NewStyle().Background(lipgloss.Color("#1E1B4B")).Render(row)
		}
		rows = append(rows, row)
	}

	return strings.Join(rows, "\n")
}

func (m DashboardModel) renderSummary() string {
	counts := map[TaskStatus]int{}
	for _, t := range m.tasks {
		counts[t.Status]++
	}

	dot := lipgloss.NewStyle().Foreground(colorDim).Render(" │ ")
	total := len(m.tasks)
	parts := []string{
		lipgloss.NewStyle().Bold(true).Foreground(colorText).Render(fmt.Sprintf("%d total", total)),
	}
	if n := counts[StatusCreated]; n > 0 {
		parts = append(parts, statusCreated.Render(fmt.Sprintf("● %d created", n)))
	}
	if n := counts[StatusAssigned]; n > 0 {
		parts = append(parts, statusAssigned.Render(fmt.Sprintf("◐ %d assigned", n)))
	}
	if n := counts[StatusInProgress]; n > 0 {
		parts = append(parts, statusInProgress.Render(fmt.Sprintf("▶ %d in_progress", n)))
	}
	if n := counts[StatusReview]; n > 0 {
		parts = append(parts, statusReview.Render(fmt.Sprintf("◎ %d review", n)))
	}
	if n := counts[StatusApprovedPendingFinalize]; n > 0 {
		parts = append(parts, statusApproved.Render(fmt.Sprintf("◉ %d approved_pending_finalize", n)))
	}
	if n := counts[StatusCompleted]; n > 0 {
		parts = append(parts, statusCompleted.Render(fmt.Sprintf("✓ %d completed", n)))
	}
	if n := counts[StatusFailed]; n > 0 {
		parts = append(parts, statusFailed.Render(fmt.Sprintf("✗ %d failed", n)))
	}

	content := strings.Join(parts, dot)
	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(colorDim).
		Padding(0, 2).
		MarginLeft(2).
		Render(content)
	return box
}

func (m DashboardModel) renderPeers() string {
	label := lipgloss.NewStyle().Bold(true).Foreground(colorAccent).Render("IRC")

	var content string
	if m.peers == nil {
		content = lipgloss.NewStyle().Foreground(colorSubtle).Render("not connected")
	} else if len(m.peers) == 0 {
		content = lipgloss.NewStyle().Foreground(colorSubtle).Render("no peers online")
	} else {
		var parts []string
		for _, p := range m.ircPeers() {
			if p.Online {
				dot := lipgloss.NewStyle().Foreground(colorSuccess).Render("●")
				name := lipgloss.NewStyle().Foreground(colorText).Render(p.Name)
				parts = append(parts, dot+" "+name)
			} else {
				dot := lipgloss.NewStyle().Foreground(colorDim).Render("○")
				name := lipgloss.NewStyle().Foreground(colorSubtle).Render(p.Name)
				parts = append(parts, dot+" "+name)
			}
		}
		content = strings.Join(parts, lipgloss.NewStyle().Foreground(colorDim).Render("   "))
	}

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(colorDim).
		Padding(0, 2).
		MarginLeft(2).
		Render(label + "  " + content)
	return box
}

func (m DashboardModel) renderServeStatus() string {
	if m.serveProcess == nil {
		hint := lipgloss.NewStyle().Foreground(colorSubtle).Render("[R] remote")
		return lipgloss.NewStyle().MarginLeft(3).Render(hint)
	}

	label := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FFFFFF")).
		Background(colorSuccess).Padding(0, 1).Render("SERVE")
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

func footerKey(k, desc string) string {
	return lipgloss.NewStyle().Bold(true).Foreground(colorText).Render(k) +
		" " +
		lipgloss.NewStyle().Foreground(colorSubtle).Render(desc)
}

func (m DashboardModel) renderListFooter() string {
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	refresh := lipgloss.NewStyle().Foreground(colorDim).Render("↻ 2s")

	var remoteHint string
	if m.serveProcess != nil {
		remoteHint = footerKey("R", "remote status")
	} else {
		remoteHint = footerKey("R", "remote")
	}

	line := "  " + footerKey("↑↓", "navigate") + dot + footerKey("enter", "detail") + dot + footerKey("i", "irc") + dot + remoteHint + dot + footerKey("q", "quit") + dot + footerKey("c", "clean") + dot + refresh
	return lipgloss.NewStyle().MarginTop(1).Render(line)
}

func (m DashboardModel) renderDetailFooter() string {
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	line := "  " + footerKey("←/esc", "back") + dot + footerKey("↑↓", "scroll")

	if m.selectedTask != nil && m.selectedTask.Runner == "tmux" && IsTmuxSession(m.selectedTask.ID) {
		line += dot + footerKey("a", "attach tmux")
	}
	if m.selectedTask != nil && m.selectedTask.Status == StatusFailed {
		line += dot + footerKey("r", "retry")
	}
	if m.selectedTask != nil && m.selectedTask.Status != StatusCompleted && m.selectedTask.SessionID != "" && m.selectedTask.ShellPID > 0 && !IsProcessAlive(m.selectedTask.ShellPID) {
		line += dot + footerKey("s", "resume")
	}

	return lipgloss.NewStyle().MarginTop(1).Render(line)
}

func (m DashboardModel) renderTmuxFooter() string {
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	refresh := lipgloss.NewStyle().Foreground(colorDim).Render("↻ 2s auto-refreshing")

	detachHint := lipgloss.NewStyle().Foreground(colorSubtle).Render("(ctrl+b d to return)")
	line := "  " + footerKey("←/esc", "back") + dot + footerKey("enter", "attach") + " " + detachHint + dot + refresh

	return lipgloss.NewStyle().MarginTop(1).Render(line)
}

func renderStatus(s TaskStatus) string {
	switch s {
	case StatusCreated:
		return statusCreated.Render("○ created")
	case StatusAssigned:
		return statusAssigned.Render("◐ assigned")
	case StatusInProgress:
		return statusInProgress.Render("▶ in_progress")
	case StatusReview:
		return statusReview.Render("◎ review")
	case StatusApprovedPendingFinalize:
		return statusApproved.Render("◉ approved_pending_finalize")
	case StatusCompleted:
		return statusCompleted.Render("✓ completed")
	case StatusFailed:
		return statusFailed.Render("✗ failed")
	default:
		return string(s)
	}
}

func renderBackend(backend string) string {
	switch backend {
	case "claude":
		return lipgloss.NewStyle().Foreground(colorAccent).Render("claude")
	case "codex":
		return lipgloss.NewStyle().Foreground(colorSuccess).Render("codex")
	default:
		return lipgloss.NewStyle().Foreground(colorDim).Render("—")
	}
}

func renderRunner(runner string) string {
	switch runner {
	case "tmux":
		return lipgloss.NewStyle().Foreground(colorSecondary).Render("tmux")
	case "terminal":
		return lipgloss.NewStyle().Foreground(colorWarning).Render("term")
	default:
		return lipgloss.NewStyle().Foreground(colorDim).Render("—")
	}
}

func renderPID(t *Task) string {
	if t == nil || t.ShellPID <= 0 {
		return lipgloss.NewStyle().Foreground(colorDim).Render("—")
	}
	switch TaskProcessState(t) {
	case ProcessStateAlive:
		return pidAliveStyle.Render(fmt.Sprintf("● %d", t.ShellPID))
	case ProcessStateExited:
		return pidExitedStyle.Render(fmt.Sprintf("- %d", t.ShellPID))
	default:
		return pidDeadStyle.Render(fmt.Sprintf("✗ %d", t.ShellPID))
	}
}

func renderDeps(deps []string) string {
	if len(deps) == 0 {
		return lipgloss.NewStyle().Foreground(colorDim).Render("—")
	}
	short := make([]string, len(deps))
	for i, d := range deps {
		if len(d) > 5 {
			short[i] = d[:5]
		} else {
			short[i] = d
		}
	}
	return lipgloss.NewStyle().Foreground(colorWarning).Render(strings.Join(short, ","))
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
	cols := []int{5, 24, 13, 7, 6, 8, 10, 12, 16, 8}
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
