package whip

import (
	"fmt"
	"net/http"

	irclib "github.com/bang9/ai-tools/shared/irclib"
)

type PeerStatus = irclib.PeerStatus
type Message = irclib.Message

func handleGetPeers(w http.ResponseWriter, store *irclib.Store) {
	statuses, err := store.CheckAllPresence()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if statuses == nil {
		statuses = []PeerStatus{}
	}
	writeJSON(w, http.StatusOK, statuses)
}

func handlePostMessage(w http.ResponseWriter, r *http.Request, store *irclib.Store) {
	var body struct {
		To      string `json:"to"`
		From    string `json:"from"`
		Content string `json:"content"`
	}
	if !decodeLimitedJSONBody(w, r, &body, "invalid request body") {
		return
	}

	if body.To == "" || body.From == "" || body.Content == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "to, from, and content are required"})
		return
	}
	if !irclib.IsValidPeerName(body.To) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("%v", fmt.Errorf("%w: invalid peer name", irclib.ErrInvalidIdentifier))})
		return
	}
	if body.From != dashboardOperatorName {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only 'user' may send messages over HTTP"})
		return
	}
	if len(body.Content) > maxHTTPMessageContentSize {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("content too large (%d bytes, max %d bytes)", len(body.Content), maxHTTPMessageContentSize),
		})
		return
	}

	if err := store.SendMessage(body.To, body.From, body.Content); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

func handleGetMessages(w http.ResponseWriter, r *http.Request, store *irclib.Store, name string) {
	var messages []Message
	var err error

	if r.URL.Query().Get("all") == "true" {
		messages, err = store.ReadInbox(name)
	} else {
		messages, err = store.UnreadMessages(name)
	}

	if err != nil {
		writeJSON(w, statusForIdentifierError(err), map[string]string{"error": err.Error()})
		return
	}
	if messages == nil {
		messages = []Message{}
	}
	writeJSON(w, http.StatusOK, messages)
}

func handleMarkRead(w http.ResponseWriter, store *irclib.Store, name string) {
	if err := store.MarkAllRead(name); err != nil {
		writeJSON(w, statusForIdentifierError(err), map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleDeleteMessages(w http.ResponseWriter, store *irclib.Store, name string) {
	if err := store.ClearInbox(name); err != nil {
		writeJSON(w, statusForIdentifierError(err), map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
