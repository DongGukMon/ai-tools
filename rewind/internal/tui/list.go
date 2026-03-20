package tui

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/bang9/ai-tools/rewind/internal/parser"
)

// Action represents what the user chose to do with a session.
type Action int

const (
	ActionNone Action = iota
	ActionOpen
	ActionAnalyze
)

// Result is the outcome of the TUI session picker.
type Result struct {
	Action  Action
	Session parser.SessionInfo
}

type sessionItem struct {
	info        parser.SessionInfo
	hasAnalysis bool
}

func (s sessionItem) Title() string {
	backend := strings.ToUpper(s.info.Backend[:1]) + s.info.Backend[1:]
	ts := s.info.StartedAt.Local().Format("2006-01-02 15:04")
	size := formatSize(s.info.FileSize)
	analysis := ""
	if s.hasAnalysis {
		analysis = " [analyzed]"
	}
	return fmt.Sprintf("%s  %s  %s%s", ts, backend, size, analysis)
}

func (s sessionItem) Description() string {
	cwd := s.info.CWD
	if cwd != "" {
		home, _ := filepath.Abs("~")
		if home != "" {
			cwd = strings.Replace(cwd, home, "~", 1)
		}
		// Shorten long paths
		if len(cwd) > 60 {
			cwd = "..." + cwd[len(cwd)-57:]
		}
	}
	id := s.info.ID
	if len(id) > 12 {
		id = id[:12] + "..."
	}
	if cwd != "" {
		return fmt.Sprintf("%s  %s", id, cwd)
	}
	return id
}

func (s sessionItem) FilterValue() string {
	return s.info.ID + " " + s.info.Backend + " " + s.info.CWD
}

var (
	helpStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("241")).Padding(0, 1)
)

type model struct {
	list   list.Model
	result Result
	quit   bool
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		// Don't handle keys when filtering
		if m.list.FilterState() == list.Filtering {
			break
		}
		switch msg.String() {
		case "enter":
			if item, ok := m.list.SelectedItem().(sessionItem); ok {
				m.result = Result{Action: ActionOpen, Session: item.info}
				return m, tea.Quit
			}
		case "a":
			if item, ok := m.list.SelectedItem().(sessionItem); ok {
				m.result = Result{Action: ActionAnalyze, Session: item.info}
				return m, tea.Quit
			}
		case "q", "esc":
			m.quit = true
			return m, tea.Quit
		}
	case tea.WindowSizeMsg:
		m.list.SetSize(msg.Width, msg.Height-2)
	}

	var cmd tea.Cmd
	m.list, cmd = m.list.Update(msg)
	return m, cmd
}

func (m model) View() string {
	if m.quit {
		return ""
	}
	help := helpStyle.Render("enter: open viewer • a: analyze • /: filter • q: quit")
	return m.list.View() + "\n" + help
}

// Run launches the interactive session picker TUI.
func Run(sessions []parser.SessionInfo) (Result, error) {
	items := make([]list.Item, len(sessions))
	for i, s := range sessions {
		items[i] = sessionItem{
			info:        s,
			hasAnalysis: parser.HasAnalysis(s.ID),
		}
	}

	delegate := list.NewDefaultDelegate()
	delegate.ShowDescription = true

	l := list.New(items, delegate, 80, 20)
	l.Title = "rewind sessions"
	l.SetShowStatusBar(true)
	l.SetFilteringEnabled(true)

	m := model{list: l}
	p := tea.NewProgram(m, tea.WithAltScreen())

	finalModel, err := p.Run()
	if err != nil {
		return Result{}, err
	}

	fm := finalModel.(model)
	return fm.result, nil
}

func formatSize(bytes int64) string {
	switch {
	case bytes >= 1<<20:
		return fmt.Sprintf("%.1fM", float64(bytes)/float64(1<<20))
	case bytes >= 1<<10:
		return fmt.Sprintf("%.0fK", float64(bytes)/float64(1<<10))
	default:
		return fmt.Sprintf("%dB", bytes)
	}
}

func formatAge(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}
