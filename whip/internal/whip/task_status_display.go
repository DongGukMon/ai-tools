package whip

import (
	"fmt"

	"github.com/charmbracelet/lipgloss"
)

type taskStatusDisplay struct {
	icon  string
	label string
	style lipgloss.Style
}

func statusDisplay(s TaskStatus) taskStatusDisplay {
	switch s {
	case StatusCreated:
		return taskStatusDisplay{icon: "○", label: "new", style: statusCreated}
	case StatusAssigned:
		return taskStatusDisplay{icon: "◐", label: "queued", style: statusAssigned}
	case StatusInProgress:
		return taskStatusDisplay{icon: "▶", label: "active", style: statusInProgress}
	case StatusReview:
		return taskStatusDisplay{icon: "◎", label: "review", style: statusReview}
	case StatusApproved:
		return taskStatusDisplay{icon: "◉", label: "approved", style: statusApproved}
	case StatusCompleted:
		return taskStatusDisplay{icon: "✓", label: "done", style: statusCompleted}
	case StatusFailed:
		return taskStatusDisplay{icon: "✗", label: "failed", style: statusFailed}
	case StatusCanceled:
		return taskStatusDisplay{icon: "⊘", label: "canceled", style: statusCanceled}
	default:
		return taskStatusDisplay{icon: "?", label: string(s), style: lipgloss.NewStyle().Foreground(colorDim)}
	}
}

func renderStatus(s TaskStatus) string {
	cfg := statusDisplay(s)
	return cfg.style.Render(cfg.icon + " " + cfg.label)
}

func renderStatusCount(s TaskStatus, n int) string {
	cfg := statusDisplay(s)
	return cfg.style.Render(fmt.Sprintf("%s %d %s", cfg.icon, n, cfg.label))
}
