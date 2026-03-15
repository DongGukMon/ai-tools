package whip

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestBuildDashboardTaskRowsGroupsWorkspaceWorkersUnderLead(t *testing.T) {
	global := NewTask("Global", "desc", "/tmp")
	workerBeforeLead := NewTask("Worker Before", "desc", "/tmp")
	workerBeforeLead.Workspace = "lane"
	lead := NewTask("Lead", "desc", "/tmp")
	lead.Workspace = "lane"
	lead.Role = TaskRoleLead
	workerAfterLead := NewTask("Worker After", "desc", "/tmp")
	workerAfterLead.Workspace = "lane"
	noLead := NewTask("Ungrouped", "desc", "/tmp")
	noLead.Workspace = "solo"

	collapsed := buildDashboardTaskRows([]*Task{
		global,
		workerBeforeLead,
		lead,
		workerAfterLead,
		noLead,
	}, "")
	if got, want := taskRowIDs(collapsed), []string{global.ID, lead.ID, noLead.ID}; !equalStrings(got, want) {
		t.Fatalf("collapsed rows = %v, want %v", got, want)
	}
	if collapsed[1].kind != dashboardTaskRowLead {
		t.Fatalf("collapsed lead row kind = %v, want lead", collapsed[1].kind)
	}

	expanded := buildDashboardTaskRows([]*Task{
		global,
		workerBeforeLead,
		lead,
		workerAfterLead,
		noLead,
	}, "lane")
	if got, want := taskRowIDs(expanded), []string{global.ID, lead.ID, workerBeforeLead.ID, workerAfterLead.ID, noLead.ID}; !equalStrings(got, want) {
		t.Fatalf("expanded rows = %v, want %v", got, want)
	}
	if expanded[1].kind != dashboardTaskRowLead || !expanded[1].isExpanded {
		t.Fatalf("expanded lead row = %+v, want expanded lead", expanded[1])
	}
	if expanded[2].kind != dashboardTaskRowWorker || expanded[2].isLastChild {
		t.Fatalf("first worker row = %+v, want non-last worker", expanded[2])
	}
	if expanded[3].kind != dashboardTaskRowWorker || !expanded[3].isLastChild {
		t.Fatalf("last worker row = %+v, want last worker", expanded[3])
	}
}

func TestDashboardRenderTableShowsTreeGlyphs(t *testing.T) {
	lead := NewTask("Lead", "desc", "/tmp")
	lead.Workspace = "lane"
	lead.Role = TaskRoleLead
	workerA := NewTask("Worker A", "desc", "/tmp")
	workerA.Workspace = "lane"
	workerB := NewTask("Worker B", "desc", "/tmp")
	workerB.Workspace = "lane"

	m := NewDashboardModel(tempStore(t), "test")
	m.tasks = []*Task{lead, workerA, workerB}
	m.expandedWorkspace = "lane"

	table := m.renderTable()
	for _, want := range []string{"▼", "├", "└", "Lead", "Worker A", "Worker B"} {
		if !strings.Contains(table, want) {
			t.Fatalf("renderTable missing %q:\n%s", want, table)
		}
	}
}

func TestDashboardRenderTableCollapsesMultilineCells(t *testing.T) {
	task := NewTask("Line1\nLine2", "desc", "/tmp")
	task.Note = "first\r\nsecond"

	m := NewDashboardModel(tempStore(t), "test")
	m.tasks = []*Task{task}

	table := m.renderTable()
	if strings.Count(table, "\n") != 2 {
		t.Fatalf("renderTable should keep a single task row, got %d newlines:\n%s", strings.Count(table, "\n"), table)
	}
	for _, want := range []string{"Line1 Line2", "first second"} {
		if !strings.Contains(table, want) {
			t.Fatalf("renderTable missing collapsed cell content %q:\n%s", want, table)
		}
	}
}

func TestDashboardListExpandAndCollapseInteractions(t *testing.T) {
	lead := NewTask("Lead", "desc", "/tmp")
	lead.Workspace = "lane"
	lead.Role = TaskRoleLead
	workerA := NewTask("Worker A", "desc", "/tmp")
	workerA.Workspace = "lane"
	workerB := NewTask("Worker B", "desc", "/tmp")
	workerB.Workspace = "lane"

	m := NewDashboardModel(tempStore(t), "test")
	m.view = viewList
	m.tasks = []*Task{lead, workerA, workerB}

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRight})
	dm := model.(DashboardModel)
	if dm.expandedWorkspace != "lane" {
		t.Fatalf("expandedWorkspace = %q, want lane", dm.expandedWorkspace)
	}
	if rows := dm.taskRows(); len(rows) != 3 {
		t.Fatalf("expanded row count = %d, want 3", len(rows))
	}

	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyDown})
	dm = model.(DashboardModel)
	row, ok := dm.taskRowAtCursor()
	if !ok || row.task.ID != workerA.ID {
		t.Fatalf("selected row after down = %+v, want worker A", row)
	}

	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyLeft})
	dm = model.(DashboardModel)
	row, ok = dm.taskRowAtCursor()
	if !ok || row.task.ID != lead.ID {
		t.Fatalf("selected row after left on worker = %+v, want lead", row)
	}
	if dm.expandedWorkspace != "lane" {
		t.Fatalf("left on worker should keep subtree expanded, got %q", dm.expandedWorkspace)
	}

	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyLeft})
	dm = model.(DashboardModel)
	if dm.expandedWorkspace != "" {
		t.Fatalf("left on expanded lead should collapse subtree, got %q", dm.expandedWorkspace)
	}
	if rows := dm.taskRows(); len(rows) != 1 {
		t.Fatalf("collapsed row count = %d, want 1", len(rows))
	}
}

