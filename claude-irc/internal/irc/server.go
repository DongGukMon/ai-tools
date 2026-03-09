package irc

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// ServerConfig holds configuration for the HTTP API server.
type ServerConfig struct {
	Port       int
	BindHost   string
	Store      *Store
	MasterTmux string
	Token      string
	OnReady    func(info ServerInfo)
}

// ServerInfo contains details about a running server instance.
type ServerInfo struct {
	Token      string `json:"token"`
	ShortCode  string `json:"short_code"`
	LocalURL   string `json:"local_url"`
	ListenAddr string `json:"listen_addr"`
}

const dashboardOperatorName = "user"
const defaultServerBindHost = "127.0.0.1"
const defaultServerAdvertiseHost = "localhost"
const dashboardWebBaseURL = "https://whip.bang9.dev"

const (
	maxHTTPJSONBodyBytes      int64 = 1 << 20
	maxHTTPMessageContentSize       = 10 << 10
	maxHTTPMasterKeysSize           = 10 << 10
)

// RunServer starts the HTTP API server and blocks until the context is cancelled.
func RunServer(ctx context.Context, cfg ServerConfig) error {
	token := cfg.Token
	if token == "" {
		var err error
		token, err = generateToken()
		if err != nil {
			return fmt.Errorf("generating token: %w", err)
		}
	}
	shortCode := shortCodeFromToken(token)

	mux := buildHandler(cfg.Store, token, shortCode, cfg.MasterTmux)

	bindHost := resolveBindHost(cfg.BindHost)
	listenAddr := net.JoinHostPort(bindHost, strconv.Itoa(cfg.Port))
	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		if killErr := killPortHolder(cfg.Port); killErr == nil {
			listener, err = net.Listen("tcp", listenAddr)
		}
		if err != nil {
			return fmt.Errorf("listen: %w", err)
		}
	}

	addr := listener.Addr().(*net.TCPAddr)
	info := ServerInfo{
		Token:      token,
		ShortCode:  shortCode,
		LocalURL:   localURLForHost(advertiseServerHost(bindHost), addr.Port),
		ListenAddr: listener.Addr().String(),
	}

	if cfg.OnReady != nil {
		cfg.OnReady(info)
	}

	srv := &http.Server{Handler: mux}
	go func() {
		<-ctx.Done()
		srv.Shutdown(context.Background())
	}()

	if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

func shortCodeFromToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:4])
}

func ConnectURL(baseURL, token string) string {
	u, err := url.Parse(baseURL)
	if err != nil {
		return fmt.Sprintf("%s#token=%s", strings.TrimRight(baseURL, "#"), token)
	}
	u.RawQuery = ""
	u.Fragment = "token=" + token
	return u.String()
}

func DashboardURL(connectURL string) string {
	return dashboardWebBaseURL + "#" + connectURL
}

func generateToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// buildHandler creates the HTTP handler with auth and CORS middleware.
func buildHandler(store *Store, token string, shortCode string, masterTmux string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/s/") {
			code := strings.TrimPrefix(r.URL.Path, "/s/")
			if code == shortCode {
				connectURL := ConnectURL(requestBaseURL(r), token)
				webURL := DashboardURL(connectURL)
				http.Redirect(w, r, webURL, http.StatusFound)
			} else {
				http.NotFound(w, r)
			}
			return
		}

		origin := r.Header.Get("Origin")
		if isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			if isAllowedOrigin(origin) {
				w.WriteHeader(http.StatusNoContent)
			} else {
				w.WriteHeader(http.StatusForbidden)
			}
			return
		}

		if !checkAuth(r, token) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}

		route(w, r, store, masterTmux)
	})
}

func route(w http.ResponseWriter, r *http.Request, store *Store, masterTmux string) {
	path := strings.TrimRight(r.URL.Path, "/")
	segments := strings.Split(strings.TrimPrefix(path, "/"), "/")

	if len(segments) < 2 || segments[0] != "api" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}

	resource := segments[1]
	switch resource {
	case "peers":
		if r.Method == http.MethodGet && len(segments) == 2 {
			handleGetPeers(w, store)
			return
		}

	case "messages":
		if len(segments) == 2 {
			if r.Method == http.MethodPost {
				handlePostMessage(w, r, store)
				return
			}
		} else if len(segments) == 3 {
			name := segments[2]
			switch r.Method {
			case http.MethodGet:
				handleGetMessages(w, r, store, name)
				return
			case http.MethodDelete:
				handleDeleteMessages(w, store, name)
				return
			}
		} else if len(segments) == 4 && segments[3] == "read" {
			name := segments[2]
			if r.Method == http.MethodPost {
				handleMarkRead(w, store, name)
				return
			}
		}

	case "master":
		if masterTmux == "" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "master session not configured"})
			return
		}
		if len(segments) == 3 {
			switch segments[2] {
			case "capture":
				if r.Method == http.MethodGet {
					handleMasterCapture(w, masterTmux)
					return
				}
			case "keys":
				if r.Method == http.MethodPost {
					handleMasterKeys(w, r, masterTmux)
					return
				}
			case "status":
				if r.Method == http.MethodGet {
					handleMasterStatus(w, masterTmux)
					return
				}
			}
		}

	case "tasks":
		if len(segments) == 2 && r.Method == http.MethodGet {
			handleGetTasks(w)
			return
		} else if len(segments) == 3 && r.Method == http.MethodGet {
			handleGetTask(w, segments[2])
			return
		}
	}

	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}
