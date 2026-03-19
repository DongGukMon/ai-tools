package whip

import (
	"math"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

func TestDashboardStatsViewAggregatesAndTogglesArchived(t *testing.T) {
	store := tempStore(t)

	activeCompleted := statsTestTask("Frontend polish", TaskTypeFrontend, "claude", "hard", GlobalWorkspaceName, StatusCompleted, time.Date(2026, time.March, 20, 9, 0, 0, 0, time.Local), 2*time.Hour)
	activeInProgress := statsTestTask("Frontend in progress", TaskTypeFrontend, "codex", "medium", "lane", StatusInProgress, time.Date(2026, time.March, 20, 10, 0, 0, 0, time.Local), 0)
	activeUnset := statsTestTask("Investigate logs", "", "", "medium", "lane", StatusCompleted, time.Date(2026, time.March, 20, 11, 0, 0, 0, time.Local), 3*time.Hour)
	archivedCompleted := statsTestTask("Debug archive", TaskTypeDebugging, "claude", "easy", GlobalWorkspaceName, StatusCompleted, time.Date(2026, time.March, 19, 15, 0, 0, 0, time.Local), 1*time.Hour)

	for _, task := range []*Task{activeCompleted, activeInProgress, activeUnset, archivedCompleted} {
		if err := store.SaveTask(task); err != nil {
			t.Fatalf("SaveTask(%s): %v", task.Title, err)
		}
	}
	if err := store.archiveTask(archivedCompleted.ID); err != nil {
		t.Fatalf("archiveTask: %v", err)
	}

	model := NewDashboardModel(store, "test")
	model.listMode = listModeActive
	model.view = viewList
	model.tasks = []*Task{activeCompleted, activeInProgress, activeUnset}

	updated, cmd := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'s'}})
	if cmd != nil {
		t.Fatal("stats key should not return a command")
	}

	dm := updated.(DashboardModel)
	if dm.view != viewStats {
		t.Fatalf("view = %v, want stats", dm.view)
	}
	if dm.statsIncludeArchived {
		t.Fatal("stats should default to active-only mode")
	}
	if len(dm.statsSections) != 5 {
		t.Fatalf("stats section count = %d, want 5", len(dm.statsSections))
	}

	overview := statsSectionByTitle(t, dm.statsSections, "Overview")
	if got := statsRowByLabel(t, overview, "Completed").Count; got != 2 {
		t.Fatalf("active completed count = %d, want 2", got)
	}
	if got := math.Round(statsRowByLabel(t, overview, "Completed").Percent); got != 67 {
		t.Fatalf("active completion percent = %.0f, want 67", got)
	}
	if got := statsRowByLabel(t, overview, "Avg Duration").Count; got != int((5 * time.Hour / 2).Seconds()) {
		t.Fatalf("active avg duration seconds = %d, want %d", got, int((5 * time.Hour / 2).Seconds()))
	}

	typeRows := statsSectionByTitle(t, dm.statsSections, "Type").Rows
	if got := statsRowLabels(typeRows); strings.Join(got, ",") != strings.Join([]string{TaskTypeFrontend, statsUnsetLabel}, ",") {
		t.Fatalf("active type rows = %v, want [frontend (unset)]", got)
	}

	rendered := dm.renderStatsView(120)
	for _, want := range []string{"Overview (3 tasks)", "[Active only]", "2/3", "2h 30m"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("active stats view missing %q:\n%s", want, rendered)
		}
	}

	updated, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'a'}})
	dm = updated.(DashboardModel)
	if !dm.statsIncludeArchived {
		t.Fatal("archived toggle should be enabled after pressing a")
	}

	overview = statsSectionByTitle(t, dm.statsSections, "Overview")
	if got := statsRowByLabel(t, overview, "Completed").Count; got != 3 {
		t.Fatalf("archived-inclusive completed count = %d, want 3", got)
	}
	if got := math.Round(statsRowByLabel(t, overview, "Completed").Percent); got != 75 {
		t.Fatalf("archived-inclusive completion percent = %.0f, want 75", got)
	}
	if got := statsRowByLabel(t, overview, "Avg Duration").Count; got != int((2 * time.Hour).Seconds()) {
		t.Fatalf("archived-inclusive avg duration seconds = %d, want %d", got, int((2 * time.Hour).Seconds()))
	}

	typeRows = statsSectionByTitle(t, dm.statsSections, "Type").Rows
	if got := statsRowLabels(typeRows); strings.Join(got, ",") != strings.Join([]string{TaskTypeDebugging, TaskTypeFrontend, statsUnsetLabel}, ",") {
		t.Fatalf("archived-inclusive type rows = %v, want [debugging frontend (unset)]", got)
	}

	rendered = dm.renderStatsView(120)
	for _, want := range []string{"Overview (4 tasks)", "[Including archived]", "3/4", "2h"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("archived-inclusive stats view missing %q:\n%s", want, rendered)
		}
	}
}

