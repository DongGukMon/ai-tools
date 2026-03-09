export interface Peer {
  name: string
  online: boolean
  cwd: string
  registered_at: string
}

export interface Message {
  from: string
  content: string
  timestamp: string
  read: boolean
}

export type TaskStatus = 'created' | 'assigned' | 'in_progress' | 'review' | 'approved_pending_finalize' | 'completed' | 'failed'

export interface Task {
  id: string
  title: string
  description: string
  cwd: string
  workspace: string
  status: TaskStatus
  backend: string
  runner: string
  irc_name: string
  master_irc_name: string
  session_id: string
  shell_pid: number
  pid_alive: boolean
  note: string
  difficulty: string
  review: boolean
  depends_on: string[]
  created_at: string
  updated_at: string
  assigned_at: string | null
  completed_at: string | null
}
