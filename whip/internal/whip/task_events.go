package whip

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

func (t *Task) AddNote(content string) {
	t.Note = content
	t.Notes = append(t.Notes, Note{
		Timestamp: time.Now(),
		Status:    string(t.Status),
		Content:   content,
	})
}

func (t *Task) RecordEvent(actor, command, action string, fromStatus, toStatus TaskStatus, detail string) {
	t.Events = append(t.Events, TaskEvent{
		Timestamp:  time.Now(),
		Actor:      actor,
		Command:    command,
		Action:     action,
		FromStatus: string(fromStatus),
		ToStatus:   string(toStatus),
		Detail:     detail,
	})
}

func (t *Task) Retry() error {
	if err := t.ValidateTransition(StatusCreated); err != nil {
		return err
	}
	t.Status = StatusCreated
	t.Runner = ""
	t.IRCName = ""
	t.MasterIRCName = ""
	t.ShellPID = 0
	t.HeartbeatAt = nil
	t.AssignedAt = nil
	t.CompletedAt = nil
	t.Note = ""
	t.UpdatedAt = time.Now()
	return nil
}

func generateID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}
