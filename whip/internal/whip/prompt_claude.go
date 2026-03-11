package whip

var claudePromptBackendSettings = promptBackendSettings{
	messageCheckStep: promptMessageCheckStep{
		title: "Enable inbox loop while the task is active:",
		lines: []string{
			"/loop 1m claude-irc inbox",
			"Keep this loop running only while the task is active or waiting for review feedback",
			"Before claude-irc quit or any terminal lifecycle action, use CronList if needed and CronDelete to remove the inbox loop you started",
		},
	},
	monitorCleanup: "If you started `/loop 1m claude-irc inbox`, remove that cron now with `CronDelete` (use `CronList` first if you need the task ID).",
}

// generateClaudePrompt produces the Claude Code agent prompt for a task.
func generateClaudePrompt(task *Task) string {
	return renderWorkerPrompt(task, claudePromptBackendSettings)
}

// generateClaudeLeadPrompt produces the Claude Code lead orchestrator prompt.
func generateClaudeLeadPrompt(task *Task) string {
	return renderLeadPrompt(task, claudePromptBackendSettings)
}
