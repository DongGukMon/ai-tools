package whip

import (
	"fmt"
	"strings"
	"time"
)

type promptBackendSettings struct {
	messageCheckStep promptMessageCheckStep
	reviewAppendix   string
	monitorCleanup   string
}

type promptMessageCheckStep struct {
	title string
	lines []string
}

func writePromptTaskContext(b *strings.Builder, task *Task, workspace string) {
	fmt.Fprintf(b, "- ID: %s\n", task.ID)
	fmt.Fprintf(b, "- Title: %s\n", task.Title)
	if workspace != "" {
		fmt.Fprintf(b, "- Workspace: %s\n", workspace)
	}
	b.WriteString("- Description:\n")
	b.WriteString("<task-context>\n")
	b.WriteString(task.Description)
	b.WriteString("\n</task-context>\n")
}

func writePromptNotes(b *strings.Builder, notes []Note, intro string) {
	if len(notes) == 0 {
		return
	}

	b.WriteString("\n## Previous Attempt Notes\n")
	b.WriteString(intro)
	b.WriteString("\n\n")
	for _, note := range notes {
		fmt.Fprintf(b, "- [%s] (%s) %s\n", note.Timestamp.Format(time.RFC3339), note.Status, note.Content)
	}
}

func writePromptMessageCheckStep(b *strings.Builder, stepNumber int, step promptMessageCheckStep) {
	fmt.Fprintf(b, "%d. %s\n", stepNumber, step.title)
	for _, line := range step.lines {
		fmt.Fprintf(b, "   %s\n", line)
	}
}

func writeWhipHomeContextBullets(b *strings.Builder) {
	b.WriteString("- Home context (READ-ONLY): WHIP_HOME/home/ (default: ~/.whip/home/)\n")
	b.WriteString("  - memory.md: User preferences and operational guidelines\n")
	b.WriteString("  - projects.md: Project registry with paths and tech stacks\n")
}

func leadPromptIRCNames(task *Task) (workspace string, leadIRC string, masterIRC string) {
	workspace = task.WorkspaceName()

	leadIRC = strings.TrimSpace(task.IRCName)
	if leadIRC == "" {
		leadIRC = WorkspaceLeadIRCName(workspace)
	}

	masterIRC = strings.TrimSpace(task.MasterIRCName)
	if masterIRC == "" {
		masterIRC = WorkspaceMasterIRCName(workspace)
	}

	return workspace, leadIRC, masterIRC
}
