package main

import (
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/bang9/ai-tools/whip/internal/whip"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

type chartRow struct {
	Label   string
	Count   int
	Percent int
}

func statsCmd() *cobra.Command {
	var sinceArg string
	var lastArg string
	var includeArchived bool

	cmd := &cobra.Command{
		Use:   "stats",
		Short: "Show task usage patterns",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if sinceArg != "" && lastArg != "" {
				return fmt.Errorf("--since and --last cannot be used together")
			}

			store, err := whip.NewStore()
			if err != nil {
				return err
			}

			tasks, err := store.ListTasks()
			if err != nil {
				return err
			}
			if includeArchived {
				archivedTasks, err := store.ListArchivedTasks()
				if err != nil {
					return err
				}
				tasks = append(tasks, archivedTasks...)
			}

			filterLabel := "all time"
			if sinceArg != "" {
				since, err := parseStatsSinceDate(sinceArg)
				if err != nil {
					return err
				}
				tasks = filterTasksSince(tasks, since)
				filterLabel = "since " + sinceArg
			}
			if lastArg != "" {
				window, err := parseStatsLastDuration(lastArg)
				if err != nil {
					return err
				}
				tasks = filterTasksSince(tasks, time.Now().Add(-window))
				filterLabel = "last " + lastArg
			}

			if len(tasks) == 0 {
				fmt.Println("No tasks found")
				return nil
			}

			total := len(tasks)
			completedCount := 0
			var completedDuration time.Duration
			completedWithDuration := 0
			for _, task := range tasks {
				if task.Status == whip.StatusCompleted {
					completedCount++
					if task.CompletedAt != nil {
						completedDuration += task.CompletedAt.Sub(task.CreatedAt)
						completedWithDuration++
					}
				}
			}

			avgDuration := "n/a"
			if completedWithDuration > 0 {
				avgDuration = formatStatsDuration(completedDuration / time.Duration(completedWithDuration))
			}

			fmt.Printf("Overview (%d %s, %s)\n", total, pluralizeTasks(total), filterLabel)
			fmt.Println(strings.Repeat("─", maxInt(32, len(fmt.Sprintf("Overview (%d %s, %s)", total, pluralizeTasks(total), filterLabel)))))
			fmt.Printf("Completed    %d/%d  (%d%%)\n", completedCount, total, percentOf(completedCount, total))
			fmt.Printf("Avg Duration %s\n\n", avgDuration)

			typeRows := buildChartRows(tasks, func(task *whip.Task) string {
				return statsLabel(task.Type)
			})
			backendRows := buildChartRows(tasks, func(task *whip.Task) string {
				return statsLabel(task.Backend)
			})
			scopeRows := buildChartRows(tasks, func(task *whip.Task) string {
				if task.WorkspaceName() == whip.GlobalWorkspaceName {
					return whip.GlobalWorkspaceName
				}
				return "workspace"
			})
			difficultyRows := buildChartRows(tasks, func(task *whip.Task) string {
				return statsLabel(task.Difficulty)
			})

			printStatsSection("By Type", typeRows)
			fmt.Println()
			printStatsSection("By Backend", backendRows)
			fmt.Println()
			printStatsSection("By Scope", scopeRows)
			fmt.Println()
			printStatsSection("By Difficulty", difficultyRows)

			return nil
		},
	}

	cmd.Flags().StringVar(&sinceArg, "since", "", "Only include tasks created on or after YYYY-MM-DD")
	cmd.Flags().StringVar(&lastArg, "last", "", "Only include tasks from the last window (for example 30d or 48h)")
	cmd.Flags().BoolVar(&includeArchived, "include-archived", false, "Include archived tasks")
	return cmd
}

func printStatsSection(title string, rows []chartRow) {
	fmt.Println(title)
	fmt.Println(renderBarChart(rows, statsBarWidth(rows, 40)))
}

func buildChartRows(tasks []*whip.Task, labelForTask func(*whip.Task) string) []chartRow {
	counts := make(map[string]int)
	for _, task := range tasks {
		counts[labelForTask(task)]++
	}

	rows := make([]chartRow, 0, len(counts))
	total := len(tasks)
	for label, count := range counts {
		rows = append(rows, chartRow{
			Label:   label,
			Count:   count,
			Percent: percentOf(count, total),
		})
	}

	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Count != rows[j].Count {
			return rows[i].Count > rows[j].Count
		}
		return rows[i].Label < rows[j].Label
	})
	return rows
}

