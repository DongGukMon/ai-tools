package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/bang9/ai-tools/webform/internal/schema"
	"github.com/bang9/ai-tools/webform/web"
)

type Result struct {
	Status string          `json:"status"`
	Data   json.RawMessage `json:"data,omitempty"`
}

// OpenBrowser is a package-level function for opening URLs in the browser.
// It can be replaced in tests to avoid opening actual browsers.
var OpenBrowser = openBrowser

const maxBodySize = 1 << 20 // 1MB

func Run(s *schema.Schema, timeoutSec int) (string, error) {
	if timeoutSec <= 0 {
		timeoutSec = 300
	}

	token := generateToken()

	// Escape </script> in schema JSON to prevent XSS breakout
	safeSchema := strings.ReplaceAll(s.JSON(), "</", "<\\/")

	tmpl, err := template.New("index").Parse(web.IndexHTML)
	if err != nil {
		return "", fmt.Errorf("failed to parse template: %w", err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", fmt.Errorf("failed to start server: %w", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port

	resultCh := make(chan string, 1)
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()

	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("token") != token {
			http.Error(w, "invalid token", http.StatusForbidden)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		tmpl.Execute(w, map[string]interface{}{
			"Schema":  template.JS(safeSchema),
			"Token":   token,
			"Timeout": timeoutSec,
		})
	})

	mux.HandleFunc("/style.css", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/css")
		w.Write([]byte(web.StyleCSS))
	})

	mux.HandleFunc("/form.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		w.Write([]byte(web.FormJS))
	})

	mux.HandleFunc("/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("token") != token {
			http.Error(w, "invalid token", http.StatusForbidden)
			return
		}

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", 500)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-r.Context().Done():
				return
			case <-ctx.Done():
				fmt.Fprintf(w, "event: timeout\ndata: {}\n\n")
				flusher.Flush()
				return
			case <-ticker.C:
				fmt.Fprintf(w, "event: heartbeat\ndata: {}\n\n")
				flusher.Flush()
			}
		}
	})

	mux.HandleFunc("/submit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", 405)
			return
		}
		if r.URL.Query().Get("token") != token {
			http.Error(w, "invalid token", http.StatusForbidden)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)

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

	srv := &http.Server{Handler: mux}
	go srv.Serve(listener)
	defer func() {
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer shutdownCancel()
		srv.Shutdown(shutdownCtx)
	}()

	url := fmt.Sprintf("http://127.0.0.1:%d/?token=%s", port, token)
	fmt.Fprintf(os.Stderr, "Opening form at %s\n", url)
	OpenBrowser(url)

	select {
	case result := <-resultCh:
		return result, nil
	case <-ctx.Done():
		result := Result{Status: "timeout"}
		b, _ := json.Marshal(result)
		return string(b), nil
	}
}

func generateToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	}
	if cmd != nil {
		cmd.Start()
	}
}
