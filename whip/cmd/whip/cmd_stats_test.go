package main

import (
	"strings"
	"testing"
	"time"

	whiplib "github.com/bang9/ai-tools/whip/internal/whip"
)

func TestStatsCommand_NoTasksFound(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	stdout, stderr, err := execWhipCLICapture(t, "stats")
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	if stderr != "" {
		t.Fatalf("stats stderr = %q, want empty", stderr)
	}
	if strings.TrimSpace(stdout) != "No tasks found" {
		t.Fatalf("stats stdout = %q, want %q", strings.TrimSpace(stdout), "No tasks found")
	}
}

func TestStatsCommand_RendersOverviewAndSections(t *testing.T) {
	store := newStatsTestStore(t)

	saveStatsTask(t, store, statsTaskSpec{
		title:       "Implement feature",
		taskType:    whiplib.TaskTypeCoding,
		backend:     "claude",
		workspace:   whiplib.GlobalWorkspaceName,
		difficulty:  "medium",
		status:      whiplib.StatusCompleted,
		createdAt:   time.Date(2026, 3, 10, 9, 0, 0, 0, time.UTC),
		completedAt: ptrStatsTime(time.Date(2026, 3, 10, 11, 0, 0, 0, time.UTC)),
	})
	saveStatsTask(t, store, statsTaskSpec{
		title:       "Fix crash",
		taskType:    whiplib.TaskTypeDebugging,
		backend:     "codex",
		workspace:   "demo",
		difficulty:  "hard",
		status:      whiplib.StatusCompleted,
		createdAt:   time.Date(2026, 3, 11, 9, 0, 0, 0, time.UTC),
		completedAt: ptrStatsTime(time.Date(2026, 3, 11, 10, 0, 0, 0, time.UTC)),
	})
	saveStatsTask(t, store, statsTaskSpec{
		title:      "Frontend polish",
		taskType:   whiplib.TaskTypeFrontend,
		backend:    "",
		workspace:  whiplib.GlobalWorkspaceName,
		difficulty: "",
		status:     whiplib.StatusInProgress,
		createdAt:  time.Date(2026, 3, 12, 9, 0, 0, 0, time.UTC),
	})
	saveStatsTask(t, store, statsTaskSpec{
		title:      "Legacy item",
		taskType:   "",
		backend:    "",
		workspace:  whiplib.GlobalWorkspaceName,
		difficulty: "",
		status:     whiplib.StatusCreated,
		createdAt:  time.Date(2026, 3, 13, 9, 0, 0, 0, time.UTC),
	})

	stdout, _, err := execWhipCLICapture(t, "stats")
	if err != nil {
		t.Fatalf("stats: %v", err)
	}

	for _, want := range []string{"Overview", "By Type", "By Backend", "By Scope", "By Difficulty"} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("stats output missing %q:\n%s", want, stdout)
		}
	}
	if !strings.Contains(stdout, "Completed    2/4  (50%)") {
		t.Fatalf("stats output missing completion rate:\n%s", stdout)
	}
	if !strings.Contains(stdout, "Avg Duration 1h 30m") {
		t.Fatalf("stats output missing average duration:\n%s", stdout)
	}
	if !strings.Contains(stdout, "(unset)") {
		t.Fatalf("stats output missing unset bucket:\n%s", stdout)
	}
}

func TestStatsCommand_IncludesArchivedByDefault(t *testing.T) {
	store := newStatsTestStore(t)

	saveStatsTask(t, store, statsTaskSpec{
		title:      "Active feature",
		taskType:   whiplib.TaskTypeCoding,
		backend:    "claude",
		workspace:  whiplib.GlobalWorkspaceName,
		difficulty: "medium",
		status:     whiplib.StatusCreated,
		createdAt:  time.Date(2026, 3, 10, 9, 0, 0, 0, time.UTC),
	})
	saveStatsTask(t, store, statsTaskSpec{
		title:       "Archived fix",
		taskType:    whiplib.TaskTypeDebugging,
		backend:     "codex",
		workspace:   whiplib.GlobalWorkspaceName,
		difficulty:  "hard",
		status:      whiplib.StatusCompleted,
		createdAt:   time.Date(2026, 3, 11, 9, 0, 0, 0, time.UTC),
		completedAt: ptrStatsTime(time.Date(2026, 3, 11, 11, 0, 0, 0, time.UTC)),
		archived:    true,
	})

	stdout, _, err := execWhipCLICapture(t, "stats")
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	if !strings.Contains(stdout, "Overview (2 tasks, all time)") {
		t.Fatalf("stats should include all tasks by default:\n%s", stdout)
	}
	if !strings.Contains(stdout, whiplib.TaskTypeDebugging) {
		t.Fatalf("stats should include archived task types by default:\n%s", stdout)
	}
}

