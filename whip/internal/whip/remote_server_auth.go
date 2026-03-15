package whip

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const (
	serverAuthModeToken  = "token"
	serverAuthModeDevice = "device"
)

var localhostPattern = regexp.MustCompile(`^http://localhost(:\d+)?$`)

type serverAuthConfig struct {
	Mode                    string
	Token                   string
	Workspace               string
	RemoteAuth              *RemoteAuthStore
	OnDeviceChallenge       func(info DeviceAuthChallengeInfo)
	OnDeviceChallengeResult func(info DeviceAuthChallengeResultInfo)
}

type authConfigResponse struct {
	Mode                     string `json:"mode"`
	Workspace                string `json:"workspace"`
	ChallengeTTLSeconds      int    `json:"challenge_ttl_seconds,omitempty"`
	SessionTTLSeconds        int    `json:"session_ttl_seconds,omitempty"`
	SessionRefreshTTLSeconds int    `json:"session_refresh_ttl_seconds,omitempty"`
}

type authChallengeRequest struct {
	DeviceLabel string `json:"device_label"`
}

type authChallengeResponse struct {
	ChallengeID string    `json:"challenge_id"`
	CreatedAt   time.Time `json:"created_at"`
	ExpiresAt   time.Time `json:"expires_at"`
	DeviceLabel string    `json:"device_label,omitempty"`
}

type authExchangeRequest struct {
	ChallengeID string `json:"challenge_id"`
	OTP         string `json:"otp"`
	DeviceLabel string `json:"device_label"`
}

type authExchangeResponse struct {
	SessionID     string    `json:"session_id"`
	SessionSecret string    `json:"session_secret"`
	CreatedAt     time.Time `json:"created_at"`
	ExpiresAt     time.Time `json:"expires_at"`
	DeviceLabel   string    `json:"device_label,omitempty"`
}

func normalizeServerAuthMode(raw string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", serverAuthModeToken:
		return serverAuthModeToken, nil
	case serverAuthModeDevice:
		return serverAuthModeDevice, nil
	default:
		return "", fmt.Errorf("invalid auth mode %q (expected %q or %q)", raw, serverAuthModeToken, serverAuthModeDevice)
	}
}

func isAllowedOrigin(origin string) bool {
	if origin == "https://whip.bang9.dev" {
		return true
	}
	return localhostPattern.MatchString(origin)
}

func requestBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); forwarded != "" {
		scheme = forwarded
	}
	return fmt.Sprintf("%s://%s", scheme, r.Host)
}

func checkAuth(r *http.Request, cfg serverAuthConfig) bool {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if auth != "" {
		if cfg.Mode == serverAuthModeToken {
			return strings.HasPrefix(auth, "Bearer ") && strings.TrimSpace(strings.TrimPrefix(auth, "Bearer ")) == cfg.Token
		}
		if cfg.Mode == serverAuthModeDevice {
			sessionID, sessionSecret, ok := parseWhipSessionHeader(auth)
			if !ok || cfg.RemoteAuth == nil {
				return false
			}
			_, err := cfg.RemoteAuth.AuthenticateSession(time.Now().UTC(), sessionID, sessionSecret)
			return err == nil
		}
		return false
	}
	if cfg.Mode != serverAuthModeToken || !allowLegacyQueryTokenAuth(r) {
		return false
	}
	return r.URL.Query().Get("token") == cfg.Token
}

func isUnauthenticatedRoute(r *http.Request, cfg serverAuthConfig) bool {
	path := strings.TrimRight(r.URL.Path, "/")
	switch path {
	case "/api/auth/config":
		return r.Method == http.MethodGet
	case "/api/auth/challenges", "/api/auth/exchange":
		return cfg.Mode == serverAuthModeDevice && r.Method == http.MethodPost
	default:
		return false
	}
}

func parseWhipSessionHeader(raw string) (sessionID string, sessionSecret string, ok bool) {
	if !strings.HasPrefix(raw, "WhipSession ") {
		return "", "", false
	}
	parts := strings.SplitN(strings.TrimSpace(strings.TrimPrefix(raw, "WhipSession ")), ".", 2)
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return "", "", false
	}
	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), true
}

func allowLegacyQueryTokenAuth(r *http.Request) bool {
	if r.Method != http.MethodGet {
		return false
	}

	path := strings.TrimRight(r.URL.Path, "/")
	switch path {
	case "/api/peers", "/api/tasks":
		return true
	}

	if !strings.HasPrefix(path, "/api/tasks/") {
		return false
	}

	taskID := strings.TrimPrefix(path, "/api/tasks/")
	return taskID != "" && !strings.Contains(taskID, "/")
}

func handleAuthRoute(w http.ResponseWriter, r *http.Request, cfg serverAuthConfig) {
	path := strings.TrimRight(r.URL.Path, "/")
	switch path {
	case "/api/auth/config":
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		handleGetAuthConfig(w, cfg)
		return
	case "/api/auth/challenges":
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		handleCreateAuthChallenge(w, r, cfg)
		return
	case "/api/auth/exchange":
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
			return
		}
		handleExchangeAuthChallenge(w, r, cfg)
		return
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
}

