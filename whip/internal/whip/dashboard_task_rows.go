package whip

type dashboardTaskRowKind int

const (
	dashboardTaskRowStandalone dashboardTaskRowKind = iota
	dashboardTaskRowLead
	dashboardTaskRowWorker
)

type dashboardTaskRow struct {
	task            *Task
	kind            dashboardTaskRowKind
	workspace       string
	groupWorkspace  string
	parentWorkspace string
	hasChildren     bool
	isExpanded      bool
	isLastChild     bool
	isLastWorker    bool
}

func (m DashboardModel) taskRows() []dashboardTaskRow {
	return buildDashboardTaskRows(m.tasks, m.expandedWorkspace)
}

func (m DashboardModel) taskRowAtCursor() (dashboardTaskRow, bool) {
	return m.currentListRow()
}

func (m DashboardModel) currentListRow() (dashboardTaskRow, bool) {
	rows := m.taskRows()
	if len(rows) == 0 || m.cursor < 0 || m.cursor >= len(rows) {
		return dashboardTaskRow{}, false
	}
	return rows[m.cursor], true
}

func (m DashboardModel) currentListTask() *Task {
	row, ok := m.currentListRow()
	if !ok {
		return nil
	}
	return row.task
}

func (m *DashboardModel) clampCursorToRows() {
	rows := m.taskRows()
	if len(rows) == 0 {
		m.cursor = 0
		return
	}
	if m.cursor < 0 {
		m.cursor = 0
	}
	if m.cursor >= len(rows) {
		m.cursor = len(rows) - 1
	}
}

func (m *DashboardModel) moveTaskCursor(delta int) {
	m.moveListCursor(delta)
}

func (m *DashboardModel) moveListCursor(delta int) {
	rows := m.taskRows()
	if len(rows) == 0 {
		m.cursor = 0
		return
	}
	if m.cursor < 0 || m.cursor >= len(rows) {
		m.cursor = 0
	}

	next := m.cursor + delta
	if next < 0 {
		next = len(rows) - 1
	} else if next >= len(rows) {
		next = 0
	}

	start, end, ok := findExpandedDashboardTaskRange(rows, m.expandedWorkspace)
	if ok && m.cursor >= start && m.cursor <= end && (next < start || next > end) {
		removedWorkers := end - start
		m.expandedWorkspace = ""
		if next > end {
			next -= removedWorkers
		}
		collapsedRows := m.taskRows()
		if len(collapsedRows) == 0 {
			m.cursor = 0
			return
		}
		if next < 0 {
			next = len(collapsedRows) - 1
		} else if next >= len(collapsedRows) {
			next = 0
		}
	}

	m.cursor = next
}

func (m *DashboardModel) setExpandedWorkspace(workspace string) {
	workspace = normalizeDashboardExpandedWorkspace(dashboardLeadTasksByWorkspace(m.tasks), workspace)
	if workspace == m.expandedWorkspace {
		return
	}
	m.expandedWorkspace = workspace
	m.clampCursorToRows()
}

func (m *DashboardModel) expandCurrentLeadRow() {
	row, ok := m.currentListRow()
	if !ok || row.kind != dashboardTaskRowLead || m.expandedWorkspace == row.workspace {
		return
	}
	m.expandedWorkspace = row.workspace
	rows := m.taskRows()
	if idx := findDashboardTaskRowIndex(rows, row.task.ID); idx >= 0 {
		m.cursor = idx
	}
}

func (m *DashboardModel) collapseCurrentLeadRow() {
	row, ok := m.currentListRow()
	if !ok || row.kind != dashboardTaskRowLead || m.expandedWorkspace != row.workspace {
		return
	}
	m.expandedWorkspace = ""
	rows := m.taskRows()
	if idx := findDashboardTaskRowIndex(rows, row.task.ID); idx >= 0 {
		m.cursor = idx
	}
}

func (m *DashboardModel) collapseSelectedLeadRow() {
	m.collapseCurrentLeadRow()
}

func (m *DashboardModel) moveCurrentWorkerSelectionToLead() {
	row, ok := m.currentListRow()
	if !ok || row.kind != dashboardTaskRowWorker {
		return
	}
	if idx := findDashboardWorkspaceLeadRowIndex(m.taskRows(), row.parentWorkspace); idx >= 0 {
		m.cursor = idx
	}
}

func (m *DashboardModel) focusLeadForSelectedWorker() bool {
	row, ok := m.currentListRow()
	if !ok || row.kind != dashboardTaskRowWorker {
		return false
	}
	m.moveCurrentWorkerSelectionToLead()
	return true
}

