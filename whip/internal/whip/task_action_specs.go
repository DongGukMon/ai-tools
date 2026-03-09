package whip

import (
	"fmt"
	"strings"
)

type TaskLifecycleActionSpec struct {
	Name        string
	Summary     string
	From        []TaskStatus
	To          TaskStatus
	SideEffects []string
}

var taskLifecycleActionSpecs = []TaskLifecycleActionSpec{
	{
		Name:    "assign",
		Summary: "Assign task to a terminal session",
		From:    []TaskStatus{StatusCreated, StatusFailed},
		To:      StatusAssigned,
		SideEffects: []string{
			"spawns a fresh task session",
			"replaces the stored backend session id with the new run on successful spawn",
		},
	},
	{
		Name:    "start",
		Summary: "Mark an assigned session as actively working",
		From:    []TaskStatus{StatusAssigned},
		To:      StatusInProgress,
		SideEffects: []string{
			"records shell PID and heartbeat metadata",
		},
	},
	{
		Name:    "review",
		Summary: "Hand off in-progress work for review",
		From:    []TaskStatus{StatusInProgress},
		To:      StatusReview,
	},
	{
		Name:    "approve",
		Summary: "Approve reviewed work for finalization",
		From:    []TaskStatus{StatusReview},
		To:      StatusApproved,
		SideEffects: []string{
			"notifies the assignee over IRC when possible",
		},
	},
	{
		Name:    "complete",
		Summary: "Mark work as completed",
		From:    []TaskStatus{StatusInProgress, StatusApproved},
		To:      StatusCompleted,
		SideEffects: []string{
			"review-required tasks must reach approved before completion",
			"records the terminal timestamp",
			"auto-assigns unblocked dependents",
			"schedules active task session termination",
		},
	},
	{
		Name:    "fail",
		Summary: "Mark the current attempt as failed",
		From:    []TaskStatus{StatusAssigned, StatusInProgress, StatusReview, StatusApproved},
		To:      StatusFailed,
		SideEffects: []string{
			"stops any running task session",
			"preserves notes and the last backend session id for inspection",
		},
	},
	{
		Name:    "cancel",
		Summary: "Cancel a task permanently",
		From:    []TaskStatus{StatusCreated, StatusAssigned, StatusInProgress, StatusReview, StatusApproved, StatusFailed},
		To:      StatusCanceled,
		SideEffects: []string{
			"records the terminal timestamp",
			"stops any running task session",
			"preserves the last backend session id for inspection",
		},
	},
}

func TaskLifecycleActionSpecs() []TaskLifecycleActionSpec {
	specs := make([]TaskLifecycleActionSpec, len(taskLifecycleActionSpecs))
	copy(specs, taskLifecycleActionSpecs)
	return specs
}

func FindTaskLifecycleActionSpec(name string) (TaskLifecycleActionSpec, bool) {
	for _, spec := range taskLifecycleActionSpecs {
		if spec.Name == name {
			return spec, true
		}
	}
	return TaskLifecycleActionSpec{}, false
}

func FormatTaskStatusSet(statuses []TaskStatus) string {
	parts := make([]string, 0, len(statuses))
	for _, status := range statuses {
		parts = append(parts, string(status))
	}
	return strings.Join(parts, "|")
}

func FormatTaskLifecycleTransition(spec TaskLifecycleActionSpec) string {
	return fmt.Sprintf("%s -> %s", FormatTaskStatusSet(spec.From), spec.To)
}

func FormatTaskLifecycleHelp(spec TaskLifecycleActionSpec) string {
	var b strings.Builder
	b.WriteString(spec.Summary)
	b.WriteString("\n\nTransition:\n")
	b.WriteString("  ")
	b.WriteString(FormatTaskLifecycleTransition(spec))
	if len(spec.SideEffects) > 0 {
		b.WriteString("\n\nSide effects:\n")
		for _, effect := range spec.SideEffects {
			b.WriteString("  - ")
			b.WriteString(effect)
			b.WriteString("\n")
		}
	}
	return strings.TrimRight(b.String(), "\n")
}
