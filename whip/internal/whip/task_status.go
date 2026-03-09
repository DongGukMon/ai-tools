package whip

import "fmt"

type TaskStatus string

const (
	StatusCreated    TaskStatus = "created"
	StatusAssigned   TaskStatus = "assigned"
	StatusInProgress TaskStatus = "in_progress"
	StatusReview     TaskStatus = "review"
	StatusApproved   TaskStatus = "approved"
	StatusFailed     TaskStatus = "failed"
	StatusCompleted  TaskStatus = "completed"
	StatusCanceled   TaskStatus = "canceled"
)

func (s TaskStatus) IsValid() bool {
	switch NormalizeTaskStatus(s) {
	case StatusCreated, StatusAssigned, StatusInProgress, StatusReview, StatusApproved, StatusFailed, StatusCompleted, StatusCanceled:
		return true
	}
	return false
}

func (s TaskStatus) IsTerminal() bool {
	s = NormalizeTaskStatus(s)
	return s == StatusCompleted || s == StatusCanceled
}

func (s TaskStatus) IsActive() bool {
	s = NormalizeTaskStatus(s)
	return s == StatusAssigned || s == StatusInProgress || s == StatusReview || s == StatusApproved
}

func NormalizeTaskStatus(s TaskStatus) TaskStatus {
	switch s {
	case "approved_pending_finalize":
		return StatusApproved
	default:
		return s
	}
}

// ValidateTransition checks if a status transition is allowed.
func (t *Task) ValidateTransition(newStatus TaskStatus) error {
	current := NormalizeTaskStatus(t.Status)
	newStatus = NormalizeTaskStatus(newStatus)
	if !newStatus.IsValid() {
		return fmt.Errorf("invalid status: %s", newStatus)
	}

	allowed := map[TaskStatus][]TaskStatus{
		StatusCreated:    {StatusAssigned, StatusCanceled},
		StatusAssigned:   {StatusInProgress, StatusFailed, StatusCanceled},
		StatusInProgress: {StatusReview, StatusCompleted, StatusFailed, StatusCanceled},
		StatusReview:     {StatusApproved, StatusFailed, StatusCanceled},
		StatusApproved:   {StatusCompleted, StatusFailed, StatusCanceled},
		StatusFailed:     {StatusAssigned, StatusCanceled},
	}

	targets, ok := allowed[current]
	if !ok {
		return fmt.Errorf("cannot transition from terminal status %s", current)
	}

	for _, s := range targets {
		if s == newStatus {
			return nil
		}
	}
	return fmt.Errorf("cannot transition from %s to %s", current, newStatus)
}
