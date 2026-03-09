package whip

// GeneratePrompt dispatches prompt generation to the task's backend.
// This is the top-level entry point used by assign, retry, and auto-assign.
func GeneratePrompt(task *Task) string {
	backend, err := GetBackend(task.Backend)
	if err != nil {
		backend = &ClaudeBackend{}
	}
	return backend.GeneratePrompt(task)
}