func handleGetAuthConfig(w http.ResponseWriter, cfg serverAuthConfig) {
	resp := authConfigResponse{
		Mode:      cfg.Mode,
		Workspace: cfg.Workspace,
	}
	if cfg.Mode == serverAuthModeDevice {
		resp.ChallengeTTLSeconds = int(RemoteAuthChallengeTTL / time.Second)
		resp.SessionTTLSeconds = int(RemoteAuthSessionTTL / time.Second)
		resp.SessionRefreshTTLSeconds = int(RemoteAuthSessionRefreshTTL / time.Second)
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleCreateAuthChallenge(w http.ResponseWriter, r *http.Request, cfg serverAuthConfig) {
	if cfg.Mode != serverAuthModeDevice || cfg.RemoteAuth == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "device auth not enabled"})
		return
	}

	var req authChallengeRequest
	if !decodeLimitedJSONBody(w, r, &req, "invalid challenge request") {
		return
	}

	now := time.Now().UTC()
	challenge, otp, err := cfg.RemoteAuth.CreateChallenge(now, remoteAuthOriginFromRequest(r), req.DeviceLabel)
	if err != nil {
		if errors.Is(err, ErrRemoteAuthChallengeRateLimited) {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if cfg.OnDeviceChallenge != nil {
		cfg.OnDeviceChallenge(DeviceAuthChallengeInfo{
			Workspace:   cfg.Workspace,
			ChallengeID: challenge.ChallengeID,
			OTP:         otp,
			DeviceLabel: challenge.DeviceLabel,
			CreatedAt:   challenge.CreatedAt,
			ExpiresAt:   challenge.ExpiresAt,
		})
	}

	writeJSON(w, http.StatusCreated, authChallengeResponse{
		ChallengeID: challenge.ChallengeID,
		CreatedAt:   challenge.CreatedAt,
		ExpiresAt:   challenge.ExpiresAt,
		DeviceLabel: challenge.DeviceLabel,
	})
}

func handleExchangeAuthChallenge(w http.ResponseWriter, r *http.Request, cfg serverAuthConfig) {
	if cfg.Mode != serverAuthModeDevice || cfg.RemoteAuth == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "device auth not enabled"})
		return
	}

	var req authExchangeRequest
	if !decodeLimitedJSONBody(w, r, &req, "invalid challenge exchange request") {
		return
	}

	now := time.Now().UTC()
	session, sessionSecret, err := cfg.RemoteAuth.ExchangeChallenge(now, strings.TrimSpace(req.ChallengeID), strings.TrimSpace(req.OTP), req.DeviceLabel)
	if err != nil {
		status := http.StatusUnauthorized
		switch {
		case errors.Is(err, ErrRemoteAuthNoChallenge):
			status = http.StatusNotFound
		case errors.Is(err, ErrRemoteAuthChallengeExpired),
			errors.Is(err, ErrRemoteAuthChallengeUsed),
			errors.Is(err, ErrRemoteAuthChallengeFailed):
			status = http.StatusGone
		case errors.Is(err, ErrRemoteAuthInvalidOTP):
			status = http.StatusUnauthorized
		default:
			status = http.StatusInternalServerError
		}
		if cfg.OnDeviceChallengeResult != nil {
			cfg.OnDeviceChallengeResult(DeviceAuthChallengeResultInfo{
				Workspace:   cfg.Workspace,
				ChallengeID: strings.TrimSpace(req.ChallengeID),
				DeviceLabel: strings.TrimSpace(req.DeviceLabel),
				Result:      "error",
				Error:       err.Error(),
				At:          now,
			})
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	if cfg.OnDeviceChallengeResult != nil {
		cfg.OnDeviceChallengeResult(DeviceAuthChallengeResultInfo{
			Workspace:   cfg.Workspace,
			ChallengeID: strings.TrimSpace(req.ChallengeID),
			SessionID:   session.SessionID,
			DeviceLabel: session.DeviceLabel,
			Result:      "success",
			At:          now,
		})
	}

	writeJSON(w, http.StatusCreated, authExchangeResponse{
		SessionID:     session.SessionID,
		SessionSecret: sessionSecret,
		CreatedAt:     session.CreatedAt,
		ExpiresAt:     session.ExpiresAt,
		DeviceLabel:   session.DeviceLabel,
	})
}

func remoteAuthOriginFromRequest(r *http.Request) RemoteAuthOrigin {
	return RemoteAuthOrigin{
		RemoteAddr:   strings.TrimSpace(r.RemoteAddr),
		ForwardedFor: strings.TrimSpace(r.Header.Get("X-Forwarded-For")),
		UserAgent:    strings.TrimSpace(r.Header.Get("User-Agent")),
		Origin:       strings.TrimSpace(r.Header.Get("Origin")),
		Host:         strings.TrimSpace(r.Host),
	}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func decodeLimitedJSONBody(w http.ResponseWriter, r *http.Request, dst interface{}, invalidBodyMessage string) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxHTTPJSONBodyBytes)

	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "request body too large"})
			return false
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": invalidBodyMessage})
		return false
	}

	return true
}
