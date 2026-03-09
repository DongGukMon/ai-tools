package whip

import "fmt"

type TaskStatus string

const (
	StatusCreated                 TaskStatus = "created"
	StatusAssigned                TaskStatus = "assigned"
	StatusInProgress              TaskStatus = "in_progress"
	StatusReview                  TaskStatus = "review"
	StatusApprovedPendingFinalize TaskStatus = "approved_pending_finalize"
	StatusCompleted               TaskStatus = "completed"
	StatusFailed                  TaskStatus = "failed"
)

func (s TaskStatus) IsValid() bool {
	switch s {
	case StatusCreated, StatusAssigned, StatusInProgress, StatusReview, StatusApprovedPendingFinalize, StatusCompleted, StatusFailed:
		return true
	}
	return false
}

func (s TaskStatus) IsTerminal() bool {
	return s == StatusCompleted || s == StatusFailed
}

func (s TaskStatus) IsActive() bool {
	return s == StatusAssigned || s == StatusInProgress || s == StatusApprovedPendingFinalize
}

// ValidateTransition checks if a status transition is allowed.
func (t *Task) ValidateTransition(newStatus TaskStatus) error {
	if !newStatus.IsValid() {
		return fmt.Errorf("invalid status: %s", newStatus)
	}

	allowed := map[TaskStatus][]TaskStatus{
		StatusCreated:                 {StatusAssigned},
		StatusAssigned:                {StatusInProgress, StatusCreated},
		StatusInProgress:              {StatusCompleted, StatusReview, StatusFailed},
		StatusReview:                  {StatusApprovedPendingFinalize, StatusFailed},
		StatusApprovedPendingFinalize: {StatusCompleted, StatusFailed},
		StatusFailed:                  {StatusCreated},
	}

	targets, ok := allowed[t.Status]
	if !ok {
		return fmt.Errorf("cannot transition from terminal status %s", t.Status)
	}

	for _, s := range targets {
		if s == newStatus {
			return nil
		}
	}
	return fmt.Errorf("cannot transition from %s to %s", t.Status, newStatus)
}
