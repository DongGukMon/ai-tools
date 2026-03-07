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

type Note struct {
	Timestamp time.Time `json:"timestamp"`
	Status    string    `json:"status"`
	Content   string    `json:"content"`
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
	SessionID     string     `json:"session_id,omitempty"`
	ShellPID      int        `json:"shell_pid"`
	Note          string     `json:"note"`
	Notes         []Note     `json:"notes,omitempty"`
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
		StatusFailed:     {StatusCreated}, // retry: failed → created
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

// AddNote appends a timestamped note to the task's notes history.
func (t *Task) AddNote(content string) {
	t.Notes = append(t.Notes, Note{
		Timestamp: time.Now(),
		Status:    string(t.Status),
		Content:   content,
	})
	t.Note = content // keep legacy field in sync
}

// Retry resets a failed task back to created so it can be re-assigned.
func (t *Task) Retry() error {
	if t.Status != StatusFailed {
		return fmt.Errorf("task %s is %s, only failed tasks can be retried", t.ID, t.Status)
	}
	t.Status = StatusCreated
	t.Runner = ""
	t.IRCName = ""
	t.MasterIRCName = ""
	t.ShellPID = 0
	t.AssignedAt = nil
	t.CompletedAt = nil
	t.UpdatedAt = time.Now()
	return nil
}

func generateID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)[:5]
}
