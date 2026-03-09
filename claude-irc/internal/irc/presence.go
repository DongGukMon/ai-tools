package irc

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// PeerStatus represents the online/offline status of a peer.
type PeerStatus struct {
	Name         string    `json:"name"`
	Online       bool      `json:"online"`
	CWD          string    `json:"cwd"`
	RegisteredAt time.Time `json:"registered_at"`
}

// CheckPresence pings a peer's Unix socket to check if they're online.
func (s *Store) CheckPresence(name string) bool {
	socketPath := s.SocketPath(name)

	conn, err := net.DialTimeout("unix", socketPath, 500*time.Millisecond)
	if err != nil {
		return false
	}
	defer conn.Close()

	conn.SetDeadline(time.Now().Add(500 * time.Millisecond))

	req := SocketRequest{Type: "ping"}
	data, _ := json.Marshal(req)
	data = append(data, '\n')
	if _, err := conn.Write(data); err != nil {
		return false
	}

	scanner := bufio.NewScanner(conn)
	if !scanner.Scan() {
		return false
	}

	var resp SocketResponse
	if err := json.Unmarshal(scanner.Bytes(), &resp); err != nil {
		return false
	}

	return resp.Type == "pong"
}

// CheckAllPresence returns the status of all registered peers.
// Automatically cleans up stale peers whose process has died.
func (s *Store) CheckAllPresence() ([]PeerStatus, error) {
	peers, err := s.ListPeers()
	if err != nil {
		return nil, err
	}

	var statuses []PeerStatus
	for name, info := range peers {
		online := s.CheckPresence(name)

		// If offline, check if daemon PID is dead and clean up
		if !online {
			s.tryCleanStalePeer(name)
		}

		statuses = append(statuses, PeerStatus{
			Name:         name,
			Online:       online,
			CWD:          info.CWD,
			RegisteredAt: info.RegisteredAt,
		})
	}

	return statuses, nil
}

// tryCleanStalePeer removes a peer's artifacts if its daemon process is dead.
func (s *Store) tryCleanStalePeer(name string) {
	pidPath := s.PIDPath(name)
	data, err := os.ReadFile(pidPath)
	if err != nil {
		return // No PID file, nothing to clean
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return
	}

	if !isProcessAlive(pid) {
		// Daemon is dead, clean up
		os.Remove(s.SocketPath(name))
		os.Remove(pidPath)

		// Find and remove session markers for this peer
		entries, _ := os.ReadDir(s.BaseDir)
		for _, entry := range entries {
			if strings.HasPrefix(entry.Name(), ".session_") {
				markerPath := fmt.Sprintf("%s/%s", s.BaseDir, entry.Name())
				content, _ := os.ReadFile(markerPath)
				if strings.TrimSpace(string(content)) == name {
					os.Remove(markerPath)
				}
			}
		}

		// Clean up orphan inbox directory
		os.RemoveAll(s.InboxDir(name))

		// Unregister from registry
		s.Unregister(name)
	}
}

// CleanOrphanDirs removes inbox directories for peers not in the registry.
func (s *Store) CleanOrphanDirs() {
	peers, err := s.ListPeers()
	if err != nil {
		return
	}

	for _, subdir := range []string{"inbox"} {
		dir := filepath.Join(s.BaseDir, subdir)
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			if _, ok := peers[entry.Name()]; !ok {
				os.RemoveAll(filepath.Join(dir, entry.Name()))
			}
		}
	}
}
