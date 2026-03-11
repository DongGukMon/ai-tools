package whip

var codexPromptBackendSettings = promptBackendSettings{
	messageCheckStep: promptMessageCheckStep{
		title: "Check for new messages manually throughout the task:",
		lines: []string{
			"- Run claude-irc inbox now",
			"- Run claude-irc inbox after each meaningful chunk of work",
			"- Run claude-irc inbox before status changes or when you think the lead replied",
		},
	},
	reviewAppendix: `
## Codex Review Handoff
Because this backend may not stay attached through approval/finalization, treat the review report as a real handoff.
- Do not leave the lead guessing what to commit, what to verify, or what remains risky.
- If the lead requests changes, keep the same session, continue from the task's returned in_progress state, and send a fresh review handoff after the rework.
- If approval arrives later, great — finish it yourself.
- If the lead takes over, your review message and review note should already contain everything needed to finalize safely.
`,
}

func generateCodexPrompt(task *Task) string {
	return renderWorkerPrompt(task, codexPromptBackendSettings)
}

func generateCodexLeadPrompt(task *Task) string {
	return renderLeadPrompt(task, codexPromptBackendSettings)
}
