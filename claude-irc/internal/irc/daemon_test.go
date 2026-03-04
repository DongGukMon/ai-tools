package irc

import (
	"bufio"
	"encoding/json"
	"net"
	"os"
	"strconv"
	"testing"
	"time"
)

// newSocketTestStore creates a store with a short base dir path
// to avoid exceeding the Unix socket path limit (~104 chars on macOS).
func newSocketTestStore(t *testing.T) *Store {
	t.Helper()
	dir, err := os.MkdirTemp("/tmp", "irc")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	return &Store{BaseDir: dir}
}

func TestSocketPingPong(t *testing.T) {
	store := newSocketTestStore(t)
	name := "tp"

	// Create sockets dir
	os.MkdirAll(store.SocketsDir(), 0755)

	// Start daemon in background goroutine
	done := make(chan error, 1)
	go func() {
		done <- store.RunDaemon(name, 0) // sessionPID=0 disables monitoring
	}()

	// Wait for socket to be ready
	socketPath := store.SocketPath(name)
	var conn net.Conn
	var err error
	for i := 0; i < 20; i++ {
		conn, err = net.DialTimeout("unix", socketPath, 100*time.Millisecond)
		if err == nil {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("failed to connect to daemon socket: %v", err)
	}
	defer conn.Close()

	// Send ping
	req := SocketRequest{Type: "ping"}
	data, _ := json.Marshal(req)
	data = append(data, '\n')
	conn.Write(data)

	// Read pong
	conn.SetDeadline(time.Now().Add(2 * time.Second))
	scanner := bufio.NewScanner(conn)
	if !scanner.Scan() {
		t.Fatal("no response from daemon")
	}

	var resp SocketResponse
	if err := json.Unmarshal(scanner.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Type != "pong" {
		t.Errorf("expected 'pong', got '%s'", resp.Type)
	}
	if resp.Name != name {
		t.Errorf("expected name '%s', got '%s'", name, resp.Name)
	}

	// Clean shutdown
	os.Remove(socketPath)
}

func TestCheckPresence(t *testing.T) {
	store := newSocketTestStore(t)
	name := "op"

	os.MkdirAll(store.SocketsDir(), 0755)

	daemonErr := make(chan error, 1)
	go func() {
		daemonErr <- store.RunDaemon(name, 0)
	}()

	// Wait for socket to be connectable
	socketPath := store.SocketPath(name)
	var online bool
	for i := 0; i < 40; i++ {
		select {
		case err := <-daemonErr:
			t.Fatalf("daemon exited early: %v", err)
		default:
		}
		conn, err := net.DialTimeout("unix", socketPath, 100*time.Millisecond)
		if err == nil {
			conn.Close()
			online = true
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if !online {
		t.Fatal("daemon socket never became connectable")
	}

	if !store.CheckPresence(name) {
		t.Error("peer should be online")
	}

	if store.CheckPresence("nonexistent") {
		t.Error("nonexistent peer should be offline")
	}

	// Clean up
	os.Remove(socketPath)
}

func TestDaemonPIDFile(t *testing.T) {
	store := newTestStore(t)
	name := "pidtest"

	os.MkdirAll(store.SocketsDir(), 0755)

	// Write a PID file
	pidPath := store.PIDPath(name)
	os.WriteFile(pidPath, []byte(strconv.Itoa(os.Getpid())), 0644)

	// Verify it exists
	data, err := os.ReadFile(pidPath)
	if err != nil {
		t.Fatalf("failed to read PID file: %v", err)
	}

	pid, err := strconv.Atoi(string(data))
	if err != nil {
		t.Fatalf("failed to parse PID: %v", err)
	}
	if pid != os.Getpid() {
		t.Errorf("expected PID %d, got %d", os.Getpid(), pid)
	}
}

func TestStaleCleanup(t *testing.T) {
	store := newTestStore(t)
	name := "stalepeer"

	os.MkdirAll(store.SocketsDir(), 0755)

	// Write a PID file with a dead PID
	pidPath := store.PIDPath(name)
	os.WriteFile(pidPath, []byte("999999"), 0644) // Likely dead PID

	// Create a stale socket file
	socketPath := store.SocketPath(name)
	os.WriteFile(socketPath, []byte{}, 0644)

	// Register the peer
	store.Register(name, 999999)

	// tryCleanStalePeer should clean up
	store.tryCleanStalePeer(name)

	// Verify cleanup
	if _, err := os.Stat(pidPath); !os.IsNotExist(err) {
		t.Error("PID file should be removed")
	}
	if _, err := os.Stat(socketPath); !os.IsNotExist(err) {
		t.Error("socket file should be removed")
	}

	// Peer should be unregistered
	peers, _ := store.ListPeers()
	if _, ok := peers[name]; ok {
		t.Error("stale peer should be unregistered")
	}
}

func TestIsProcessAlive(t *testing.T) {
	// Our own process should be alive
	if !isProcessAlive(os.Getpid()) {
		t.Error("current process should be alive")
	}

	// A very high PID is almost certainly dead
	if isProcessAlive(4000000) {
		t.Error("PID 4000000 should not be alive")
	}
}

func TestKillDaemonNoFile(t *testing.T) {
	store := newTestStore(t)
	os.MkdirAll(store.SocketsDir(), 0755)

	// Should not error when no PID file exists
	if err := store.KillDaemon("nonexistent"); err != nil {
		t.Errorf("KillDaemon should not error for missing PID: %v", err)
	}
}

func TestKillDaemonRemovesFiles(t *testing.T) {
	store := newTestStore(t)
	os.MkdirAll(store.SocketsDir(), 0755)

	name := "tobecleaned"
	// Write a PID file with our own PID (won't actually kill ourselves)
	pidPath := store.PIDPath(name)
	os.WriteFile(pidPath, []byte("999999"), 0644) // dead PID

	// Create a socket file
	socketPath := store.SocketPath(name)
	os.WriteFile(socketPath, []byte{}, 0644)

	store.KillDaemon(name)

	// Files should be cleaned up
	if _, err := os.Stat(pidPath); !os.IsNotExist(err) {
		t.Error("PID file should be removed after KillDaemon")
	}
	if _, err := os.Stat(socketPath); !os.IsNotExist(err) {
		t.Error("socket file should be removed after KillDaemon")
	}
}

