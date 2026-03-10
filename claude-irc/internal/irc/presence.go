package irc

import (
	"bufio"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"sort"
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
			s.tryCleanStalePeer(name, info.DaemonPID)
		}

		statuses = append(statuses, PeerStatus{
			Name:         name,
			Online:       online,
			CWD:          info.CWD,
			RegisteredAt: info.RegisteredAt,
		})
	}

	sort.Slice(statuses, func(i, j int) bool {
		return statuses[i].Name < statuses[j].Name
	})

	return statuses, nil
}

// tryCleanStalePeer removes a peer's artifacts if its daemon process is dead.
// registryDaemonPID is the DaemonPID from the registry entry; if that process
// is still alive, cleanup is skipped entirely to prevent false-offline removals
// caused by transient socket-ping timeouts.
func (s *Store) tryCleanStalePeer(name string, registryDaemonPID int) {
	// Strong guard: if the daemon PID recorded in the registry is alive,
	// the peer is not stale — skip cleanup even if the socket ping failed.
	if registryDaemonPID > 0 && isProcessAlive(registryDaemonPID) {
		return
	}

	pidPath := s.PIDPath(name)
	data, err := os.ReadFile(pidPath)
	if err != nil {
		// PID file missing: only clean if socket is also missing (daemon fully gone)
		if _, socketErr := os.Stat(s.SocketPath(name)); os.IsNotExist(socketErr) {
			s.cleanStalePeerArtifacts(name)
		}
		return
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return
	}

	if !isProcessAlive(pid) {
		os.Remove(s.SocketPath(name))
		os.Remove(pidPath)
		s.cleanStalePeerArtifacts(name)
	}
}

// cleanStalePeerArtifacts removes session markers, inbox, and registry entry for a peer.
func (s *Store) cleanStalePeerArtifacts(name string) {
	entries, _ := os.ReadDir(s.BaseDir)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".session_") {
			markerPath := filepath.Join(s.BaseDir, entry.Name())
			content, _ := os.ReadFile(markerPath)
			peerName, _ := parseSessionMarker(content)
			if peerName == name {
				os.Remove(markerPath)
			}
		}
	}
	os.RemoveAll(s.InboxDir(name))
	s.Unregister(name)
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
