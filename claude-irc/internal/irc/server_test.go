package irc

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func setupTestServer(t *testing.T) (*httptest.Server, *Store, string) {
	t.Helper()
	dir := t.TempDir()
	store, err := NewStoreWithBaseDir(dir)
	if err != nil {
		t.Fatalf("NewStoreWithBaseDir: %v", err)
	}

	token := "test-token-abc123"
	handler := buildHandler(store, token)
	ts := httptest.NewServer(handler)
	t.Cleanup(ts.Close)

	return ts, store, token
}

func doRequest(t *testing.T, ts *httptest.Server, token, method, path string, body interface{}) *http.Response {
	t.Helper()
	var reqBody *bytes.Buffer
	if body != nil {
		data, _ := json.Marshal(body)
		reqBody = bytes.NewBuffer(data)
	} else {
		reqBody = bytes.NewBuffer(nil)
	}

	req, err := http.NewRequest(method, ts.URL+path, reqBody)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	return resp
}

func decodeJSON(t *testing.T, resp *http.Response, v interface{}) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
}

// --- Auth tests ---

func TestAPIAuthBearerToken(t *testing.T) {
	ts, _, token := setupTestServer(t)
	resp := doRequest(t, ts, token, "GET", "/api/peers", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPIAuthQueryParam(t *testing.T) {
	ts, _, token := setupTestServer(t)
	resp := doRequest(t, ts, "", "GET", "/api/peers?token="+token, nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPIAuthMissingToken(t *testing.T) {
	ts, _, _ := setupTestServer(t)
	resp := doRequest(t, ts, "", "GET", "/api/peers", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
	var body map[string]string
	decodeJSON(t, resp, &body)
	if body["error"] != "unauthorized" {
		t.Errorf("expected error 'unauthorized', got %q", body["error"])
	}
}

func TestAPIAuthWrongToken(t *testing.T) {
	ts, _, _ := setupTestServer(t)
	resp := doRequest(t, ts, "wrong-token", "GET", "/api/peers", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

// --- CORS tests ---

func TestAPICORSAllowedOrigin(t *testing.T) {
	ts, _, token := setupTestServer(t)

	req, _ := http.NewRequest("GET", ts.URL+"/api/peers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Origin", "https://whip.bang9.dev")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "https://whip.bang9.dev" {
		t.Errorf("expected ACAO 'https://whip.bang9.dev', got %q", got)
	}
}

func TestAPICORSLocalhostAllowed(t *testing.T) {
	ts, _, token := setupTestServer(t)

	req, _ := http.NewRequest("GET", ts.URL+"/api/peers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Origin", "http://localhost:3000")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Errorf("expected ACAO 'http://localhost:3000', got %q", got)
	}
}

func TestAPICORSRejectedOrigin(t *testing.T) {
	ts, _, token := setupTestServer(t)

	req, _ := http.NewRequest("GET", ts.URL+"/api/peers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Origin", "https://evil.example.com")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("expected no ACAO header, got %q", got)
	}
}

func TestAPICORSPreflight(t *testing.T) {
	ts, _, _ := setupTestServer(t)

	req, _ := http.NewRequest("OPTIONS", ts.URL+"/api/peers", nil)
	req.Header.Set("Origin", "https://whip.bang9.dev")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("expected 204, got %d", resp.StatusCode)
	}
}

func TestAPICORSPreflightRejected(t *testing.T) {
	ts, _, _ := setupTestServer(t)

	req, _ := http.NewRequest("OPTIONS", ts.URL+"/api/peers", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for rejected preflight, got %d", resp.StatusCode)
	}
}

// --- Peers ---

func TestAPIGetPeers(t *testing.T) {
	ts, _, token := setupTestServer(t)
	resp := doRequest(t, ts, token, "GET", "/api/peers", nil)

	var peers []PeerStatus
	decodeJSON(t, resp, &peers)
	// Empty store should return empty array
	if len(peers) != 0 {
		t.Errorf("expected 0 peers, got %d", len(peers))
	}
}

// --- Messages ---

func TestAPIMessagesCRUD(t *testing.T) {
	ts, store, token := setupTestServer(t)

	// Send a message
	resp := doRequest(t, ts, token, "POST", "/api/messages", map[string]string{
		"to":      "alice",
		"from":    "bob",
		"content": "hello alice",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/messages: expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Send another
	store.SendMessage("alice", "charlie", "hi from charlie")

	// GET unread messages
	resp = doRequest(t, ts, token, "GET", "/api/messages/alice", nil)
	var msgs []Message
	decodeJSON(t, resp, &msgs)
	if len(msgs) != 2 {
		t.Fatalf("expected 2 unread messages, got %d", len(msgs))
	}

	// Mark all read
	resp = doRequest(t, ts, token, "POST", "/api/messages/alice/read", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/messages/alice/read: expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// GET unread should now be empty
	resp = doRequest(t, ts, token, "GET", "/api/messages/alice", nil)
	decodeJSON(t, resp, &msgs)
	if len(msgs) != 0 {
		t.Errorf("expected 0 unread messages, got %d", len(msgs))
	}

	// GET all messages should still return 2
	resp = doRequest(t, ts, token, "GET", "/api/messages/alice?all=true", nil)
	decodeJSON(t, resp, &msgs)
	if len(msgs) != 2 {
		t.Errorf("expected 2 total messages, got %d", len(msgs))
	}

	// DELETE messages
	resp = doRequest(t, ts, token, "DELETE", "/api/messages/alice", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("DELETE /api/messages/alice: expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Verify deleted
	resp = doRequest(t, ts, token, "GET", "/api/messages/alice?all=true", nil)
	decodeJSON(t, resp, &msgs)
	if len(msgs) != 0 {
		t.Errorf("expected 0 messages after delete, got %d", len(msgs))
	}
}

func TestAPIPostMessageValidation(t *testing.T) {
	ts, _, token := setupTestServer(t)

	tests := []struct {
		name string
		body map[string]string
	}{
		{"missing to", map[string]string{"from": "bob", "content": "hi"}},
		{"missing from", map[string]string{"to": "alice", "content": "hi"}},
		{"missing content", map[string]string{"to": "alice", "from": "bob"}},
		{"empty to", map[string]string{"to": "", "from": "bob", "content": "hi"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resp := doRequest(t, ts, token, "POST", "/api/messages", tc.body)
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("expected 400, got %d", resp.StatusCode)
			}
		})
	}
}

// --- Topics ---

func TestAPITopics(t *testing.T) {
	ts, store, token := setupTestServer(t)

	// Publish topics
	store.PublishTopic("alice", "API Contract", "GET /users -> []User")
	time.Sleep(10 * time.Millisecond) // ensure different timestamps
	store.PublishTopic("alice", "Auth Flow", "JWT + refresh tokens")

	// List topics
	resp := doRequest(t, ts, token, "GET", "/api/topics/alice", nil)
	var topics []Topic
	decodeJSON(t, resp, &topics)
	if len(topics) != 2 {
		t.Fatalf("expected 2 topics, got %d", len(topics))
	}
	if topics[0].Title != "API Contract" {
		t.Errorf("expected first topic 'API Contract', got %q", topics[0].Title)
	}

	// Get single topic
	resp = doRequest(t, ts, token, "GET", "/api/topics/alice/2", nil)
	var topic Topic
	decodeJSON(t, resp, &topic)
	if topic.Title != "Auth Flow" {
		t.Errorf("expected topic 'Auth Flow', got %q", topic.Title)
	}

	// Invalid index
	resp = doRequest(t, ts, token, "GET", "/api/topics/alice/99", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 for invalid index, got %d", resp.StatusCode)
	}
}

func TestAPITopicsEmpty(t *testing.T) {
	ts, _, token := setupTestServer(t)
	resp := doRequest(t, ts, token, "GET", "/api/topics/nobody", nil)
	var topics []Topic
	decodeJSON(t, resp, &topics)
	if len(topics) != 0 {
		t.Errorf("expected 0 topics, got %d", len(topics))
	}
}

// --- Tasks ---

func TestAPITasks(t *testing.T) {
	// Create temp whip tasks dir
	origHome := os.Getenv("HOME")
	tmpHome := t.TempDir()
	os.Setenv("HOME", tmpHome)
	t.Cleanup(func() { os.Setenv("HOME", origHome) })

	tasksDir := filepath.Join(tmpHome, ".whip", "tasks")

	// Create two task directories
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

	// List tasks
	resp := doRequest(t, ts, token, "GET", "/api/tasks", nil)
	var tasks []whipTask
	decodeJSON(t, resp, &tasks)
	if len(tasks) != 2 {
		t.Fatalf("expected 2 tasks, got %d", len(tasks))
	}
	// Should be sorted by created_at (oldest first)
	if tasks[0].ID != "abc12" {
		t.Errorf("expected first task 'abc12', got %q", tasks[0].ID)
	}
	// pid_alive should be false for pid 0
	if tasks[0].PIDAlive {
		t.Error("expected pid_alive=false for shell_pid 0")
	}

	// Get single task
	resp = doRequest(t, ts, token, "GET", "/api/tasks/abc12", nil)
	var task whipTask
	decodeJSON(t, resp, &task)
	if task.Title != "First task" {
		t.Errorf("expected 'First task', got %q", task.Title)
	}

	// Get non-existent task
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

	// Use our own PID (guaranteed alive)
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

// --- Not found ---

func TestAPINotFound(t *testing.T) {
	ts, _, token := setupTestServer(t)

	paths := []string{"/api/unknown", "/api", "/foo"}
	for _, p := range paths {
		resp := doRequest(t, ts, token, "GET", p, nil)
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("GET %s: expected 404, got %d", p, resp.StatusCode)
		}
	}
}

// --- RunServer ---

func TestAPIRunServer(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStoreWithBaseDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	var gotInfo ServerInfo
	ready := make(chan struct{})

	cfg := ServerConfig{
		Port:  0, // random port
		Store: store,
		OnReady: func(info ServerInfo) {
			gotInfo = info
			close(ready)
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- RunServer(ctx, cfg)
	}()

	select {
	case <-ready:
	case <-time.After(3 * time.Second):
		t.Fatal("server did not become ready in time")
	}

	if gotInfo.Token == "" {
		t.Error("expected non-empty token")
	}
	if gotInfo.LocalURL == "" {
		t.Error("expected non-empty local URL")
	}

	// Make a request to verify it works
	req, _ := http.NewRequest("GET", gotInfo.LocalURL+"/api/peers?token="+gotInfo.Token, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request to running server: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	// Token should be 32 hex chars
	if len(gotInfo.Token) != 32 {
		t.Errorf("expected 32-char token, got %d chars", len(gotInfo.Token))
	}

	cancel()

	select {
	case err := <-errCh:
		if err != nil {
			t.Errorf("RunServer returned error: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Error("server did not shut down in time")
	}
}

