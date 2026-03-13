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
	"time"
)

// ServerConfig holds configuration for the HTTP API server.
type ServerConfig struct {
	Port              int
	BindHost          string
	Store             *Store
	MasterTmux        string
	Token             string
	AuthMode          string
	Workspace         string
	OnReady           func(info ServerInfo)
	OnDeviceChallenge func(info DeviceAuthChallengeInfo)
	OnDeviceChallengeResult func(info DeviceAuthChallengeResultInfo)
}

// ServerInfo contains details about a running server instance.
type ServerInfo struct {
	AuthMode   string `json:"auth_mode"`
	Workspace  string `json:"workspace"`
	Token      string `json:"token,omitempty"`
	ShortCode  string `json:"short_code"`
	LocalURL   string `json:"local_url"`
	ListenAddr string `json:"listen_addr"`
}

type DeviceAuthChallengeInfo struct {
	Workspace   string    `json:"workspace"`
	ChallengeID string    `json:"challenge_id"`
	OTP         string    `json:"otp"`
	DeviceLabel string    `json:"device_label,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	ExpiresAt   time.Time `json:"expires_at"`
}

type DeviceAuthChallengeResultInfo struct {
	Workspace   string    `json:"workspace"`
	ChallengeID string    `json:"challenge_id"`
	SessionID   string    `json:"session_id,omitempty"`
	DeviceLabel string    `json:"device_label,omitempty"`
	Result      string    `json:"result"`
	Error       string    `json:"error,omitempty"`
	At          time.Time `json:"at"`
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
	authMode, err := normalizeServerAuthMode(cfg.AuthMode)
	if err != nil {
		return err
	}
	workspace, err := normalizeRemoteAuthWorkspace(cfg.Workspace)
	if err != nil {
		return err
	}

	token := strings.TrimSpace(cfg.Token)
	var remoteAuthStore *RemoteAuthStore
	if authMode == serverAuthModeToken {
		if token == "" {
			token, err = generateToken()
			if err != nil {
				return fmt.Errorf("generating token: %w", err)
			}
		}
	} else {
		token = ""
		remoteAuthStore, err = NewRemoteAuthStore(workspace)
		if err != nil {
			return fmt.Errorf("prepare remote auth store: %w", err)
		}
	}

	shortCode, err := generateServerShortCode(authMode, token, workspace)
	if err != nil {
		return fmt.Errorf("generate short code: %w", err)
	}

	authConfig := serverAuthConfig{
		Mode:                    authMode,
		Token:                   token,
		Workspace:               workspace,
		RemoteAuth:              remoteAuthStore,
		OnDeviceChallenge:       cfg.OnDeviceChallenge,
		OnDeviceChallengeResult: cfg.OnDeviceChallengeResult,
	}
	mux := buildHandler(cfg.Store, authConfig, shortCode, cfg.MasterTmux)

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
		AuthMode:   authMode,
		Workspace:  workspace,
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

func DeviceConnectURL(baseURL string) string {
	u, err := url.Parse(baseURL)
	if err != nil {
		return fmt.Sprintf("%s#mode=%s", strings.TrimRight(baseURL, "#"), serverAuthModeDevice)
	}
	u.RawQuery = ""
	u.Fragment = "mode=" + serverAuthModeDevice
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
func buildHandler(store *Store, authConfig serverAuthConfig, shortCode string, masterTmux string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/s/") {
			code := strings.TrimPrefix(r.URL.Path, "/s/")
			if code == shortCode {
				connectURL := serverConnectURL(requestBaseURL(r), authConfig)
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

		if !isUnauthenticatedRoute(r, authConfig) && !checkAuth(r, authConfig) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}

		route(w, r, store, masterTmux, authConfig)
	})
}

func route(w http.ResponseWriter, r *http.Request, store *Store, masterTmux string, authConfig serverAuthConfig) {
	path := strings.TrimRight(r.URL.Path, "/")
	segments := strings.Split(strings.TrimPrefix(path, "/"), "/")

	if len(segments) < 2 || segments[0] != "api" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}

	resource := segments[1]
	switch resource {
	case "auth":
		handleAuthRoute(w, r, authConfig)
		return

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
			handleGetTasks(w, r)
			return
		} else if len(segments) == 3 && r.Method == http.MethodGet {
			handleGetTask(w, segments[2])
			return
		}
	}

	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

func generateServerShortCode(authMode string, token string, workspace string) (string, error) {
	if authMode == serverAuthModeToken {
		return shortCodeFromToken(token), nil
	}
	nonce, err := generateToken()
	if err != nil {
		return "", err
	}
	return shortCodeFromToken(workspace + ":" + nonce), nil
}

func serverConnectURL(baseURL string, authConfig serverAuthConfig) string {
	if authConfig.Mode == serverAuthModeDevice {
		return DeviceConnectURL(baseURL)
	}
	return ConnectURL(baseURL, authConfig.Token)
}
