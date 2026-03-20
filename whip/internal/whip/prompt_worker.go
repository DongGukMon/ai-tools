package whip

import (
	"fmt"
	"strings"
)

func renderWorkerPrompt(task *Task, backend promptBackendSettings) string {
	var b strings.Builder

	b.WriteString(`You are an agent working under a lead session. You own this task but coordinate with the lead on key decisions.

## Your Task
`)
	writePromptTaskContext(&b, task, "")
	writePromptNotes(&b, task.Notes, "This task was previously attempted. Review these notes from prior agent(s) before starting:")

	b.WriteString(`
## Getting Started
Run these commands to initialize your session:

1. Start the task session (this records your shell PID and moves the task to in_progress):
`)
	fmt.Fprintf(&b, "   whip task start %s\n", task.ID)

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
4. Confirm your task type (auto-inferred at creation — correct if it doesn't match):
`)
	fmt.Fprintf(&b, "   whip task view %s   # check the type field\n", task.ID)
	fmt.Fprintf(&b, "   # If wrong: whip task type %s <correct-type>\n", task.ID)
	b.WriteString("   # Valid: coding, debugging, design, frontend, docs, testing, devops, refactor, review, simulation, general\n")

	b.WriteString("\n")
	writePromptMessageCheckStep(&b, 5, backend.messageCheckStep)

	b.WriteString(`
## Checkpoint: Share your plan
Before diving in, share your approach with the lead:
`)
	fmt.Fprintf(&b, "   claude-irc msg %s \"Plan for %s: <your approach in 2-3 sentences>\"\n",
		task.MasterIRCName, task.ID)
	b.WriteString(`Then proceed — no need to wait for approval unless the task is ambiguous.

## Task Lifecycle
- Normal flow: assign -> start -> complete
- Review flow: assign -> start -> review -> request-changes -> review -> approve -> complete
- If the attempt cannot finish cleanly, use fail with a detailed handoff note.
- For the full state machine, run: whip task lifecycle
- For command-specific transition details, run: whip task <action> --help

## How You Work
`)
	fmt.Fprintf(&b, "- Work in: %s\n", task.CWD)
	fmt.Fprintf(&b, "- Coordinate with the lead session (%s) via claude-irc\n", task.MasterIRCName)
	b.WriteString("  when you need alignment on cross-cutting decisions.\n")
	writeWhipHomeContextBullets(&b)
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
	fmt.Fprintf(&b, "- Update progress notes without changing status: whip task note %s \"your progress here\"\n", task.ID)
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
	step := 3
	if backend.monitorCleanup != "" {
		fmt.Fprintf(&b, "%d. %s\n", step, backend.monitorCleanup)
		step++
	}
	fmt.Fprintf(&b, "%d. claude-irc quit\n", step)
	step++
	fmt.Fprintf(&b, "%d. whip task fail %s --note \"<detailed handoff note>\"\n", step, task.ID)
	b.WriteString(`   (this will auto-terminate the session)

The handoff note is critical — it will be preserved and shown to the next agent assigned to this task.

## Completing Your Task
Before marking complete or submitting for review, you MUST run self-verification:

1. **Run tests**: Execute the project's test suite (e.g. ` + "`go test ./...`" + `, ` + "`npm test`" + `, etc.) in the relevant module directories. ALL existing tests must pass — not just the ones you wrote.
2. **Run build**: Verify the project compiles/builds without errors.
3. **Self-review**: Re-read every file you changed. Check that your changes are correct in the context of the full codebase, not just in isolation. Verify that no related tests need updating for your changes.

If tests or build fail, fix the issues before proceeding. Do NOT mark complete or submit for review with failing tests.

`)
	if task.Review {
		b.WriteString("**IMPORTANT: This task requires review before completion.**\n")
		b.WriteString("- Do NOT commit your changes.\n")
		b.WriteString("- When your work is ready, report for review instead of marking completed.\n")
		b.WriteString("- Your review handoff must be good enough for the lead to finish or hand off the task without reopening your whole session.\n\n")
		b.WriteString("Your review summary and note must include:\n")
		b.WriteString("- changed files\n")
		b.WriteString("- verification you ran (or what you could not run)\n")
		b.WriteString("- suggested commit message\n")
		b.WriteString("- remaining risks or follow-ups\n")
		b.WriteString("- exact next step for the lead if they need to take over\n\n")
		fmt.Fprintf(&b, "1. claude-irc msg %s \"Task %s ready for review. Delivered: <summary>. Files: <files>. Verification: <checks>. Suggested commit: <message>. Risks/follow-ups: <items>. Takeover note: <what the lead should do next>.\"\n",
			task.MasterIRCName, task.ID)
		fmt.Fprintf(&b, "2. whip task review %s --note \"Delivered: <summary>. Files: <files>. Verification: <checks>. Suggested commit: <message>. Risks/follow-ups: <items>. Takeover note: <what the lead should do next>.\"\n", task.ID)
		b.WriteString("3. Keep checking claude-irc inbox while you wait for review feedback.\n")
		b.WriteString("4. If the lead requests changes, they will run `whip task request-changes <id> --note \"...\"`, which moves the task back to `in_progress`.\n")
		b.WriteString("   After that:\n")
		b.WriteString("   - stay in the same session and continue working; do NOT run `whip task start` again\n")
		fmt.Fprintf(&b, "   - record a rework progress note: `whip task note %s \"<what you are fixing>\"`\n", task.ID)
		b.WriteString("   - when the fixes are ready, send another full review handoff with the same quality bar and run `whip task review` again\n")
		b.WriteString("5. After receiving approval: commit your changes, then run:\n")
		b.WriteString("   When committing:\n")
		b.WriteString("   - Only stage files you actually modified: `git add <file1> <file2> ...`\n")
		b.WriteString("   - Do NOT use `git add .`, `git add -A`, or `git add --all`\n")
		b.WriteString("   - Use conventional commit format: `type(scope): description`\n")
		b.WriteString("     Examples: `feat(auth): add JWT refresh token`, `fix(api): handle null response`\n")
		b.WriteString("   - Write a concise commit message that describes what changed and why\n")
		if backend.monitorCleanup != "" {
			b.WriteString("   - " + backend.monitorCleanup + "\n")
		}
		b.WriteString("   claude-irc quit\n")
		fmt.Fprintf(&b, "   whip task complete %s --note \"final summary\"\n", task.ID)
		b.WriteString("   (this will auto-terminate the session)\n")
		if backend.reviewAppendix != "" {
			b.WriteString("\n")
			b.WriteString(strings.TrimLeft(backend.reviewAppendix, "\n"))
		}
	} else if task.Difficulty == "easy" {
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
		step := 3
		if backend.monitorCleanup != "" {
			fmt.Fprintf(&b, "%d. %s\n", step, backend.monitorCleanup)
			step++
		}
		fmt.Fprintf(&b, "%d. claude-irc quit\n", step)
		step++
		fmt.Fprintf(&b, "%d. whip task complete %s --note \"final summary of what was delivered\"\n", step, task.ID)
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
		step := 3
		if backend.monitorCleanup != "" {
			fmt.Fprintf(&b, "%d. %s\n", step, backend.monitorCleanup)
			step++
		}
		fmt.Fprintf(&b, "%d. claude-irc quit\n", step)
		step++
		fmt.Fprintf(&b, "%d. whip task complete %s --note \"final summary of what was delivered\"\n", step, task.ID)
		b.WriteString("   (this will auto-terminate the session)\n")
	}

	return b.String()
}
