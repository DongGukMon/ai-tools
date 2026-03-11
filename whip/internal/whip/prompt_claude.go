package whip

var claudePromptBackendSettings = promptBackendSettings{
	messageCheckStep: promptMessageCheckStep{
		title: "Enable periodic message check:",
		lines: []string{"/loop 1m claude-irc inbox"},
	},
}

// generateClaudePrompt produces the Claude Code agent prompt for a task.
func generateClaudePrompt(task *Task) string {
	return renderWorkerPrompt(task, claudePromptBackendSettings)
}

// generateClaudeLeadPrompt produces the Claude Code lead orchestrator prompt.
func generateClaudeLeadPrompt(task *Task) string {
	return renderLeadPrompt(task, claudePromptBackendSettings)
}
