package whip

import (
	"strings"
	"testing"
	"time"
)

func TestRenderUsageStripShowsClaudeAndCodexSummaries(t *testing.T) {
	store := tempStore(t)
	model := NewDashboardModel(store, "test")

	sessionReset := time.Date(2026, time.March, 17, 13, 0, 0, 0, time.Local)
	weeklyReset := time.Date(2026, time.March, 20, 13, 0, 0, 0, time.Local)
	claudeToday := 92.95
	claudeWeek := 418.20
	codexToday := 52.96
	codexWeek := 203.44

	model.usageState = dashboardUsageState{
		Claude: dashboardUsageProviderSummary{
			Provider:  "Claude",
			Primary:   &dashboardUsageWindow{LeftPercent: 36, ResetAt: &sessionReset},
			Weekly:    &dashboardUsageWindow{LeftPercent: 60, ResetAt: &weeklyReset},
			TodayCost: &claudeToday,
			WeekCost:  &claudeWeek,
		},
		Codex: dashboardUsageProviderSummary{
			Provider:  "Codex",
			Primary:   &dashboardUsageWindow{LeftPercent: 100},
			TodayCost: &codexToday,
			WeekCost:  &codexWeek,
		},
	}

	got := model.renderUsageStrip(200)

	for _, want := range []string{
		"Claude",
		"36%",
		"(1:00 PM)",
		"W 60%",
		"(3/20 1:00 PM)",
		"today $92.95 / week $418.20",
		"Codex",
		"100%",
		"(-)",
		"today $52.96 / week $203.44",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("usage strip missing %q in:\n%s", want, got)
		}
	}
}

func TestRenderListViewPlacesUsageStripAboveFooter(t *testing.T) {
	store := tempStore(t)
	model := NewDashboardModel(store, "test")
	model.view = viewList
	model.width = 140
	model.height = 40

	today := 12.34
	week := 56.78
	model.usageState = dashboardUsageState{
		Codex: dashboardUsageProviderSummary{
			Provider:  "Codex",
			Primary:   &dashboardUsageWindow{LeftPercent: 100},
			TodayCost: &today,
			WeekCost:  &week,
		},
	}

	got := model.renderListView(140)
	usageIdx := strings.Index(got, "today $12.34 / week $56.78")
	footerIdx := strings.Index(got, "navigate")
	if usageIdx == -1 {
		t.Fatalf("list view missing usage strip:\n%s", got)
	}
	if footerIdx == -1 {
		t.Fatalf("list view missing footer:\n%s", got)
	}
	if usageIdx > footerIdx {
		t.Fatalf("usage strip should render above footer:\n%s", got)
	}
}
