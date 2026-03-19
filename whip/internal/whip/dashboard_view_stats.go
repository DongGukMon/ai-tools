package whip

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
)

const statsUnsetLabel = "(unset)"

func (m *DashboardModel) computeStatsSections() []statsSection {
	tasks, err := m.statsTasks()
	if err != nil {
		m.err = err
		return nil
	}
	m.err = nil
	if len(tasks) == 0 {
		return nil
	}

	return []statsSection{
		computeStatsOverviewSection(tasks),
		computeOrderedStatsSection("Type", tasks, func(task *Task) string {
			return normalizeStatsLabel(task.Type)
		}, orderedTaskTypeLabels()),
		computeSortedStatsSection("Backend", tasks, func(task *Task) string {
			return normalizeStatsLabel(task.Backend)
		}),
		computeSortedStatsSection("Scope", tasks, func(task *Task) string {
			if task.WorkspaceName() == GlobalWorkspaceName {
				return "global"
			}
			return "workspace"
		}),
		computeSortedStatsSection("Difficulty", tasks, func(task *Task) string {
			return normalizeStatsLabel(task.Difficulty)
		}),
	}
}

func (m DashboardModel) statsTasks() ([]*Task, error) {
	activeTasks := m.tasks
	if m.listMode != listModeActive || activeTasks == nil {
		var err error
		activeTasks, err = m.store.ListTasks()
		if err != nil {
			return nil, err
		}
	}

	tasks := append([]*Task(nil), activeTasks...)
	if !m.statsIncludeArchived {
		return tasks, nil
	}

	archivedTasks, err := m.store.ListArchivedTasks()
	if err != nil {
		return nil, err
	}
	return append(tasks, archivedTasks...), nil
}

func computeStatsOverviewSection(tasks []*Task) statsSection {
	total := len(tasks)
	completed := 0
	var totalDuration time.Duration
	durationSamples := 0

	for _, task := range tasks {
		if task.Status == StatusCompleted {
			completed++
		}
		if task.Status != StatusCompleted || task.CompletedAt == nil || task.CompletedAt.Before(task.CreatedAt) {
			continue
		}
		totalDuration += task.CompletedAt.Sub(task.CreatedAt)
		durationSamples++
	}

	avgSeconds := -1
	if durationSamples > 0 {
		avgSeconds = int((totalDuration / time.Duration(durationSamples)).Seconds())
	}

	return statsSection{
		Title: "Overview",
		Rows: []statsRow{
			{Label: "Completed", Count: completed, Percent: statsPercent(completed, total)},
			{Label: "Avg Duration", Count: avgSeconds},
		},
	}
}

func computeSortedStatsSection(title string, tasks []*Task, labelFn func(*Task) string) statsSection {
	counts := countStatsLabels(tasks, labelFn)
	return statsSection{Title: title, Rows: buildSortedStatsRows(counts, len(tasks))}
}

func computeOrderedStatsSection(title string, tasks []*Task, labelFn func(*Task) string, order []string) statsSection {
	counts := countStatsLabels(tasks, labelFn)
	return statsSection{Title: title, Rows: buildOrderedStatsRows(counts, len(tasks), order)}
}

func countStatsLabels(tasks []*Task, labelFn func(*Task) string) map[string]int {
	counts := make(map[string]int)
	for _, task := range tasks {
		counts[labelFn(task)]++
	}
	return counts
}

func buildSortedStatsRows(counts map[string]int, total int) []statsRow {
	labels := make([]string, 0, len(counts))
	for label := range counts {
		labels = append(labels, label)
	}
	sortStatsLabels(labels, counts)
	return buildStatsRowsForLabels(labels, counts, total)
}

func buildOrderedStatsRows(counts map[string]int, total int, order []string) []statsRow {
	remaining := make(map[string]int, len(counts))
	for label, count := range counts {
		remaining[label] = count
	}

	rows := make([]statsRow, 0, len(counts))
	for _, label := range order {
		if count := remaining[label]; count > 0 {
			rows = append(rows, statsRow{
				Label:   label,
				Count:   count,
				Percent: statsPercent(count, total),
			})
			delete(remaining, label)
		}
	}

	rest := make([]string, 0, len(remaining))
	for label := range remaining {
		rest = append(rest, label)
	}
	sortStatsLabels(rest, remaining)
	return append(rows, buildStatsRowsForLabels(rest, remaining, total)...)
}

func buildStatsRowsForLabels(labels []string, counts map[string]int, total int) []statsRow {
	rows := make([]statsRow, 0, len(labels))
	for _, label := range labels {
		count := counts[label]
		if count <= 0 {
			continue
		}
		rows = append(rows, statsRow{
			Label:   label,
			Count:   count,
			Percent: statsPercent(count, total),
		})
	}
	return rows
}

