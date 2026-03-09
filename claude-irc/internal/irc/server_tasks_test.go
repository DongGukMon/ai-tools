package irc

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAPITasks(t *testing.T) {
	origHome := os.Getenv("HOME")
	tmpHome := t.TempDir()
	os.Setenv("HOME", tmpHome)
	t.Cleanup(func() { os.Setenv("HOME", origHome) })

	tasksDir := filepath.Join(tmpHome, ".whip", "tasks")

	task1 := map[string]interface{}{
		"id":         "abc12",
		"title":      "First task",
		"status":     "in_progress",
		"shell_pid":  0,
		"depends_on": []string{},
		"created_at": time.Now().Add(-1 * time.Hour).Format(time.RFC3339Nano),
		"updated_at": time.Now().Format(time.RFC3339Nano),
	}
	task2 := map[string]interface{}{
		"id":         "def34",
		"title":      "Second task",
		"status":     "completed",
		"shell_pid":  0,
		"depends_on": []string{},
		"created_at": time.Now().Format(time.RFC3339Nano),
		"updated_at": time.Now().Format(time.RFC3339Nano),
	}

	for _, task := range []map[string]interface{}{task1, task2} {
		id := task["id"].(string)
		dir := filepath.Join(tasksDir, id)
		os.MkdirAll(dir, 0755)
		data, _ := json.MarshalIndent(task, "", "  ")
		os.WriteFile(filepath.Join(dir, "task.json"), data, 0644)
	}

	ts, _, token := setupTestServer(t)

	resp := doRequest(t, ts, token, "GET", "/api/tasks", nil)
	var tasks []whipTask
	decodeJSON(t, resp, &tasks)
	if len(tasks) != 2 {
		t.Fatalf("expected 2 tasks, got %d", len(tasks))
	}
	if tasks[0].ID != "abc12" {
		t.Errorf("expected first task 'abc12', got %q", tasks[0].ID)
	}
	if tasks[0].PIDAlive {
		t.Error("expected pid_alive=false for shell_pid 0")
	}

	resp = doRequest(t, ts, token, "GET", "/api/tasks/abc12", nil)
	var task whipTask
	decodeJSON(t, resp, &task)
	if task.Title != "First task" {
		t.Errorf("expected 'First task', got %q", task.Title)
	}

	resp = doRequest(t, ts, token, "GET", "/api/tasks/zzzzz", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestAPITaskPIDAlive(t *testing.T) {
	origHome := os.Getenv("HOME")
	tmpHome := t.TempDir()
	os.Setenv("HOME", tmpHome)
	t.Cleanup(func() { os.Setenv("HOME", origHome) })

	tasksDir := filepath.Join(tmpHome, ".whip", "tasks")
	pid := os.Getpid()
	task := map[string]interface{}{
		"id":         "alive1",
		"title":      "Alive task",
		"status":     "in_progress",
		"shell_pid":  pid,
		"depends_on": []string{},
		"created_at": time.Now().Format(time.RFC3339Nano),
		"updated_at": time.Now().Format(time.RFC3339Nano),
	}

	dir := filepath.Join(tasksDir, "alive1")
	os.MkdirAll(dir, 0755)
	data, _ := json.MarshalIndent(task, "", "  ")
	os.WriteFile(filepath.Join(dir, "task.json"), data, 0644)

	ts, _, token := setupTestServer(t)

	resp := doRequest(t, ts, token, "GET", "/api/tasks/alive1", nil)
	var result whipTask
	decodeJSON(t, resp, &result)
	if !result.PIDAlive {
		t.Error("expected pid_alive=true for our own PID")
	}
}

func TestAPITasksRejectInvalidID(t *testing.T) {
	origHome := os.Getenv("HOME")
	tmpHome := t.TempDir()
	os.Setenv("HOME", tmpHome)
	t.Cleanup(func() { os.Setenv("HOME", origHome) })

	whipDir := filepath.Join(tmpHome, ".whip")
	if err := os.MkdirAll(whipDir, 0755); err != nil {
		t.Fatalf("failed to create whip dir: %v", err)
	}

	escapedTask := map[string]interface{}{
		"id":         "escaped",
		"title":      "Should not be reachable",
		"status":     "in_progress",
		"shell_pid":  0,
		"depends_on": []string{},
		"created_at": time.Now().Format(time.RFC3339Nano),
		"updated_at": time.Now().Format(time.RFC3339Nano),
	}
	data, _ := json.MarshalIndent(escapedTask, "", "  ")
	if err := os.WriteFile(filepath.Join(whipDir, "task.json"), data, 0644); err != nil {
		t.Fatalf("failed to write escaped task: %v", err)
	}

	ts, _, token := setupTestServer(t)

	resp := doRequest(t, ts, token, "GET", "/api/tasks/..", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}

	var body map[string]string
	decodeJSON(t, resp, &body)
	if body["error"] != "invalid identifier: invalid task id" {
		t.Fatalf("unexpected error: %q", body["error"])
	}
}

func TestWhipTasksDir_UsesWHIPHOMEOverride(t *testing.T) {
	override := filepath.Join(t.TempDir(), "custom-whip-home")
	t.Setenv("WHIP_HOME", override)

	got := whipTasksDir()
	want := filepath.Join(override, "tasks")
	if got != want {
		t.Fatalf("whipTasksDir() = %q, want %q", got, want)
	}
}
