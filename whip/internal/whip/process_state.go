package whip

type ProcessState string

const (
	ProcessStateNone   ProcessState = ""
	ProcessStateAlive  ProcessState = "alive"
	ProcessStateExited ProcessState = "exited"
	ProcessStateDead   ProcessState = "dead"
)

// TaskProcessState classifies the shell PID state in task context.
// A terminal task with a dead PID is treated as "exited", not "dead".
func TaskProcessState(t *Task) ProcessState {
	if t == nil || t.ShellPID <= 0 {
		return ProcessStateNone
	}
	if IsProcessAlive(t.ShellPID) {
		return ProcessStateAlive
	}
	if t.Status.IsTerminal() {
		return ProcessStateExited
	}
	return ProcessStateDead
}