func sortStatsLabels(labels []string, counts map[string]int) {
	sort.Slice(labels, func(i, j int) bool {
		if counts[labels[i]] != counts[labels[j]] {
			return counts[labels[i]] > counts[labels[j]]
		}
		if labels[i] == statsUnsetLabel || labels[j] == statsUnsetLabel {
			return labels[i] == statsUnsetLabel
		}
		return labels[i] < labels[j]
	})
}

func orderedTaskTypeLabels() []string {
	order := append([]string{}, AllTaskTypes()...)
	order = append(order, statsUnsetLabel)
	return order
}

func normalizeStatsLabel(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return statsUnsetLabel
	}
	return trimmed
}

func statsPercent(count, total int) float64 {
	if total <= 0 {
		return 0
	}
	return float64(count) * 100 / float64(total)
}

func (m DashboardModel) renderStatsView(w int) string {
	var b strings.Builder

	b.WriteString(m.renderStatsBreadcrumb(w))
	b.WriteString("\n\n")

	if len(m.statsSections) == 0 {
		empty := "  No active tasks available."
		if m.statsIncludeArchived {
			empty = "  No task data available."
		}
		b.WriteString(lipgloss.NewStyle().
			Foreground(colorSubtle).
			Italic(true).
			Render(empty))
		b.WriteString("\n\n")
		b.WriteString(m.renderStatsFooter())
		return b.String()
	}

	lines := m.renderStatsContentLines(w)
	maxLines := m.height - 8
	if maxLines < 4 {
		maxLines = 4
	}

	maxScroll := len(lines) - maxLines
	if maxScroll < 0 {
		maxScroll = 0
	}
	scroll := m.statsScroll
	if scroll > maxScroll {
		scroll = maxScroll
	}
	if scroll < 0 {
		scroll = 0
	}

	end := scroll + maxLines
	if end > len(lines) {
		end = len(lines)
	}

	if len(lines) > maxLines {
		b.WriteString(lipgloss.NewStyle().Foreground(colorSubtle).Render(
			fmt.Sprintf("  (%d-%d/%d ↑↓)", scroll+1, end, len(lines)),
		))
		b.WriteString("\n")
	}

	for _, line := range lines[scroll:end] {
		b.WriteString(line)
		b.WriteString("\n")
	}

	b.WriteString("\n")
	b.WriteString(m.renderStatsFooter())
	return b.String()
}

func (m DashboardModel) renderStatsBreadcrumb(w int) string {
	breadcrumb := lipgloss.NewStyle().Foreground(colorSubtle).Render("  Tasks") +
		lipgloss.NewStyle().Foreground(colorDim).Render(" › ") +
		lipgloss.NewStyle().Foreground(colorAccent).Bold(true).Render("Stats")

	indicatorStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(colorText).
		Background(colorDim).
		Padding(0, 1)
	indicator := indicatorStyle.Render("[Active only]")
	if m.statsIncludeArchived {
		indicator = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#111827")).
			Background(colorWarning).
			Padding(0, 1).
			Render("[Including archived]")
	}

	gap := w - lipgloss.Width(breadcrumb) - lipgloss.Width(indicator)
	if gap < 2 {
		gap = 2
	}
	return breadcrumb + strings.Repeat(" ", gap) + indicator
}

func (m DashboardModel) renderStatsContentLines(w int) []string {
	sections := m.statsSections
	totalTasks := 0
	if len(sections) > 1 {
		totalTasks = statsRowTotal(sections[1].Rows)
	}

	blocks := make([]string, 0, len(sections))
	for i, section := range sections {
		if i == 0 {
			blocks = append(blocks, renderOverviewStatsSection(section, totalTasks, w))
			continue
		}
		blocks = append(blocks, renderChartStatsSection(section, w))
	}

	content := strings.TrimRight(strings.Join(blocks, "\n\n"), "\n")
	if content == "" {
		return nil
	}
	return strings.Split(content, "\n")
}

func renderOverviewStatsSection(section statsSection, totalTasks, w int) string {
	var b strings.Builder

	title := fmt.Sprintf("  %s (%d tasks)", section.Title, totalTasks)
	b.WriteString(lipgloss.NewStyle().Bold(true).Foreground(colorAccent).Render(title))
	b.WriteString("\n")
	b.WriteString("  " + lipgloss.NewStyle().Foreground(colorDim).Render(strings.Repeat("─", max(12, w-4))))
	b.WriteString("\n")

	labelStyle := lipgloss.NewStyle().Bold(true).Foreground(colorMuted).Width(14)
	valueStyle := lipgloss.NewStyle().Foreground(colorText)
	completed := findStatsRow(section.Rows, "Completed")
	avgDuration := findStatsRow(section.Rows, "Avg Duration")

	completedValue := fmt.Sprintf("%d/%d  (%d%%)", completed.Count, totalTasks, int(math.Round(completed.Percent)))
	avgValue := "—"
	if avgDuration.Count >= 0 {
		avgValue = formatStatsDuration(time.Duration(avgDuration.Count) * time.Second)
	}

	b.WriteString("  " + labelStyle.Render("Completed") + " " + valueStyle.Render(completedValue) + "\n")
	b.WriteString("  " + labelStyle.Render("Avg Duration") + " " + valueStyle.Render(avgValue))
	return b.String()
}

