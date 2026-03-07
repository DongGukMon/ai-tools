package whip

import (
	"fmt"
	"strings"
)

func GeneratePrompt(task *Task) string {
	var b strings.Builder

	b.WriteString(`You are the owner of this task. You have full authority and responsibility
to complete it. Make your own decisions, solve problems independently, and
deliver quality results.

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

## How You Work
- You own this task end-to-end. Plan your approach, execute, and verify.
`)
	fmt.Fprintf(&b, "- Work in: %s\n", task.CWD)
	fmt.Fprintf(&b, "- Update your progress: whip status %s in_progress\n", task.ID)
	fmt.Fprintf(&b, "- Coordinate with the lead session (%s) via claude-irc\n", task.MasterIRCName)
	b.WriteString(`  when you need alignment on cross-cutting decisions.
- If you need user input that can't wait, use webform to collect it directly.
- You can read peer topics with claude-irc board <peer> for shared context.

## Reporting
- Share meaningful progress updates, not just status changes.
  Good: "Auth module done. JWT + refresh token implemented. Moving to middleware."
  Bad: "Working on it."
`)
	fmt.Fprintf(&b, "- Update progress notes: whip status %s in_progress --note \"your progress here\"\n", task.ID)
	b.WriteString(`- If blocked, say what you need specifically so it can be unblocked fast.
- When you receive a message from the lead session, acknowledge it before continuing.

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
