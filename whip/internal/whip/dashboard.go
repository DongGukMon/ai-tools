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
	// ── Color palette ──────────────────────────────────────────────
	colorPrimary   = lipgloss.Color("#8B5CF6") // vibrant purple
	colorSecondary = lipgloss.Color("#818CF8") // soft indigo
	colorAccent    = lipgloss.Color("#A78BFA") // light purple
	colorSuccess   = lipgloss.Color("#34D399") // emerald
	colorWarning   = lipgloss.Color("#FBBF24") // amber
	colorDanger    = lipgloss.Color("#F87171") // rose
	colorText      = lipgloss.Color("#F3F4F6") // gray-100
	colorMuted     = lipgloss.Color("#9CA3AF") // gray-400
	colorSubtle    = lipgloss.Color("#6B7280") // gray-500
	colorDim       = lipgloss.Color("#374151") // gray-700

	// ── Status styles ──────────────────────────────────────────────
	statusCreated    = lipgloss.NewStyle().Foreground(colorSubtle)
	statusAssigned   = lipgloss.NewStyle().Foreground(colorWarning)
	statusInProgress = lipgloss.NewStyle().Foreground(colorSecondary).Bold(true)
	statusCompleted  = lipgloss.NewStyle().Foreground(colorSuccess)
	statusFailed     = lipgloss.NewStyle().Foreground(colorDanger)

	// ── Cell styles ────────────────────────────────────────────────
	idStyle       = lipgloss.NewStyle().Foreground(colorWarning)
	pidAliveStyle = lipgloss.NewStyle().Foreground(colorSuccess)
	pidDeadStyle  = lipgloss.NewStyle().Foreground(colorDanger)

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

// ── Helpers ────────────────────────────────────────────────────────

// padRight pads a (possibly styled) string to the given visual width.
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

// ── View ───────────────────────────────────────────────────────────

func (m DashboardModel) View() string {
	var b strings.Builder
	w := min(m.width, 120)

	// ── Header ────────────────────────────────────────────
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

	// Accent separator
	b.WriteString(" " + lipgloss.NewStyle().Foreground(colorPrimary).Render(strings.Repeat("━", w-2)))
	b.WriteString("\n")

	// ── Error ─────────────────────────────────────────────
	if m.err != nil {
		errLabel := lipgloss.NewStyle().Foreground(colorDanger).Bold(true).Render("  ✗ Error:")
		errMsg := lipgloss.NewStyle().Foreground(colorDanger).Render(fmt.Sprintf(" %v", m.err))
		b.WriteString(errLabel + errMsg + "\n")
	}

	// ── Tasks ─────────────────────────────────────────────
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

	// ── IRC ───────────────────────────────────────────────
	b.WriteString("\n")
	b.WriteString(m.renderPeers())

	// ── Footer ────────────────────────────────────────────
	b.WriteString("\n")
	b.WriteString(m.renderFooter())

	return b.String()
}

func (m DashboardModel) renderTable() string {
	colID := 7
	colTitle := 24
	colStatus := 14
	colRunner := 6
	colIRC := 14
	colPID := 10
	colDeps := 12
	colNote := 18
	colUpdated := 10

	sep := styledSep()

	// Header labels
	hdrStyle := lipgloss.NewStyle().Bold(true).Foreground(colorMuted)
	hdrCells := []string{
		padRight(hdrStyle.Render("ID"), colID),
		padRight(hdrStyle.Render("TITLE"), colTitle),
		padRight(hdrStyle.Render("STATUS"), colStatus),
		padRight(hdrStyle.Render("RUNNER"), colRunner),
		padRight(hdrStyle.Render("IRC"), colIRC),
		padRight(hdrStyle.Render("PID"), colPID),
		padRight(hdrStyle.Render("DEPS"), colDeps),
		padRight(hdrStyle.Render("NOTE"), colNote),
		padRight(hdrStyle.Render("UPDATED"), colUpdated),
	}
	header := "  " + strings.Join(hdrCells, sep)

	// Header underline
	underline := "  " + lipgloss.NewStyle().Foreground(colorDim).Render(strings.Repeat("─", lipgloss.Width(header)-2))

	var rows []string
	rows = append(rows, header)
	rows = append(rows, underline)

	for _, t := range m.tasks {
		id := padRight(idStyle.Render(truncate(t.ID, colID)), colID)
		title := padRight(truncate(t.Title, colTitle), colTitle)
		status := padRight(renderStatus(t.Status), colStatus)
		runner := padRight(renderRunner(t.Runner), colRunner)

		ircName := truncate(t.IRCName, colIRC)
		if ircName == "" {
			ircName = lipgloss.NewStyle().Foreground(colorDim).Render("—")
		}
		irc := padRight(ircName, colIRC)

		pid := padRight(renderPID(t.ShellPID), colPID)
		deps := padRight(renderDeps(t.DependsOn), colDeps)

		noteStr := truncate(t.Note, colNote)
		if noteStr == "" {
			noteStr = lipgloss.NewStyle().Foreground(colorDim).Render("—")
		} else {
			noteStr = lipgloss.NewStyle().Foreground(colorMuted).Render(noteStr)
		}
		note := padRight(noteStr, colNote)

		updated := padRight(lipgloss.NewStyle().Foreground(colorSubtle).Render(timeAgo(t.UpdatedAt)), colUpdated)

		row := "  " + strings.Join([]string{id, title, status, runner, irc, pid, deps, note, updated}, sep)
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
		for _, p := range m.peers {
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

func (m DashboardModel) renderFooter() string {
	key := func(k, desc string) string {
		return lipgloss.NewStyle().Bold(true).Foreground(colorText).Render(k) +
			" " +
			lipgloss.NewStyle().Foreground(colorSubtle).Render(desc)
	}
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	refresh := lipgloss.NewStyle().Foreground(colorDim).Render("↻ 2s")

	return lipgloss.NewStyle().MarginTop(1).Render(
		"  " + key("q", "quit") + dot + key("r", "refresh") + dot + key("c", "clean") + dot + refresh,
	)
}

// ── Status / cell renderers ────────────────────────────────────────

func renderStatus(s TaskStatus) string {
	switch s {
	case StatusCreated:
		return statusCreated.Render("○ created")
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