func TestDashboardListKeepsExpandedWorkspaceWhenLeavingSubtree(t *testing.T) {
	before := NewTask("Before", "desc", "/tmp")
	lead := NewTask("Lead", "desc", "/tmp")
	lead.Workspace = "lane"
	lead.Role = TaskRoleLead
	workerA := NewTask("Worker A", "desc", "/tmp")
	workerA.Workspace = "lane"
	workerB := NewTask("Worker B", "desc", "/tmp")
	workerB.Workspace = "lane"
	after := NewTask("After", "desc", "/tmp")

	m := NewDashboardModel(tempStore(t), "test")
	m.view = viewList
	m.tasks = []*Task{before, lead, workerA, workerB, after}
	m.cursor = 1

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRight})
	dm := model.(DashboardModel)
	for _, key := range []tea.KeyMsg{
		{Type: tea.KeyDown},
		{Type: tea.KeyDown},
		{Type: tea.KeyDown},
	} {
		model, _ = dm.Update(key)
		dm = model.(DashboardModel)
	}

	if dm.expandedWorkspace != "lane" {
		t.Fatalf("expandedWorkspace = %q, want lane to stay expanded", dm.expandedWorkspace)
	}
	row, ok := dm.taskRowAtCursor()
	if !ok || row.task.ID != after.ID {
		t.Fatalf("selected row after leaving subtree = %+v, want after task", row)
	}
}

func TestDashboardListOnlyOneExpandedWorkspace(t *testing.T) {
	leadA := NewTask("Lead A", "desc", "/tmp")
	leadA.Workspace = "lane-a"
	leadA.Role = TaskRoleLead
	workerA := NewTask("Worker A", "desc", "/tmp")
	workerA.Workspace = "lane-a"
	leadB := NewTask("Lead B", "desc", "/tmp")
	leadB.Workspace = "lane-b"
	leadB.Role = TaskRoleLead
	workerB := NewTask("Worker B", "desc", "/tmp")
	workerB.Workspace = "lane-b"

	m := NewDashboardModel(tempStore(t), "test")
	m.view = viewList
	m.tasks = []*Task{leadA, workerA, leadB, workerB}

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRight})
	dm := model.(DashboardModel)
	for _, key := range []tea.KeyMsg{
		{Type: tea.KeyDown},
		{Type: tea.KeyDown},
		{Type: tea.KeyRight},
	} {
		model, _ = dm.Update(key)
		dm = model.(DashboardModel)
	}

	if dm.expandedWorkspace != "lane-b" {
		t.Fatalf("expandedWorkspace = %q, want lane-b", dm.expandedWorkspace)
	}
	if got, want := taskRowIDs(dm.taskRows()), []string{leadA.ID, leadB.ID, workerB.ID}; !equalStrings(got, want) {
		t.Fatalf("visible rows = %v, want %v", got, want)
	}
}

func TestDashboardArchivedListSupportsGroupedNavigation(t *testing.T) {
	lead := NewTask("Lead", "desc", "/tmp")
	lead.Workspace = "lane"
	lead.Role = TaskRoleLead
	lead.Status = StatusCompleted
	worker := NewTask("Worker", "desc", "/tmp")
	worker.Workspace = "lane"
	worker.Status = StatusCompleted

	m := NewDashboardModel(tempStore(t), "test")
	m.listMode = listModeArchived
	m.view = viewList
	m.tasks = []*Task{lead, worker}

	model, _ := m.Update(tea.KeyMsg{Type: tea.KeyRight})
	dm := model.(DashboardModel)
	if dm.expandedWorkspace != "lane" {
		t.Fatalf("archived expandedWorkspace = %q, want lane", dm.expandedWorkspace)
	}

	model, _ = dm.Update(tea.KeyMsg{Type: tea.KeyDown})
	dm = model.(DashboardModel)
	row, ok := dm.taskRowAtCursor()
	if !ok || row.task.ID != worker.ID {
		t.Fatalf("archived selected row after down = %+v, want worker", row)
	}
}

func taskRowIDs(rows []dashboardTaskRow) []string {
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.task != nil {
			ids = append(ids, row.task.ID)
		}
	}
	return ids
}

func equalStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