func TestStatsCommand_LastFilter(t *testing.T) {
	store := newStatsTestStore(t)
	now := time.Now()

	saveStatsTask(t, store, statsTaskSpec{
		title:     "Recent feature",
		taskType:  whiplib.TaskTypeCoding,
		workspace: whiplib.GlobalWorkspaceName,
		status:    whiplib.StatusCreated,
		createdAt: now.Add(-5 * 24 * time.Hour),
	})
	saveStatsTask(t, store, statsTaskSpec{
		title:     "Old docs",
		taskType:  whiplib.TaskTypeDocs,
		workspace: whiplib.GlobalWorkspaceName,
		status:    whiplib.StatusCreated,
		createdAt: now.Add(-45 * 24 * time.Hour),
	})

	stdout, _, err := execWhipCLICapture(t, "stats", "--last", "30d")
	if err != nil {
		t.Fatalf("stats --last: %v", err)
	}
	if !strings.Contains(stdout, "Overview (1 task, last 30d)") {
		t.Fatalf("stats --last missing filtered count:\n%s", stdout)
	}
	if strings.Contains(stdout, whiplib.TaskTypeDocs) {
		t.Fatalf("stats --last should exclude older task:\n%s", stdout)
	}
}

func TestStatsCommand_SinceFilter(t *testing.T) {
	store := newStatsTestStore(t)

	saveStatsTask(t, store, statsTaskSpec{
		title:     "Old item",
		taskType:  whiplib.TaskTypeDocs,
		workspace: whiplib.GlobalWorkspaceName,
		status:    whiplib.StatusCreated,
		createdAt: time.Date(2025, 12, 31, 12, 0, 0, 0, time.UTC),
	})
	saveStatsTask(t, store, statsTaskSpec{
		title:     "New item",
		taskType:  whiplib.TaskTypeCoding,
		workspace: whiplib.GlobalWorkspaceName,
		status:    whiplib.StatusCreated,
		createdAt: time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC),
	})

	stdout, _, err := execWhipCLICapture(t, "stats", "--since", "2026-01-01")
	if err != nil {
		t.Fatalf("stats --since: %v", err)
	}
	if !strings.Contains(stdout, "Overview (1 task, since 2026-01-01)") {
		t.Fatalf("stats --since missing filtered count:\n%s", stdout)
	}
	if strings.Contains(stdout, whiplib.TaskTypeDocs) {
		t.Fatalf("stats --since should exclude older task:\n%s", stdout)
	}
}

func TestRenderBarChartScalesToLongestRow(t *testing.T) {
	rows := []chartRow{
		{Label: "coding", Count: 10, Percent: 67},
		{Label: "docs", Count: 5, Percent: 33},
	}

	lines := strings.Split(renderBarChart(rows, 10), "\n")
	if len(lines) != 2 {
		t.Fatalf("renderBarChart lines = %d, want 2", len(lines))
	}
	if strings.Count(lines[0], "█") != 10 {
		t.Fatalf("first bar blocks = %d, want 10\n%s", strings.Count(lines[0], "█"), lines[0])
	}
	if strings.Count(lines[1], "█") != 5 {
		t.Fatalf("second bar blocks = %d, want 5\n%s", strings.Count(lines[1], "█"), lines[1])
	}
}

type statsTaskSpec struct {
	title       string
	taskType    string
	backend     string
	workspace   string
	difficulty  string
	status      whiplib.TaskStatus
	createdAt   time.Time
	completedAt *time.Time
	archived    bool
}

func newStatsTestStore(t *testing.T) *whiplib.Store {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	store, err := whiplib.NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	return store
}

func saveStatsTask(t *testing.T, store *whiplib.Store, spec statsTaskSpec) *whiplib.Task {
	t.Helper()

	task := whiplib.NewTask(spec.title, "", t.TempDir())
	task.Type = spec.taskType
	task.Backend = spec.backend
	task.Workspace = spec.workspace
	task.Difficulty = spec.difficulty
	task.Status = spec.status
	task.CreatedAt = spec.createdAt
	task.UpdatedAt = spec.createdAt
	task.CompletedAt = spec.completedAt
	if spec.completedAt != nil {
		task.UpdatedAt = *spec.completedAt
	}

	if err := store.SaveTask(task); err != nil {
		t.Fatalf("SaveTask: %v", err)
	}
	if spec.archived {
		if err := store.ArchiveTask(task.ID); err != nil {
			t.Fatalf("ArchiveTask: %v", err)
		}
	}
	return task
}

func ptrStatsTime(value time.Time) *time.Time {
	return &value
}