func TestDashboardStatsViewShowsEmptyState(t *testing.T) {
	store := tempStore(t)

	model := NewDashboardModel(store, "test")
	model.view = viewStats

	rendered := model.renderStatsView(120)
	for _, want := range []string{"No active tasks available.", "[Active only]", "a toggle archived"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("empty stats view missing %q:\n%s", want, rendered)
		}
	}

	model.statsIncludeArchived = true
	rendered = model.renderStatsView(120)
	if !strings.Contains(rendered, "No task data available.") {
		t.Fatalf("archived-empty stats view missing archived message:\n%s", rendered)
	}
}

func TestDashboardStatsViewScrollAndBack(t *testing.T) {
	store := tempStore(t)
	model := NewDashboardModel(store, "test")
	model.listMode = listModeActive
	model.view = viewStats
	model.height = 12

	for idx, taskType := range AllTaskTypes() {
		task := statsTestTask(
			"Task "+taskType,
			taskType,
			"claude",
			"medium",
			GlobalWorkspaceName,
			StatusCompleted,
			time.Date(2026, time.March, 20, 8, idx, 0, 0, time.Local),
			time.Duration(idx+1)*time.Hour,
		)
		model.tasks = append(model.tasks, task)
	}
	model.statsSections = model.computeStatsSections()

	rendered := model.renderStatsView(100)
	if !strings.Contains(rendered, "↑↓") {
		t.Fatalf("stats view should show scroll indicator when content overflows:\n%s", rendered)
	}

	updated, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	dm := updated.(DashboardModel)
	if dm.statsScroll != 1 {
		t.Fatalf("statsScroll = %d, want 1 after j", dm.statsScroll)
	}

	updated, _ = dm.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	dm = updated.(DashboardModel)
	if dm.statsScroll != 0 {
		t.Fatalf("statsScroll = %d, want 0 after k", dm.statsScroll)
	}

	updated, _ = dm.Update(tea.KeyMsg{Type: tea.KeyEsc})
	dm = updated.(DashboardModel)
	if dm.view != viewList {
		t.Fatalf("view = %v, want list after esc", dm.view)
	}
}

func statsTestTask(title, taskType, backend, difficulty, workspace string, status TaskStatus, createdAt time.Time, duration time.Duration) *Task {
	task := NewTask(title, "desc", "/tmp")
	task.Type = taskType
	task.Backend = backend
	task.Difficulty = difficulty
	task.Workspace = workspace
	task.Status = status
	task.CreatedAt = createdAt
	task.UpdatedAt = createdAt
	if status == StatusCompleted {
		completedAt := createdAt.Add(duration)
		task.CompletedAt = &completedAt
		task.UpdatedAt = completedAt
	}
	return task
}

func statsSectionByTitle(t *testing.T, sections []statsSection, title string) statsSection {
	t.Helper()
	for _, section := range sections {
		if section.Title == title {
			return section
		}
	}
	t.Fatalf("stats section %q not found", title)
	return statsSection{}
}

func statsRowByLabel(t *testing.T, section statsSection, label string) statsRow {
	t.Helper()
	for _, row := range section.Rows {
		if row.Label == label {
			return row
		}
	}
	t.Fatalf("stats row %q not found in section %q", label, section.Title)
	return statsRow{}
}

func statsRowLabels(rows []statsRow) []string {
	labels := make([]string, 0, len(rows))
	for _, row := range rows {
		labels = append(labels, row.Label)
	}
	return labels
}
