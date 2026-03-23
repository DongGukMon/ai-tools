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

	lines := m.noteHistoryLines(w)
	maxLines := m.historyMaxLines()
	scroll := clampScrollOffset(m.noteHistoryScroll, scrollMax(len(lines), maxLines))

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

	lines := m.buildMsgHistoryLines(w)
	maxLines := m.historyMaxLines()
	scroll := clampScrollOffset(m.msgHistoryScroll, scrollMax(len(lines), maxLines))

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
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	line := "  " + footerKey("←/esc", "back") + dot + footerKey("↑↓", "scroll")
	if m.selectedTask != nil && !m.selectedTask.Status.IsTerminal() {
		refresh := lipgloss.NewStyle().Foreground(colorDim).Render("↻ 2s")
		line += dot + refresh
	}
	b.WriteString(lipgloss.NewStyle().MarginTop(1).Render(line))
	return b.String()
}

// loadTaskMessages returns IRC messages with live + stored fallback.
func loadTaskMessages(store *Store, task *Task) []ircMessage {
	// Non-terminal task with IRCName: try live IRC first
	if task.IRCName != "" && !task.Status.IsTerminal() {
		if msgs := loadIRCMessages(task.IRCName); len(msgs) > 0 {
			return msgs
		}
	}
	// Fall back to stored messages
	if msgs, err := store.LoadMessages(task.ID); err == nil && len(msgs) > 0 {
		return msgs
	}
	// Last resort: try live IRC even for terminal (IRC might not be cleaned yet)
	if task.IRCName != "" {
		return loadIRCMessages(task.IRCName)
	}
	return nil
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
