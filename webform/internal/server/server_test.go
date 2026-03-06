package server

import (
	"encoding/json"
	"html/template"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bang9/ai-tools/webform/internal/schema"
	"github.com/bang9/ai-tools/webform/web"
)

func TestGenerateToken(t *testing.T) {
	token1 := generateToken()
	token2 := generateToken()

	if len(token1) != 32 {
		t.Errorf("expected token length 32, got %d", len(token1))
	}
	if token1 == token2 {
		t.Error("tokens should be unique")
	}
}

func TestSubmitEndpoint(t *testing.T) {
	token := "testtoken123"
	resultCh := make(chan string, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/submit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", 405)
			return
		}
		if r.URL.Query().Get("token") != token {
			http.Error(w, "invalid token", http.StatusForbidden)
			return
		}

		var data json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "invalid JSON", 400)
			return
		}

		result := Result{Status: "submitted", Data: data}
		b, _ := json.Marshal(result)

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
		resultCh <- string(b)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	body := strings.NewReader(`{"name":"test","age":25}`)
	resp, err := http.Post(srv.URL+"/submit?token="+token, "application/json", body)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	result := <-resultCh
	var r Result
	json.Unmarshal([]byte(result), &r)
	if r.Status != "submitted" {
		t.Errorf("expected status 'submitted', got '%s'", r.Status)
	}
}

func TestSubmitEndpoint_InvalidToken(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/submit", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("token") != "correct" {
			http.Error(w, "invalid token", http.StatusForbidden)
			return
		}
		w.Write([]byte(`{"ok":true}`))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	body := strings.NewReader(`{"name":"test"}`)
	resp, err := http.Post(srv.URL+"/submit?token=wrong", "application/json", body)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestSubmitEndpoint_InvalidJSON(t *testing.T) {
	token := "testtoken"
	mux := http.NewServeMux()
	mux.HandleFunc("/submit", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("token") != token {
			http.Error(w, "invalid token", http.StatusForbidden)
			return
		}
		var data json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "invalid JSON", 400)
			return
		}
		w.Write([]byte(`{"ok":true}`))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	body := strings.NewReader(`{invalid json}`)
	resp, err := http.Post(srv.URL+"/submit?token="+token, "application/json", body)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestSubmitEndpoint_WrongMethod(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/submit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", 405)
			return
		}
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/submit")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 405 {
		t.Errorf("expected 405, got %d", resp.StatusCode)
	}
}

func TestCancelEndpoint(t *testing.T) {
	token := "canceltoken"
	resultCh := make(chan string, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/cancel", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", 405)
			return
		}
		if r.URL.Query().Get("token") != token {
			http.Error(w, "invalid token", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
		result := Result{Status: "cancelled"}
		b, _ := json.Marshal(result)
		resultCh <- string(b)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/cancel?token="+token, "", nil)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	result := <-resultCh
	var r Result
	json.Unmarshal([]byte(result), &r)
	if r.Status != "cancelled" {
		t.Errorf("expected status 'cancelled', got '%s'", r.Status)
	}
}

func TestCancelEndpoint_InvalidToken(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/cancel", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", 405)
			return
		}
		if r.URL.Query().Get("token") != "correct" {
			http.Error(w, "invalid token", http.StatusForbidden)
			return
		}
		w.Write([]byte(`{"ok":true}`))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/cancel?token=wrong", "", nil)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIndexTemplate(t *testing.T) {
	tmpl, err := template.New("index").Parse(web.IndexHTML)
	if err != nil {
		t.Fatalf("template parse error: %v", err)
	}

	var buf strings.Builder
	err = tmpl.Execute(&buf, map[string]interface{}{
		"Schema":  template.JS(`{"t":"Test","f":[["x","t","X"]]}`),
		"Token":   "abc123",
		"Timeout": 300,
	})
	if err != nil {
		t.Fatalf("template execute error: %v", err)
	}

	html := buf.String()
	if !strings.Contains(html, "abc123") {
		t.Error("rendered HTML should contain token")
	}
	if !strings.Contains(html, "300") {
		t.Error("rendered HTML should contain timeout")
	}
}

func TestStaticAssets(t *testing.T) {
	if web.IndexHTML == "" {
		t.Error("IndexHTML should not be empty")
	}
	if web.StyleCSS == "" {
		t.Error("StyleCSS should not be empty")
	}
	if web.FormJS == "" {
		t.Error("FormJS should not be empty")
	}
}

