package whip

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

type TaskStatus string

const (
	StatusCreated    TaskStatus = "created"
	StatusAssigned   TaskStatus = "assigned"
	StatusInProgress TaskStatus = "in_progress"
	StatusCompleted  TaskStatus = "completed"
	StatusFailed     TaskStatus = "failed"
)

func (s TaskStatus) IsValid() bool {
	switch s {
	case StatusCreated, StatusAssigned, StatusInProgress, StatusCompleted, StatusFailed:
		return true
	}
	return false
}

func (s TaskStatus) IsTerminal() bool {
	return s == StatusCompleted || s == StatusFailed
}

func (s TaskStatus) IsActive() bool {
	return s == StatusAssigned || s == StatusInProgress
}

type Task struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	CWD           string     `json:"cwd"`
	Status        TaskStatus `json:"status"`
	Runner        string     `json:"runner,omitempty"`
	IRCName       string     `json:"irc_name"`
	MasterIRCName string     `json:"master_irc_name"`
	ShellPID      int        `json:"shell_pid"`
	Note          string     `json:"note"`
	DependsOn     []string   `json:"depends_on"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	AssignedAt    *time.Time `json:"assigned_at"`
	CompletedAt   *time.Time `json:"completed_at"`
}

func NewTask(title, description, cwd string) *Task {
	now := time.Now()
	return &Task{
		ID:          generateID(),
		Title:       title,
		Description: description,
		CWD:         cwd,
		Status:      StatusCreated,
		DependsOn:   []string{},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
}

// ValidateTransition checks if a status transition is allowed.
func (t *Task) ValidateTransition(newStatus TaskStatus) error {
	if !newStatus.IsValid() {
		return fmt.Errorf("invalid status: %s", newStatus)
	}

	allowed := map[TaskStatus][]TaskStatus{
		StatusCreated:    {StatusAssigned},
		StatusAssigned:   {StatusInProgress, StatusCreated}, // back to created on unassign
		StatusInProgress: {StatusCompleted, StatusFailed, StatusAssigned},
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

func generateID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)[:5]
}
