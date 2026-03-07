package whip

import (
	"fmt"
	"os/exec"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	// Colors
	colorPrimary   = lipgloss.Color("#7C3AED") // purple
	colorSecondary = lipgloss.Color("#6366F1") // indigo
	colorSuccess   = lipgloss.Color("#10B981") // green
	colorWarning   = lipgloss.Color("#F59E0B") // amber
	colorDanger    = lipgloss.Color("#EF4444") // red
	colorMuted     = lipgloss.Color("#6B7280") // gray
	colorText      = lipgloss.Color("#E5E7EB") // light gray
	colorDim       = lipgloss.Color("#4B5563") // dim gray
	colorBg        = lipgloss.Color("#111827") // dark bg
	colorHeaderBg  = lipgloss.Color("#1F2937") // header bg

	// Styles
	headerStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#FFFFFF")).
			Background(colorPrimary).
			Padding(0, 1)

	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(colorPrimary)

	subtitleStyle = lipgloss.NewStyle().
			Foreground(colorMuted)

	statusCreated = lipgloss.NewStyle().
			Foreground(colorMuted).
			Bold(true)

	statusAssigned = lipgloss.NewStyle().
			Foreground(colorWarning).
			Bold(true)

	statusInProgress = lipgloss.NewStyle().
				Foreground(colorSecondary).
				Bold(true)

	statusCompleted = lipgloss.NewStyle().
			Foreground(colorSuccess).
			Bold(true)

	statusFailed = lipgloss.NewStyle().
			Foreground(colorDanger).
			Bold(true)

	tableHeaderStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(colorText).
				BorderStyle(lipgloss.NormalBorder()).
				BorderBottom(true).
				BorderForeground(colorDim)

	rowStyle = lipgloss.NewStyle().
			Foreground(colorText)

	rowAltStyle = lipgloss.NewStyle().
			Foreground(colorText).
			Background(lipgloss.Color("#1a1f2e"))

	idStyle = lipgloss.NewStyle().
		Foreground(colorWarning)

	pidAliveStyle = lipgloss.NewStyle().
			Foreground(colorSuccess)

	pidDeadStyle = lipgloss.NewStyle().
			Foreground(colorDanger)

	footerStyle = lipgloss.NewStyle().
			Foreground(colorMuted).
			MarginTop(1)

	separatorStyle = lipgloss.NewStyle().
			Foreground(colorDim)

	summaryBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(colorDim).
			Padding(0, 1).
			MarginTop(1)

	countStyle = lipgloss.NewStyle().
			Bold(true)

	spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
)

type tickMsg time.Time
type cleanedMsg int

type peerInfo struct {
	Name   string
	Online bool
}
type peersMsg []peerInfo

type DashboardModel struct {
	store        *Store
	tasks        []*Task
	peers        []peerInfo
	version      string
	width        int
	height       int
	err          error
	spinnerIndex int
	tickCount    int
}

func NewDashboardModel(store *Store, version string) DashboardModel {
	return DashboardModel{
		store:   store,
		version: version,
		width:   120,
	}
}

func (m DashboardModel) Init() tea.Cmd {
	return tea.Batch(
		m.loadTasks(),
		loadPeers(),
		tickCmd(),
	)
}

