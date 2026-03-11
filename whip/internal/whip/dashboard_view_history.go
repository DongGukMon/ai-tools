package whip

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

func (m DashboardModel) renderNoteHistoryView(w int) string {
	var b strings.Builder
	t := m.selectedTask
	if t == nil {
		return ""
	}

	breadcrumb := lipgloss.NewStyle().Foreground(colorSubtle).Render("  Tasks") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorSubtle).Render(t.Title) +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("Notes")
	b.WriteString(breadcrumb + "\n\n")

	// Reverse: newest first
	notes := make([]Note, len(t.Notes))
	for i, n := range t.Notes {
		notes[len(t.Notes)-1-i] = n
	}

	// Build rendered lines
	var lines []string
	for _, n := range notes {
		ts := lipgloss.NewStyle().Foreground(colorSubtle).Render(n.Timestamp.Format("01/02 15:04"))
		st := renderNoteStatus(TaskStatus(n.Status))
		content := lipgloss.NewStyle().Foreground(colorText).Render(n.Content)
		lines = append(lines, fmt.Sprintf("  %s  %s  %s", ts, st, content))
	}

	if len(lines) == 0 {
		lines = append(lines, lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render("  (no notes)"))
	}

	// Scrolling
	maxLines := m.height - 8
	if maxLines < 3 {
		maxLines = 3
	}
	maxScroll := len(lines) - maxLines
	if maxScroll < 0 {
		maxScroll = 0
	}
	scroll := m.noteHistoryScroll
	if scroll > maxScroll {
		scroll = maxScroll
	}

	end := scroll + maxLines
	if end > len(lines) {
		end = len(lines)
	}

	if len(lines) > maxLines {
		scrollInfo := lipgloss.NewStyle().Foreground(colorSubtle).Render(
			fmt.Sprintf("  (%d-%d/%d ↑↓)", scroll+1, end, len(lines)))
		b.WriteString(scrollInfo + "\n")
	}

	for _, line := range lines[scroll:end] {
		b.WriteString(line + "\n")
	}

	b.WriteString("\n")
	b.WriteString(m.renderHistoryFooter())
	return b.String()
}

func (m DashboardModel) renderMsgHistoryView(w int) string {
	var b strings.Builder
	t := m.selectedTask
	if t == nil {
		return ""
	}

	breadcrumb := lipgloss.NewStyle().Foreground(colorSubtle).Render("  Tasks") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorSubtle).Render(t.Title) +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorSecondary).Bold(true).Render("Messages")
	b.WriteString(breadcrumb + "\n\n")

	msgs := m.msgHistoryLines

	var lines []string
	for _, msg := range msgs {
		ts := lipgloss.NewStyle().Foreground(colorSubtle).Render(msg.Timestamp.Format("01/02 15:04"))
		from := lipgloss.NewStyle().Foreground(colorAccent).Render(msg.From)
		content := lipgloss.NewStyle().Foreground(colorText).Render(msg.Content)
		lines = append(lines, fmt.Sprintf("  %s  %s: %s", ts, from, content))
	}

	if len(lines) == 0 {
		lines = append(lines, lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render("  (no messages)"))
	}

	// Scrolling
	maxLines := m.height - 8
	if maxLines < 3 {
		maxLines = 3
	}
	maxScroll := len(lines) - maxLines
	if maxScroll < 0 {
		maxScroll = 0
	}
	scroll := m.msgHistoryScroll
	if scroll > maxScroll {
		scroll = maxScroll
	}

	end := scroll + maxLines
	if end > len(lines) {
		end = len(lines)
	}

	if len(lines) > maxLines {
		scrollInfo := lipgloss.NewStyle().Foreground(colorSubtle).Render(
			fmt.Sprintf("  (%d-%d/%d ↑↓)", scroll+1, end, len(lines)))
		b.WriteString(scrollInfo + "\n")
	}

	for _, line := range lines[scroll:end] {
		b.WriteString(line + "\n")
	}

	b.WriteString("\n")
	refresh := lipgloss.NewStyle().Foreground(colorDim).Render("↻ 2s")
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	line := "  " + footerKey("←/esc", "back") + dot + footerKey("↑↓", "scroll") + dot + refresh
	b.WriteString(lipgloss.NewStyle().MarginTop(1).Render(line))
	return b.String()
}

func (m DashboardModel) renderHistoryFooter() string {
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	line := "  " + footerKey("←/esc", "back") + dot + footerKey("↑↓", "scroll")
	return lipgloss.NewStyle().MarginTop(1).Render(line)
}

func renderNoteStatus(s TaskStatus) string {
	d := statusDisplay(s)
	return d.style.Render(fmt.Sprintf("(%s)", d.label))
}

// loadIRCMessages scans all claude-irc inbox directories for messages
// involving the given peer (both sent by and sent to the peer).
func loadIRCMessages(peerName string) []ircMessage {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	inboxBase := filepath.Join(home, ".claude-irc", "inbox")

	var msgs []ircMessage

	// Scan all inbox directories for messages FROM peerName
	dirs, err := os.ReadDir(inboxBase)
	if err != nil {
		return nil
	}

	for _, dir := range dirs {
		if !dir.IsDir() {
			continue
		}
		dirPath := filepath.Join(inboxBase, dir.Name())
		files, err := os.ReadDir(dirPath)
		if err != nil {
			continue
		}
		for _, f := range files {
			if !strings.HasSuffix(f.Name(), ".json") {
				continue
			}
			data, err := os.ReadFile(filepath.Join(dirPath, f.Name()))
			if err != nil {
				continue
			}
			var msg ircMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}
			if msg.From == peerName {
				msgs = append(msgs, msg)
			}
		}
	}

	// Also read messages sent TO peerName (in peerName's inbox)
	peerInbox := filepath.Join(inboxBase, peerName)
	if files, err := os.ReadDir(peerInbox); err == nil {
		for _, f := range files {
			if !strings.HasSuffix(f.Name(), ".json") {
				continue
			}
			data, err := os.ReadFile(filepath.Join(peerInbox, f.Name()))
			if err != nil {
				continue
			}
			var msg ircMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}
			// Only add if not already captured (from != peerName means sent TO peer)
			if msg.From != peerName {
				msgs = append(msgs, msg)
			}
		}
	}

	sort.Slice(msgs, func(i, j int) bool {
		return msgs[i].Timestamp.Before(msgs[j].Timestamp)
	})

	return msgs
}
