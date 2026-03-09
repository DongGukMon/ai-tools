package whip

import (
	"fmt"
	"strings"
	"time"
)

// GeneratePrompt dispatches prompt generation to the task's backend.
// This is the top-level entry point used by assign, retry, and auto-assign.
func GeneratePrompt(task *Task) string {
	backend, err := GetBackend(task.Backend)
	if err != nil {
		// Fallback to claude if backend is unknown (shouldn't happen in practice)
		backend = &ClaudeBackend{}
	}
	return backend.GeneratePrompt(task)
}

// generateClaudePrompt produces the Claude Code agent prompt for a task.
func generateClaudePrompt(task *Task) string {
	var b strings.Builder

	b.WriteString(`You are an agent working under a lead session. You own this task but coordinate with the lead on key decisions.

## Your Task
`)
	fmt.Fprintf(&b, "- ID: %s\n", task.ID)
	fmt.Fprintf(&b, "- Title: %s\n", task.Title)
	b.WriteString("- Description:\n")
	b.WriteString("<task-context>\n")
	b.WriteString(task.Description)
	b.WriteString("\n</task-context>\n")

	if len(task.Notes) > 0 {
		b.WriteString("\n## Previous Attempt Notes\n")
		b.WriteString("This task was previously attempted. Review these notes from prior agent(s) before starting:\n\n")
		for _, n := range task.Notes {
			fmt.Fprintf(&b, "- [%s] (%s) %s\n", n.Timestamp.Format(time.RFC3339), n.Status, n.Content)
		}
	}

	b.WriteString(`
## Getting Started
Run these commands to initialize your session:

1. Register yourself (this records your shell PID from $WHIP_SHELL_PID):
`)
	fmt.Fprintf(&b, "   whip heartbeat %s\n", task.ID)

	b.WriteString(`
2. Join the communication channel:
`)
	fmt.Fprintf(&b, "   claude-irc join %s\n", task.IRCName)

	b.WriteString(`
3. Announce that you're starting:
`)
	fmt.Fprintf(&b, "   claude-irc msg %s \"Acknowledged. Taking ownership of task %s: %s\"\n",
		task.MasterIRCName, task.ID, task.Title)

	b.WriteString(`
4. Enable periodic message check:
   /loop 1m claude-irc inbox

## Checkpoint: Share your plan
Before diving in, share your approach with the lead:
`)
	fmt.Fprintf(&b, "   claude-irc msg %s \"Plan for %s: <your approach in 2-3 sentences>\"\n",
		task.MasterIRCName, task.ID)
	b.WriteString(`Then proceed — no need to wait for approval unless the task is ambiguous.

## How You Work
`)
	fmt.Fprintf(&b, "- Work in: %s\n", task.CWD)
	fmt.Fprintf(&b, "- Coordinate with the lead session (%s) via claude-irc\n", task.MasterIRCName)
	b.WriteString("  when you need alignment on cross-cutting decisions.\n")
	b.WriteString("- Home context (READ-ONLY): ~/.whip/home/\n")
	b.WriteString("  - memory.md: User preferences and operational guidelines\n")
	b.WriteString("  - projects.md: Project registry with paths and tech stacks\n")
	b.WriteString("- If you need user input, escalate to the lead first. If urgent and the lead is unresponsive, use webform to collect it directly.\n")
	b.WriteString(`
## When to ask the lead
- Ambiguous requirements or multiple valid approaches — ask which direction
- Changes that affect files other agents might be working on
- Anything not covered in the task description

## Reporting
- Share meaningful progress updates, not just status changes.
  Good: "Auth module done. JWT + refresh token implemented. Moving to middleware."
  Bad: "Working on it."
`)
	fmt.Fprintf(&b, "- Update progress notes: whip status %s in_progress --note \"your progress here\"\n", task.ID)
	b.WriteString(`- If blocked, say what you need specifically so it can be unblocked fast.
- When you receive a message from the lead session, acknowledge and respond promptly.

## Handling Failure
If you cannot complete the task, do NOT just mark it failed silently. Before giving up:

1. Write a detailed handoff note explaining:
   - What was accomplished so far
   - What went wrong / why it failed
   - What remains to be done and where the next agent should pick up
2. Notify the lead:
`)
	fmt.Fprintf(&b, "   claude-irc msg %s \"Task %s failed: <reason>. Handoff note written.\"\n",
		task.MasterIRCName, task.ID)
	b.WriteString("3. claude-irc quit\n")
	fmt.Fprintf(&b, "4. whip status %s failed --note \"<detailed handoff note>\"\n", task.ID)
	b.WriteString(`   (this will auto-terminate the session)

The handoff note is critical — it will be preserved and shown to the next agent assigned to this task after retry.

## Completing Your Task
Before marking complete, verify your work (run tests, build checks, or whatever the task requires).

`)
	if task.Review {
		// Review flow: agent reports for review, does NOT commit
		b.WriteString("**IMPORTANT: This task requires review before completion.**\n")
		b.WriteString("- Do NOT commit your changes.\n")
		b.WriteString("- When your work is ready, report for review instead of marking completed.\n\n")
		fmt.Fprintf(&b, "1. claude-irc msg %s \"Task %s ready for review. Here's what I delivered: <concrete summary>\"\n",
			task.MasterIRCName, task.ID)
		fmt.Fprintf(&b, "2. whip status %s review --note \"summary of what was delivered\"\n", task.ID)
		b.WriteString("3. Wait for the lead to approve. You will receive an IRC message when approved.\n")
		b.WriteString("4. After receiving approval: commit your changes, then run:\n")
		b.WriteString("   When committing:\n")
		b.WriteString("   - Only stage files you actually modified: `git add <file1> <file2> ...`\n")
		b.WriteString("   - Do NOT use `git add .`, `git add -A`, or `git add --all`\n")
		b.WriteString("   - Use conventional commit format: `type(scope): description`\n")
		b.WriteString("     Examples: `feat(auth): add JWT refresh token`, `fix(api): handle null response`\n")
		b.WriteString("   - Write a concise commit message that describes what changed and why\n")
		b.WriteString("   claude-irc quit\n")
		fmt.Fprintf(&b, "   whip status %s completed --note \"final summary\"\n", task.ID)
		b.WriteString("   (this will auto-terminate the session)\n")
	} else if task.Difficulty == "easy" {
		// Easy tasks: agent MUST commit before completing
		b.WriteString("**IMPORTANT: You must commit your changes before marking complete.**\n\n")
		b.WriteString("When committing:\n")
		b.WriteString("- Only stage files you actually modified: `git add <file1> <file2> ...`\n")
		b.WriteString("- Do NOT use `git add .`, `git add -A`, or `git add --all`\n")
		b.WriteString("- Use conventional commit format: `type(scope): description`\n")
		b.WriteString("  Examples: `feat(auth): add JWT refresh token`, `fix(api): handle null response`\n")
		b.WriteString("- Write a concise commit message that describes what changed and why\n\n")
		b.WriteString("1. Commit your changes as described above.\n")
		fmt.Fprintf(&b, "2. claude-irc msg %s \"Task %s complete. Here's what I delivered: <concrete summary>\"\n",
			task.MasterIRCName, task.ID)
		b.WriteString("3. claude-irc quit\n")
		fmt.Fprintf(&b, "4. whip status %s completed --note \"final summary of what was delivered\"\n", task.ID)
		b.WriteString("   (this will auto-terminate the session)\n")
	} else {
		b.WriteString("**IMPORTANT: Commit your changes before marking complete.**\n\n")
		b.WriteString("When committing:\n")
		b.WriteString("- Only stage files you actually modified: `git add <file1> <file2> ...`\n")
		b.WriteString("- Do NOT use `git add .`, `git add -A`, or `git add --all`\n")
		b.WriteString("- Use conventional commit format: `type(scope): description`\n")
		b.WriteString("  Examples: `feat(auth): add JWT refresh token`, `fix(api): handle null response`\n")
		b.WriteString("- Write a concise commit message that describes what changed and why\n\n")
		b.WriteString("1. Commit your changes as described above.\n")
		fmt.Fprintf(&b, "2. claude-irc msg %s \"Task %s complete. Here's what I delivered: <concrete summary>\"\n",
			task.MasterIRCName, task.ID)
		b.WriteString("3. claude-irc quit\n")
		fmt.Fprintf(&b, "4. whip status %s completed --note \"final summary of what was delivered\"\n", task.ID)
		b.WriteString("   (this will auto-terminate the session)\n")
	}

	return b.String()
}

func generateCodexPrompt(task *Task) string {
	prompt := generateClaudePrompt(task)
	old := `
4. Enable periodic message check:
   /loop 1m claude-irc inbox
`
	new := `
4. Check for new messages manually throughout the task:
   - Run claude-irc inbox now
   - Run claude-irc inbox after each meaningful chunk of work
   - Run claude-irc inbox before status changes or when you think the lead replied
`
	return strings.Replace(prompt, old, new, 1)
}
