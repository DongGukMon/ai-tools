package server

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"

	"github.com/bang9/ai-tools/rewind/internal/parser"
	"github.com/bang9/ai-tools/rewind/web"
)

// OpenBrowser is a package-level function for opening URLs in the browser.
var OpenBrowser = openBrowser

type sessionPayload struct {
	plain   []byte
	gzipped []byte
}

// Run starts an HTTP server serving the session timeline and opens a browser.
func Run(session *parser.Session, port int) error {
	token := generateToken()

	payload, err := buildSessionPayload(session)
	if err != nil {
		return err
	}

	// Get the embedded dist filesystem
	distFS, err := fs.Sub(web.StaticFS, "dist")
	if err != nil {
		return fmt.Errorf("failed to access embedded dist: %w", err)
	}

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to start server: %w", err)
	}
	actualPort := listener.Addr().(*net.TCPAddr).Port

	mux := http.NewServeMux()

	// API endpoint: session data
	mux.HandleFunc("/api/session", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("token") != token {
			http.Error(w, "invalid token", http.StatusForbidden)
			return
		}
		payload.write(w, r)
	})

	// Static files from embedded dist
	fileServer := http.FileServer(http.FS(distFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// For the root path, validate token
		if r.URL.Path == "/" {
			if r.URL.Query().Get("token") != token {
				http.Error(w, "invalid token", http.StatusForbidden)
				return
			}
		}
		fileServer.ServeHTTP(w, r)
	})

	srv := &http.Server{Handler: mux}
	go srv.Serve(listener)

	url := fmt.Sprintf("http://127.0.0.1:%d/?token=%s", actualPort, token)
	fmt.Fprintf(os.Stderr, "Opening session at %s\n", url)
	fmt.Fprintf(os.Stderr, "Press Ctrl+C to stop\n")
	OpenBrowser(url)

	// Wait for interrupt
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	fmt.Fprintln(os.Stderr, "\nShutting down...")
	srv.Shutdown(context.Background())
	return nil
}

func buildSessionPayload(session *parser.Session) (*sessionPayload, error) {
	sessionJSON, err := json.Marshal(session)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal session: %w", err)
	}

	payload := &sessionPayload{
		plain: sessionJSON,
	}

	var buf bytes.Buffer
	zw, err := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize gzip writer: %w", err)
	}
	if _, err := zw.Write(sessionJSON); err != nil {
		return nil, fmt.Errorf("failed to gzip session payload: %w", err)
	}
	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("failed to finalize gzip payload: %w", err)
	}

	if buf.Len() > 0 && buf.Len() < len(sessionJSON) {
		payload.gzipped = buf.Bytes()
	}

	return payload, nil
}

func (p *sessionPayload) write(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Vary", "Accept-Encoding")

	if len(p.gzipped) > 0 && acceptsGzip(r.Header.Get("Accept-Encoding")) {
		w.Header().Set("Content-Encoding", "gzip")
		_, _ = w.Write(p.gzipped)
		return
	}

	_, _ = w.Write(p.plain)
}

func acceptsGzip(acceptEncoding string) bool {
	return strings.Contains(acceptEncoding, "gzip")
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