func buildDashboardTaskRows(tasks []*Task, expandedWorkspace string) []dashboardTaskRow {
	leadByWorkspace := dashboardLeadTasksByWorkspace(tasks)
	workerByWorkspace := dashboardWorkerTasksByWorkspace(tasks, leadByWorkspace)
	expandedWorkspace = normalizeDashboardExpandedWorkspace(leadByWorkspace, expandedWorkspace)

	rows := make([]dashboardTaskRow, 0, len(tasks))
	for _, task := range tasks {
		workspace := task.WorkspaceName()
		lead := leadByWorkspace[workspace]
		switch {
		case workspace == GlobalWorkspaceName:
			rows = append(rows, dashboardTaskRow{
				task:           task,
				kind:           dashboardTaskRowStandalone,
				workspace:      workspace,
				groupWorkspace: workspace,
			})
		case lead == nil:
			rows = append(rows, dashboardTaskRow{
				task:           task,
				kind:           dashboardTaskRowStandalone,
				workspace:      workspace,
				groupWorkspace: workspace,
			})
		case task.ID == lead.ID:
			workers := workerByWorkspace[workspace]
			rows = append(rows, dashboardTaskRow{
				task:           task,
				kind:           dashboardTaskRowLead,
				workspace:      workspace,
				groupWorkspace: workspace,
				hasChildren:    len(workers) > 0,
				isExpanded:     workspace == expandedWorkspace,
			})
			if workspace == expandedWorkspace {
				for i, worker := range workers {
					rows = append(rows, dashboardTaskRow{
						task:            worker,
						kind:            dashboardTaskRowWorker,
						workspace:       workspace,
						groupWorkspace:  workspace,
						parentWorkspace: workspace,
						isLastChild:     i == len(workers)-1,
						isLastWorker:    i == len(workers)-1,
					})
				}
			}
		case task.IsLead():
			rows = append(rows, dashboardTaskRow{
				task:           task,
				kind:           dashboardTaskRowStandalone,
				workspace:      workspace,
				groupWorkspace: workspace,
			})
		default:
			// Worker rows are rendered directly beneath their workspace lead.
		}
	}

	return rows
}

func dashboardLeadTasksByWorkspace(tasks []*Task) map[string]*Task {
	leadByWorkspace := make(map[string]*Task)
	for _, task := range tasks {
		workspace := task.WorkspaceName()
		if workspace == GlobalWorkspaceName || !task.IsLead() {
			continue
		}
		if _, exists := leadByWorkspace[workspace]; !exists {
			leadByWorkspace[workspace] = task
		}
	}
	return leadByWorkspace
}

func dashboardWorkerTasksByWorkspace(tasks []*Task, leadByWorkspace map[string]*Task) map[string][]*Task {
	workerByWorkspace := make(map[string][]*Task)
	for _, task := range tasks {
		workspace := task.WorkspaceName()
		lead := leadByWorkspace[workspace]
		if workspace == GlobalWorkspaceName || lead == nil {
			continue
		}
		if task.ID == lead.ID || task.IsLead() {
			continue
		}
		workerByWorkspace[workspace] = append(workerByWorkspace[workspace], task)
	}
	return workerByWorkspace
}

func normalizeDashboardExpandedWorkspace(leadByWorkspace map[string]*Task, expandedWorkspace string) string {
	expandedWorkspace = NormalizeWorkspaceName(expandedWorkspace)
	if expandedWorkspace == "" || expandedWorkspace == GlobalWorkspaceName {
		return ""
	}
	if leadByWorkspace[expandedWorkspace] == nil {
		return ""
	}
	return expandedWorkspace
}

func findDashboardTaskRowIndex(rows []dashboardTaskRow, taskID string) int {
	for i, row := range rows {
		if row.task != nil && row.task.ID == taskID {
			return i
		}
	}
	return -1
}

func findDashboardWorkspaceLeadRowIndex(rows []dashboardTaskRow, workspace string) int {
	workspace = NormalizeWorkspaceName(workspace)
	for i, row := range rows {
		if row.kind == dashboardTaskRowLead && row.workspace == workspace {
			return i
		}
	}
	return -1
}

func findExpandedDashboardTaskRange(rows []dashboardTaskRow, workspace string) (int, int, bool) {
	workspace = NormalizeWorkspaceName(workspace)
	if workspace == "" || workspace == GlobalWorkspaceName {
		return 0, 0, false
	}
	start := findDashboardWorkspaceLeadRowIndex(rows, workspace)
	if start < 0 {
		return 0, 0, false
	}
	end := start
	for end+1 < len(rows) && rows[end+1].kind == dashboardTaskRowWorker && rows[end+1].parentWorkspace == workspace {
		end++
	}
	return start, end, true
}