func TestResultJSON(t *testing.T) {
	tests := []struct {
		name   string
		result Result
		want   string
	}{
		{
			name:   "submitted",
			result: Result{Status: "submitted", Data: json.RawMessage(`{"name":"test"}`)},
			want:   `{"status":"submitted","data":{"name":"test"}}`,
		},
		{
			name:   "cancelled",
			result: Result{Status: "cancelled"},
			want:   `{"status":"cancelled"}`,
		},
		{
			name:   "timeout",
			result: Result{Status: "timeout"},
			want:   `{"status":"timeout"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b, err := json.Marshal(tt.result)
			if err != nil {
				t.Fatalf("marshal error: %v", err)
			}
			if string(b) != tt.want {
				t.Errorf("got %s, want %s", string(b), tt.want)
			}
		})
	}
}

// ── Integration tests ──

// captureURL sets up OpenBrowser mock and returns a function that waits for the URL.
func captureURL(t *testing.T) (getURL func() string, cleanup func()) {
	t.Helper()
	var mu sync.Mutex
	var url string
	ready := make(chan struct{}, 1)

	origOpen := OpenBrowser
	OpenBrowser = func(u string) {
		mu.Lock()
		url = u
		mu.Unlock()
		select {
		case ready <- struct{}{}:
		default:
		}
	}

	getURL = func() string {
		select {
		case <-ready:
		case <-time.After(5 * time.Second):
			t.Fatal("timed out waiting for server to start")
		}
		mu.Lock()
		defer mu.Unlock()
		return url
	}

	cleanup = func() { OpenBrowser = origOpen }
	return
}

func parseURL(raw string) (baseURL, token string) {
	idx := strings.Index(raw, "?token=")
	return strings.TrimRight(raw[:idx], "/"), raw[idx+7:]
}

func newTestSchema(t *testing.T, input string) *schema.Schema {
	t.Helper()
	s := &schema.Schema{}
	if err := json.Unmarshal([]byte(input), s); err != nil {
		t.Fatalf("schema parse error: %v", err)
	}
	s.SetRaw(input)
	return s
}

func TestRun_Submit(t *testing.T) {
	getURL, cleanup := captureURL(t)
	defer cleanup()

	s := newTestSchema(t, `{"t":"Test","f":[["name","t","Name"]]}`)

	resultCh := make(chan string, 1)
	errCh := make(chan error, 1)
	go func() {
		result, err := Run(s, 10)
		if err != nil {
			errCh <- err
			return
		}
		resultCh <- result
	}()

	url := getURL()
	base, tok := parseURL(url)

	resp, err := http.Post(base+"/submit?token="+tok, "application/json", strings.NewReader(`{"name":"hello"}`))
	if err != nil {
		t.Fatalf("submit failed: %v", err)
	}
	resp.Body.Close()

	select {
	case result := <-resultCh:
		var r Result
		json.Unmarshal([]byte(result), &r)
		if r.Status != "submitted" {
			t.Errorf("expected 'submitted', got '%s'", r.Status)
		}
	case err := <-errCh:
		t.Fatalf("Run() error: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for result")
	}
}

func TestRun_Cancel(t *testing.T) {
	getURL, cleanup := captureURL(t)
	defer cleanup()

	s := newTestSchema(t, `{"t":"Test","f":[["x","t","X"]]}`)

	resultCh := make(chan string, 1)
	errCh := make(chan error, 1)
	go func() {
		result, err := Run(s, 10)
		if err != nil {
			errCh <- err
			return
		}
		resultCh <- result
	}()

	url := getURL()
	base, tok := parseURL(url)

	resp, err := http.Post(base+"/cancel?token="+tok, "", nil)
	if err != nil {
		t.Fatalf("cancel failed: %v", err)
	}
	resp.Body.Close()

	select {
	case result := <-resultCh:
		var r Result
		json.Unmarshal([]byte(result), &r)
		if r.Status != "cancelled" {
			t.Errorf("expected 'cancelled', got '%s'", r.Status)
		}
	case err := <-errCh:
		t.Fatalf("Run() error: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for result")
	}
}

func TestRun_Timeout(t *testing.T) {
	origOpen := OpenBrowser
	OpenBrowser = func(url string) {}
	defer func() { OpenBrowser = origOpen }()

	s := newTestSchema(t, `{"t":"Test","f":[["x","t","X"]]}`)

	result, err := Run(s, 1)
	if err != nil {
		t.Fatalf("Run() error: %v", err)
	}

	var r Result
	json.Unmarshal([]byte(result), &r)
	if r.Status != "timeout" {
		t.Errorf("expected 'timeout', got '%s'", r.Status)
	}
}

func TestRun_SubmitInvalidToken(t *testing.T) {
	getURL, cleanup := captureURL(t)
	defer cleanup()

	s := newTestSchema(t, `{"t":"Test","f":[["x","t","X"]]}`)

	go func() {
		Run(s, 5)
	}()

	url := getURL()
	base, _ := parseURL(url)

	resp, err := http.Post(base+"/submit?token=wrongtoken", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}
