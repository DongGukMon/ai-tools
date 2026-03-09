package irc

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

var localhostPattern = regexp.MustCompile(`^http://localhost(:\d+)?$`)

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

func checkAuth(r *http.Request, token string) bool {
	auth := r.Header.Get("Authorization")
	if auth != "" {
		return strings.HasPrefix(auth, "Bearer ") && strings.TrimPrefix(auth, "Bearer ") == token
	}
	if !allowLegacyQueryTokenAuth(r) {
		return false
	}
	return r.URL.Query().Get("token") == token
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

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
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
