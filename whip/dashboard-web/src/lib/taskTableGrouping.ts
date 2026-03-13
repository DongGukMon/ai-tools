import type { Task } from '../api/types'

export type TaskTableRowKind = 'flat' | 'lead' | 'worker'

export interface TaskTableRow {
  task: Task
  kind: TaskTableRowKind
  workspace: string
  childCount: number
  isExpanded: boolean
}

function workspaceName(task: Task) {
  return task.workspace || 'global'
}

export function buildTaskTableRows(tasks: Task[], expandedWorkspace: string | null): TaskTableRow[] {
  const leadByWorkspace = new Map<string, Task>()
  const workersByWorkspace = new Map<string, Task[]>()

  for (const task of tasks) {
    const workspace = workspaceName(task)
    if (workspace === 'global') {
      continue
    }
    if (task.role === 'lead') {
      if (!leadByWorkspace.has(workspace)) {
        leadByWorkspace.set(workspace, task)
      }
      continue
    }
    const workers = workersByWorkspace.get(workspace) ?? []
    workers.push(task)
    workersByWorkspace.set(workspace, workers)
  }

  const rows: TaskTableRow[] = []
  for (const task of tasks) {
    const workspace = workspaceName(task)
    const lead = leadByWorkspace.get(workspace)

    if (workspace === 'global' || !lead) {
      rows.push({ task, kind: 'flat', workspace, childCount: 0, isExpanded: false })
      continue
    }

    if (task === lead) {
      const workers = workersByWorkspace.get(workspace) ?? []
      if (workers.length === 0) {
        rows.push({ task, kind: 'flat', workspace, childCount: 0, isExpanded: false })
        continue
      }

      const isExpanded = workspace === expandedWorkspace
      rows.push({ task, kind: 'lead', workspace, childCount: workers.length, isExpanded })
      if (!isExpanded) {
        continue
      }
      for (const worker of workers) {
        rows.push({ task: worker, kind: 'worker', workspace, childCount: 0, isExpanded: false })
      }
      continue
    }

    if (task.role !== 'lead') {
      continue
    }

    rows.push({ task, kind: 'flat', workspace, childCount: 0, isExpanded: false })
  }

  return rows
}