func renderBarChart(rows []chartRow, maxBarWidth int) string {
	if len(rows) == 0 {
		return ""
	}
	if maxBarWidth < 1 {
		maxBarWidth = 1
	}

	labelWidth := 0
	maxCount := 0
	for _, row := range rows {
		if len(row.Label) > labelWidth {
			labelWidth = len(row.Label)
		}
		if row.Count > maxCount {
			maxCount = row.Count
		}
	}

	var b strings.Builder
	for i, row := range rows {
		if i > 0 {
			b.WriteByte('\n')
		}
		barWidth := 0
		if maxCount > 0 {
			barWidth = int(math.Round(float64(row.Count) / float64(maxCount) * float64(maxBarWidth)))
		}
		if row.Count > 0 && barWidth == 0 {
			barWidth = 1
		}
		if barWidth > maxBarWidth {
			barWidth = maxBarWidth
		}

		bar := strings.Repeat("█", barWidth) + strings.Repeat(" ", maxBarWidth-barWidth)
		fmt.Fprintf(&b, "%-*s  %s  %3d%%  (%d)", labelWidth, row.Label, bar, row.Percent, row.Count)
	}
	return b.String()
}

func statsBarWidth(rows []chartRow, defaultMax int) int {
	if defaultMax <= 0 {
		defaultMax = 40
	}
	width, _, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil || width <= 0 {
		return defaultMax
	}

	labelWidth := 0
	countWidth := len("(0)")
	for _, row := range rows {
		if len(row.Label) > labelWidth {
			labelWidth = len(row.Label)
		}
		if w := len(fmt.Sprintf("(%d)", row.Count)); w > countWidth {
			countWidth = w
		}
	}

	available := width - labelWidth - countWidth - len("    100%")
	switch {
	case available < 10:
		return 10
	case available > defaultMax:
		return defaultMax
	default:
		return available
	}
}

func filterTasksSince(tasks []*whip.Task, since time.Time) []*whip.Task {
	filtered := make([]*whip.Task, 0, len(tasks))
	for _, task := range tasks {
		if !task.CreatedAt.Before(since) {
			filtered = append(filtered, task)
		}
	}
	return filtered
}

func parseStatsSinceDate(value string) (time.Time, error) {
	parsed, err := time.ParseInLocation("2006-01-02", value, time.Local)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid --since %q: must use YYYY-MM-DD", value)
	}
	return parsed, nil
}

func parseStatsLastDuration(value string) (time.Duration, error) {
	raw := strings.TrimSpace(strings.ToLower(value))
	if raw == "" {
		return 0, fmt.Errorf("--last cannot be empty")
	}

	for _, unit := range []string{"d", "w"} {
		if strings.HasSuffix(raw, unit) {
			n, err := strconv.Atoi(strings.TrimSuffix(raw, unit))
			if err != nil || n <= 0 {
				return 0, fmt.Errorf("invalid --last %q", value)
			}
			switch unit {
			case "d":
				return time.Duration(n) * 24 * time.Hour, nil
			case "w":
				return time.Duration(n) * 7 * 24 * time.Hour, nil
			}
		}
	}

	duration, err := time.ParseDuration(raw)
	if err != nil || duration <= 0 {
		return 0, fmt.Errorf("invalid --last %q", value)
	}
	return duration, nil
}

func formatStatsDuration(duration time.Duration) string {
	if duration < 0 {
		duration = -duration
	}
	if duration < time.Minute {
		seconds := int(math.Round(duration.Seconds()))
		if seconds < 1 {
			seconds = 1
		}
		return fmt.Sprintf("%ds", seconds)
	}

	hours := duration / time.Hour
	minutes := (duration % time.Hour) / time.Minute
	switch {
	case hours > 0 && minutes > 0:
		return fmt.Sprintf("%dh %dm", hours, minutes)
	case hours > 0:
		return fmt.Sprintf("%dh", hours)
	default:
		return fmt.Sprintf("%dm", minutes)
	}
}

func percentOf(count, total int) int {
	if total == 0 {
		return 0
	}
	return int(math.Round(float64(count) * 100 / float64(total)))
}

func statsLabel(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "(unset)"
	}
	return trimmed
}

func pluralizeTasks(total int) string {
	if total == 1 {
		return "task"
	}
	return "tasks"
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
