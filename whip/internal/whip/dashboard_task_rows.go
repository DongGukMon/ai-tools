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

func (row dashboardTaskRow) gutterGlyph() string {
	switch row.kind {
	case dashboardTaskRowLead:
		if row.isExpanded {
			return "▼"
		}
		return "▶"
	case dashboardTaskRowWorker:
		if row.isLastChild {
			return "└"
		}
		return "├"
	default:
		return ""
	}
}

func (m DashboardModel) taskRows() []dashboardTaskRow {
	return buildDashboardTaskRows(m.tasks, m.expandedWorkspaces)
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
		m.listScroll = 0
		return
	}
	if m.cursor < 0 {
		m.cursor = 0
	}
	if m.cursor >= len(rows) {
		m.cursor = len(rows) - 1
	}
	m.clampListScroll()
}

func (m *DashboardModel) moveTaskCursor(delta int) {
	m.moveListCursor(delta)
}

func (m *DashboardModel) moveListCursor(delta int) {
	rows := m.taskRows()
	if len(rows) == 0 {
		m.cursor = 0
		m.listScroll = 0
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

	m.cursor = next
	m.clampListScroll()
}

// clampListScroll adjusts listScroll so the cursor stays within the visible window.
func (m *DashboardModel) clampListScroll() {
	rows := m.taskRows()
	totalRows := len(rows)
	maxVisible := m.maxVisibleTaskRows()

	if totalRows <= maxVisible {
		m.listScroll = 0
		return
	}

	// If cursor is above the visible window, scroll up
	if m.cursor < m.listScroll {
		m.listScroll = m.cursor
	}
	// If cursor is below the visible window, scroll down
	if m.cursor >= m.listScroll+maxVisible {
		m.listScroll = m.cursor - maxVisible + 1
	}

	// Clamp to valid range
	maxScroll := totalRows - maxVisible
	if maxScroll < 0 {
		maxScroll = 0
	}
	if m.listScroll > maxScroll {
		m.listScroll = maxScroll
	}
	if m.listScroll < 0 {
		m.listScroll = 0
	}
}

func (m *DashboardModel) setExpandedWorkspace(workspace string) {
	workspace = normalizeDashboardExpandedWorkspace(dashboardLeadTasksByWorkspace(m.tasks), workspace)
	if workspace == "" {
		return
	}
	if m.expandedWorkspaces[workspace] {
		delete(m.expandedWorkspaces, workspace)
	} else {
		m.expandedWorkspaces[workspace] = true
	}
	m.clampCursorToRows()
}

func (m *DashboardModel) expandCurrentLeadRow() {
	row, ok := m.currentListRow()
	if !ok || row.kind != dashboardTaskRowLead || m.expandedWorkspaces[row.workspace] {
		return
	}
	m.expandedWorkspaces[row.workspace] = true
	rows := m.taskRows()
	if idx := findDashboardTaskRowIndex(rows, row.task.ID); idx >= 0 {
		m.cursor = idx
	}
	m.clampListScroll()
}

func (m *DashboardModel) collapseCurrentLeadRow() {
	row, ok := m.currentListRow()
	if !ok || row.kind != dashboardTaskRowLead || !m.expandedWorkspaces[row.workspace] {
		return
	}
	delete(m.expandedWorkspaces, row.workspace)
	rows := m.taskRows()
	if idx := findDashboardTaskRowIndex(rows, row.task.ID); idx >= 0 {
		m.cursor = idx
	}
	m.clampListScroll()
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
		m.clampListScroll()
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

func buildDashboardTaskRows(tasks []*Task, expandedWorkspaces map[string]bool) []dashboardTaskRow {
	leadByWorkspace := dashboardLeadTasksByWorkspace(tasks)
	workerByWorkspace := dashboardWorkerTasksByWorkspace(tasks, leadByWorkspace)

	rows := make([]dashboardTaskRow, 0, len(tasks))
	for _, task := range tasks {
		workspace := task.WorkspaceName()
		lead := leadByWorkspace[workspace]
		isExpanded := expandedWorkspaces[workspace] && normalizeDashboardExpandedWorkspace(leadByWorkspace, workspace) != ""
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
				isExpanded:     isExpanded,
			})
			if isExpanded {
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
