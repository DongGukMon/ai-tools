package whip

import (
	"fmt"
	"net/http"
	"os/exec"
)

func handleMasterCapture(w http.ResponseWriter, sessionName string) {
	cmd := exec.Command("tmux", "capture-pane", "-t", sessionName, "-p", "-S", "-500")
	out, err := cmd.Output()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "session not available"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"content": string(out)})
}

func handleMasterKeys(w http.ResponseWriter, r *http.Request, sessionName string) {
	var body struct {
		Keys string `json:"keys"`
	}
	if !decodeLimitedJSONBody(w, r, &body, "invalid body") {
		return
	}
	if body.Keys == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "keys required"})
		return
	}
	if len(body.Keys) > maxHTTPMasterKeysSize {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("keys too large (%d bytes, max %d bytes)", len(body.Keys), maxHTTPMasterKeysSize),
		})
		return
	}

	keys := body.Keys
	hasEnter := len(keys) > 0 && keys[len(keys)-1] == '\n'
	if hasEnter {
		keys = keys[:len(keys)-1]
	}
	if keys != "" {
		cmd := exec.Command("tmux", "send-keys", "-t", sessionName, "-l", keys)
		if err := cmd.Run(); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "session not available"})
			return
		}
	}
	if hasEnter {
		cmd := exec.Command("tmux", "send-keys", "-t", sessionName, "Enter")
		if err := cmd.Run(); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "session not available"})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleMasterStatus(w http.ResponseWriter, sessionName string) {
	alive := exec.Command("tmux", "has-session", "-t", sessionName).Run() == nil
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"session": sessionName,
		"alive":   alive,
	})
}
