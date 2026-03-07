package whip

import (
	"fmt"
	"strings"
)

func GeneratePrompt(task *Task) string {
	var b strings.Builder

	b.WriteString(`You are an agent working under a lead session. You own this task but coordinate with the lead on key decisions.

## Your Task
`)
	fmt.Fprintf(&b, "- ID: %s\n", task.ID)
	fmt.Fprintf(&b, "- Title: %s\n", task.Title)
	b.WriteString("- Description:\n")
	b.WriteString(task.Description)
	b.WriteString("\n")

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
Before writing any code, share your approach with the lead:
`)
	fmt.Fprintf(&b, "   claude-irc msg %s \"Plan for %s: <your approach in 2-3 sentences>\"\n",
		task.MasterIRCName, task.ID)
	b.WriteString(`Then proceed — no need to wait for approval unless the task is ambiguous.

## How You Work
`)
	fmt.Fprintf(&b, "- Work in: %s\n", task.CWD)
	fmt.Fprintf(&b, "- Update your progress: whip status %s in_progress --note \"your progress here\"\n", task.ID)
	fmt.Fprintf(&b, "- Coordinate with the lead session (%s) via claude-irc\n", task.MasterIRCName)
	b.WriteString(`
## When to ask the lead
- Ambiguous requirements or multiple valid approaches — ask which direction
- Changes that affect files other agents might be working on
- Anything not covered in the task description
- Use claude-irc msg to ask. If you need user input directly, use webform.

## Reporting
- Share meaningful progress updates, not just status changes.
  Good: "Auth module done. JWT + refresh token implemented. Moving to middleware."
  Bad: "Working on it."
`)
	fmt.Fprintf(&b, "- Update progress notes: whip status %s in_progress --note \"your progress here\"\n", task.ID)
	b.WriteString(`- If blocked, say what you need specifically so it can be unblocked fast.
- When you receive a message from the lead session, acknowledge and respond promptly.

## Completing Your Task
When you've finished and verified your work:

`)
	fmt.Fprintf(&b, "1. claude-irc msg %s \"Task %s complete. Here's what I delivered: <concrete summary>\"\n",
		task.MasterIRCName, task.ID)
	b.WriteString("2. claude-irc quit\n")
	fmt.Fprintf(&b, "3. whip status %s completed --note \"final summary of what was delivered\"\n", task.ID)
	b.WriteString("   (this will auto-terminate the session)\n")

	return b.String()
}
