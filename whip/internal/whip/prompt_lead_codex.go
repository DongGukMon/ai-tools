package whip

import "strings"

// generateCodexLeadPrompt produces the Codex lead orchestrator prompt.
func generateCodexLeadPrompt(task *Task) string {
	prompt := generateClaudeLeadPrompt(task)
	old := `
4. Enable periodic message check:
   /loop 1m claude-irc inbox
`
	new := `
4. Check for new messages manually throughout the session:
   - Run claude-irc inbox now
   - Run claude-irc inbox after each meaningful chunk of work
   - Run claude-irc inbox before status changes or when you expect a reply
`
	prompt = strings.Replace(prompt, old, new, 1)
	return prompt
}
