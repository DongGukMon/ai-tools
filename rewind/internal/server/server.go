package server

import (
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
	"syscall"

	"github.com/bang9/ai-tools/rewind/internal/parser"
	"github.com/bang9/ai-tools/rewind/web"
)

// OpenBrowser is a package-level function for opening URLs in the browser.
var OpenBrowser = openBrowser

// Run starts an HTTP server serving the session timeline and opens a browser.
func Run(session *parser.Session, port int) error {
	token := generateToken()

	sessionJSON, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("failed to marshal session: %w", err)
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
		w.Header().Set("Content-Type", "application/json")
		w.Write(sessionJSON)
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