func renderChartStatsSection(section statsSection, w int) string {
	var b strings.Builder

	b.WriteString(lipgloss.NewStyle().Bold(true).Foreground(colorAccent).Render("  " + section.Title))
	b.WriteString("\n")
	b.WriteString("  " + lipgloss.NewStyle().Foreground(colorDim).Render(strings.Repeat("─", max(12, w-4))))
	b.WriteString("\n")

	if len(section.Rows) == 0 {
		b.WriteString(lipgloss.NewStyle().Foreground(colorSubtle).Italic(true).Render("  (no data)"))
		return b.String()
	}

	rawLabelWidth := 0
	metricWidth := 0
	maxCount := 0
	for _, row := range section.Rows {
		rawLabelWidth = max(rawLabelWidth, lipgloss.Width(row.Label))
		metricWidth = max(metricWidth, lipgloss.Width(formatStatsMetric(row)))
		maxCount = max(maxCount, row.Count)
	}

	labelWidth := rawLabelWidth
	labelMax := max(8, (w-18)/3)
	if labelWidth > labelMax {
		labelWidth = labelMax
	}

	barWidth := w - 2 - labelWidth - 2 - metricWidth - 2
	if barWidth < 8 {
		barWidth = 8
	}

	labelStyle := lipgloss.NewStyle().Foreground(colorText)
	metricStyle := lipgloss.NewStyle().Foreground(colorMuted).Width(metricWidth).Align(lipgloss.Right)
	barStyle := lipgloss.NewStyle().Foreground(colorAccent)
	trackStyle := lipgloss.NewStyle().Foreground(colorDim)

	for _, row := range section.Rows {
		filled := 0
		if maxCount > 0 {
			filled = int(math.Round(float64(barWidth) * float64(row.Count) / float64(maxCount)))
		}
		if row.Count > 0 && filled == 0 {
			filled = 1
		}
		if filled > barWidth {
			filled = barWidth
		}

		bar := barStyle.Render(strings.Repeat("█", filled))
		if remainder := barWidth - filled; remainder > 0 {
			bar += trackStyle.Render(strings.Repeat("░", remainder))
		}

		label := truncate(row.Label, labelWidth)
		b.WriteString("  " + labelStyle.Render(padRight(label, labelWidth)))
		b.WriteString("  " + bar)
		b.WriteString("  " + metricStyle.Render(formatStatsMetric(row)))
		b.WriteString("\n")
	}

	return strings.TrimRight(b.String(), "\n")
}

func formatStatsMetric(row statsRow) string {
	return fmt.Sprintf("%3.0f%%  %d", math.Round(row.Percent), row.Count)
}

func formatStatsDuration(duration time.Duration) string {
	if duration <= 0 {
		return "—"
	}
	if duration < time.Minute {
		return fmt.Sprintf("%ds", int(duration.Round(time.Second)/time.Second))
	}

	rounded := duration.Round(time.Minute)
	totalHours := int(rounded / time.Hour)
	days := totalHours / 24
	hours := totalHours % 24
	minutes := int((rounded % time.Hour) / time.Minute)

	switch {
	case days > 0 && hours > 0:
		return fmt.Sprintf("%dd %dh", days, hours)
	case days > 0:
		return fmt.Sprintf("%dd", days)
	case hours > 0 && minutes > 0:
		return fmt.Sprintf("%dh %dm", hours, minutes)
	case hours > 0:
		return fmt.Sprintf("%dh", hours)
	default:
		return fmt.Sprintf("%dm", minutes)
	}
}

func findStatsRow(rows []statsRow, label string) statsRow {
	for _, row := range rows {
		if row.Label == label {
			return row
		}
	}
	return statsRow{Label: label, Count: -1}
}

func statsRowTotal(rows []statsRow) int {
	total := 0
	for _, row := range rows {
		total += row.Count
	}
	return total
}

func (m DashboardModel) renderStatsFooter() string {
	dot := lipgloss.NewStyle().Foreground(colorDim).Render("  ·  ")
	line := "  " + footerKey("←/esc", "back") +
		dot + footerKey("a", "toggle archived") +
		dot + footerKey("↑↓", "scroll") +
		dot + footerKey("r", "refresh")
	return lipgloss.NewStyle().MarginTop(1).Render(line)
}
