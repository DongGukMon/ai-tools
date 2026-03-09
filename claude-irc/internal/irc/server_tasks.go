package irc

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"
)

func statusForIdentifierError(err error) int {
	if errors.Is(err, ErrInvalidIdentifier) {
		return http.StatusBadRequest
	}
	return http.StatusInternalServerError
}

type whipNote struct {
	Timestamp time.Time `json:"timestamp"`
	Status    string    `json:"status"`
	Content   string    `json:"content"`
}

type whipTask struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	CWD           string     `json:"cwd"`
	Status        string     `json:"status"`
	Backend       string     `json:"backend,omitempty"`
	Runner        string     `json:"runner,omitempty"`
	IRCName       string     `json:"irc_name"`
	MasterIRCName string     `json:"master_irc_name"`
	SessionID     string     `json:"session_id,omitempty"`
	ShellPID      int        `json:"shell_pid"`
	Note          string     `json:"note"`
	Notes         []whipNote `json:"notes,omitempty"`
	Difficulty    string     `json:"difficulty,omitempty"`
	Review        bool       `json:"review,omitempty"`
	DependsOn     []string   `json:"depends_on"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	AssignedAt    *time.Time `json:"assigned_at"`
	CompletedAt   *time.Time `json:"completed_at"`
	PIDAlive      bool       `json:"pid_alive"`
}

func whipTasksDir() string {
	if override := strings.TrimSpace(os.Getenv("WHIP_HOME")); override != "" {
		return filepath.Join(override, "tasks")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".whip", "tasks")
}

func readAllWhipTasks() ([]whipTask, error) {
	dir := whipTasksDir()
	if dir == "" {
		return nil, fmt.Errorf("cannot determine home directory")
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []whipTask{}, nil
		}
		return nil, err
	}

	var tasks []whipTask
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		taskPath := filepath.Join(dir, entry.Name(), "task.json")
		data, err := os.ReadFile(taskPath)
		if err != nil {
			continue
		}
		var t whipTask
		if err := json.Unmarshal(data, &t); err != nil {
			continue
		}
		t.PIDAlive = isWhipPIDAlive(t.ShellPID)
		tasks = append(tasks, t)
	}

	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].CreatedAt.Before(tasks[j].CreatedAt)
	})

	return tasks, nil
}

func readWhipTask(id string) (*whipTask, error) {
	if err := validateTaskID(id); err != nil {
		return nil, err
	}

	dir := whipTasksDir()
	if dir == "" {
		return nil, fmt.Errorf("cannot determine home directory")
	}

	taskPath := filepath.Join(dir, id, "task.json")
	data, err := os.ReadFile(taskPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("task %s not found", id)
		}
		return nil, err
	}

	var t whipTask
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, err
	}
	t.PIDAlive = isWhipPIDAlive(t.ShellPID)
	return &t, nil
}

func isWhipPIDAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	return syscall.Kill(pid, 0) == nil
}

func handleGetTasks(w http.ResponseWriter) {
	tasks, err := readAllWhipTasks()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if tasks == nil {
		tasks = []whipTask{}
	}
	writeJSON(w, http.StatusOK, tasks)
}

func handleGetTask(w http.ResponseWriter, id string) {
	task, err := readWhipTask(id)
	if err != nil {
		status := http.StatusInternalServerError
		switch {
		case errors.Is(err, ErrInvalidIdentifier):
			status = http.StatusBadRequest
		case os.IsNotExist(err), strings.Contains(err.Error(), "not found"):
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, task)
}