func tickCmd() tea.Cmd {
	return tea.Tick(time.Second*2, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

func (m DashboardModel) cleanTasks() tea.Cmd {
	return func() tea.Msg {
		count, _ := m.store.CleanTerminal()
		return cleanedMsg(count)
	}
}

func (m DashboardModel) loadTasks() tea.Cmd {
	return func() tea.Msg {
		tasks, err := m.store.ListTasks()
		if err != nil {
			return err
		}
		return tasks
	}
}

func loadPeers() tea.Cmd {
	return func() tea.Msg {
		out, err := exec.Command("claude-irc", "who").Output()
		if err != nil {
			return peersMsg(nil)
		}
		var peers []peerInfo
		for _, line := range strings.Split(string(out), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 2 || fields[0] == "PEER" {
				continue
			}
			peers = append(peers, peerInfo{
				Name:   fields[0],
				Online: fields[1] == "online",
			})
		}
		return peersMsg(peers)
	}
}

func (m DashboardModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "r":
			return m, m.loadTasks()
		case "c":
			return m, m.cleanTasks()
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case []*Task:
		m.tasks = msg
		m.err = nil

	case peersMsg:
		m.peers = []peerInfo(msg)

	case cleanedMsg:
		return m, m.loadTasks()

	case error:
		m.err = msg

	case tickMsg:
		m.spinnerIndex = (m.spinnerIndex + 1) % len(spinnerFrames)
		m.tickCount++
		return m, tea.Batch(m.loadTasks(), loadPeers(), tickCmd())
	}

	return m, nil
}

func (m DashboardModel) View() string {
	var b strings.Builder

	// Header
	spinner := lipgloss.NewStyle().Foreground(colorSecondary).Render(spinnerFrames[m.spinnerIndex])
	versionStr := ""
	if m.version != "" {
		versionStr = "  " + lipgloss.NewStyle().Foreground(colorDim).Render(m.version)
	}
	header := headerStyle.Render(" WHIP ") +
		" " +
		titleStyle.Render("Task Orchestrator") +
		versionStr +
		"  " +
		spinner +
		" " +
		subtitleStyle.Render(time.Now().Format("15:04:05"))
	b.WriteString(header)
	b.WriteString("\n")

	// Separator
	sep := separatorStyle.Render(strings.Repeat("─", min(m.width, 120)))
	b.WriteString(sep)
	b.WriteString("\n")

	if m.err != nil {
		b.WriteString(lipgloss.NewStyle().Foreground(colorDanger).Render(fmt.Sprintf("Error: %v", m.err)))
		b.WriteString("\n")
	}

	if len(m.tasks) == 0 {
		empty := lipgloss.NewStyle().
			Foreground(colorMuted).
			Italic(true).
			MarginTop(1).
			MarginLeft(2).
			Render("No tasks. Create one with: whip create \"title\" --desc \"description\"")
		b.WriteString(empty)
		b.WriteString("\n")
	} else {
		b.WriteString(m.renderTable())
		b.WriteString("\n")
		b.WriteString(m.renderSummary())
	}

	// IRC peers
	b.WriteString("\n")
	b.WriteString(m.renderPeers())

	// Footer
	b.WriteString("\n")
	b.WriteString(footerStyle.Render("  q quit  r refresh  c clean completed  Auto-refreshing every 2s"))

	return b.String()
}

func (m DashboardModel) renderTable() string {
	// Column widths
	colID := 7
	colTitle := 24
	colStatus := 14
	colRunner := 6
	colIRC := 14
	colPID := 10
	colDeps := 12
	colNote := 18
	colUpdated := 10

	// Header row
	hdr := fmt.Sprintf("  %-*s  %-*s  %-*s  %-*s  %-*s  %-*s  %-*s  %-*s  %-*s",
		colID, "ID",
		colTitle, "TITLE",
		colStatus, "STATUS",
		colRunner, "RUNNER",
		colIRC, "IRC",
		colPID, "PID",
		colDeps, "DEPS",
		colNote, "NOTE",
		colUpdated, "UPDATED",
	)
	header := tableHeaderStyle.Render(hdr)

	var rows []string
	rows = append(rows, header)

	for i, t := range m.tasks {
		id := idStyle.Render(truncate(t.ID, colID))

		title := truncate(t.Title, colTitle)

		status := renderStatus(t.Status)

		runnerStr := renderRunner(t.Runner)

		irc := truncate(t.IRCName, colIRC)
		if irc == "" {
			irc = lipgloss.NewStyle().Foreground(colorDim).Render("—")
		}

		pidStr := renderPID(t.ShellPID)

		deps := renderDeps(t.DependsOn)

		note := lipgloss.NewStyle().Foreground(colorMuted).Render(truncate(t.Note, colNote))
		if t.Note == "" {
			note = lipgloss.NewStyle().Foreground(colorDim).Render("—")
		}

		updated := subtitleStyle.Render(timeAgo(t.UpdatedAt))

		row := fmt.Sprintf("  %-*s  %-*s  %-*s  %-*s  %-*s  %-*s  %-*s  %-*s  %-*s",
			colID+len(id)-lipgloss.Width(id), id,
			colTitle+len(title)-lipgloss.Width(title), title,
			colStatus+len(status)-lipgloss.Width(status), status,
			colRunner+len(runnerStr)-lipgloss.Width(runnerStr), runnerStr,
			colIRC+len(irc)-lipgloss.Width(irc), irc,
			colPID+len(pidStr)-lipgloss.Width(pidStr), pidStr,
			colDeps+len(deps)-lipgloss.Width(deps), deps,
			colNote+len(note)-lipgloss.Width(note), note,
			colUpdated+len(updated)-lipgloss.Width(updated), updated,
		)

		style := rowStyle
		if i%2 == 1 {
			style = rowAltStyle
		}
		rows = append(rows, style.Render(row))
	}

	return strings.Join(rows, "\n")
}

func (m DashboardModel) renderSummary() string {
	counts := map[TaskStatus]int{}
	for _, t := range m.tasks {
		counts[t.Status]++
	}

	total := len(m.tasks)
	parts := []string{
		countStyle.Copy().Foreground(colorText).Render(fmt.Sprintf("%d total", total)),
	}

	if n := counts[StatusCreated]; n > 0 {
		parts = append(parts, statusCreated.Render(fmt.Sprintf("%d created", n)))
	}
	if n := counts[StatusAssigned]; n > 0 {
		parts = append(parts, statusAssigned.Render(fmt.Sprintf("%d assigned", n)))
	}
	if n := counts[StatusInProgress]; n > 0 {
		parts = append(parts, statusInProgress.Render(fmt.Sprintf("%d in_progress", n)))
	}
	if n := counts[StatusCompleted]; n > 0 {
		parts = append(parts, statusCompleted.Render(fmt.Sprintf("%d completed", n)))
	}
	if n := counts[StatusFailed]; n > 0 {
		parts = append(parts, statusFailed.Render(fmt.Sprintf("%d failed", n)))
	}

	return summaryBoxStyle.Render(strings.Join(parts, "  ·  "))
}

func (m DashboardModel) renderPeers() string {
	label := lipgloss.NewStyle().Bold(true).Foreground(colorText).Render("IRC")
	if m.peers == nil {
		return "  " + label + "  " + lipgloss.NewStyle().Foreground(colorDim).Render("not connected")
	}
	if len(m.peers) == 0 {
		return "  " + label + "  " + lipgloss.NewStyle().Foreground(colorDim).Render("no peers")
	}
	var parts []string
	for _, p := range m.peers {
		nameStyle := lipgloss.NewStyle().Foreground(colorSuccess)
		statusStr := "online"
		if !p.Online {
			nameStyle = lipgloss.NewStyle().Foreground(colorDim)
			statusStr = "offline"
		}
		parts = append(parts, nameStyle.Render(p.Name)+" "+lipgloss.NewStyle().Foreground(colorDim).Render("("+statusStr+")"))
	}
	return "  " + label + "  " + strings.Join(parts, lipgloss.NewStyle().Foreground(colorDim).Render("  ·  "))
}

func renderStatus(s TaskStatus) string {
	switch s {
	case StatusCreated:
		return statusCreated.Render("● created")
	case StatusAssigned:
		return statusAssigned.Render("◐ assigned")
	case StatusInProgress:
		return statusInProgress.Render("▶ in_progress")
	case StatusCompleted:
		return statusCompleted.Render("✓ completed")
	case StatusFailed:
		return statusFailed.Render("✗ failed")
	default:
		return string(s)
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

func renderPID(pid int) string {
	if pid <= 0 {
		return lipgloss.NewStyle().Foreground(colorDim).Render("—")
	}
	if IsProcessAlive(pid) {
		return pidAliveStyle.Render(fmt.Sprintf("● %d", pid))
	}
	return pidDeadStyle.Render(fmt.Sprintf("✗ %d", pid))
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

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
