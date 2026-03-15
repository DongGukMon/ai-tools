package agentbus

import (
	"errors"
	"net"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRegisterAndList(t *testing.T) {
	store := newTestStore(t)

	if err := store.Register("server", 1234); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	peers, err := store.ListPeers()
	if err != nil {
		t.Fatalf("ListPeers failed: %v", err)
	}

	if len(peers) != 1 {
		t.Fatalf("expected 1 peer, got %d", len(peers))
	}

	info, ok := peers["server"]
	if !ok {
		t.Fatal("peer 'server' not found")
	}
	if info.PID != 1234 {
		t.Errorf("expected PID 1234, got %d", info.PID)
	}
	if info.Name != "server" {
		t.Errorf("expected name 'server', got '%s'", info.Name)
	}
}

func TestRegisterDuplicateStaleReplacement(t *testing.T) {
	store := newTestStore(t)

	if err := store.Register("server", 1234); err != nil {
		t.Fatalf("first Register failed: %v", err)
	}

	// Without a running daemon, re-registration should succeed (stale peer replacement)
	if err := store.Register("server", 5678); err != nil {
		t.Fatalf("expected stale re-registration to succeed, got: %v", err)
	}

	// Verify the new PID is stored
	peers, _ := store.ListPeers()
	if peers["server"].PID != 5678 {
		t.Errorf("expected PID 5678 after re-registration, got %d", peers["server"].PID)
	}
}

func TestUnregister(t *testing.T) {
	store := newTestStore(t)

	store.Register("server", 1234)
	store.Register("client", 5678)

	if err := store.Unregister("server"); err != nil {
		t.Fatalf("Unregister failed: %v", err)
	}

	peers, _ := store.ListPeers()
	if len(peers) != 1 {
		t.Fatalf("expected 1 peer after unregister, got %d", len(peers))
	}
	if _, ok := peers["client"]; !ok {
		t.Error("'client' should still be registered")
	}
}

func TestSetDaemonPID(t *testing.T) {
	store := newTestStore(t)

	store.Register("server", 1234)
	if err := store.SetDaemonPID("server", 9999); err != nil {
		t.Fatalf("SetDaemonPID failed: %v", err)
	}

	peers, _ := store.ListPeers()
	if peers["server"].DaemonPID != 9999 {
		t.Errorf("expected daemon PID 9999, got %d", peers["server"].DaemonPID)
	}
}

func TestRegisterSameNameSamePID_AlreadyJoined(t *testing.T) {
	store := newSocketTestStore(t)
	name := "aj"

	os.MkdirAll(store.SocketsDir(), 0755)

	// Register the peer
	if err := store.Register(name, 1234); err != nil {
		t.Fatalf("first Register failed: %v", err)
	}

	// Start daemon so CheckPresence returns true
	daemonErr := make(chan error, 1)
	go func() {
		daemonErr <- store.RunDaemon(name, 0)
	}()

	// Wait for daemon socket to be ready
	socketPath := store.SocketPath(name)
	for i := 0; i < 40; i++ {
		conn, err := net.DialTimeout("unix", socketPath, 100*time.Millisecond)
		if err == nil {
			conn.Close()
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	defer os.Remove(socketPath)

	// Same name + same PID → ErrAlreadyJoined
	err := store.Register(name, 1234)
	if !errors.Is(err, ErrAlreadyJoined) {
		t.Errorf("expected ErrAlreadyJoined, got: %v", err)
	}
}

func TestRegisterSameNameDifferentPID_Error(t *testing.T) {
	store := newSocketTestStore(t)
	name := "dp"

	os.MkdirAll(store.SocketsDir(), 0755)

	// Register with PID 1234
	if err := store.Register(name, 1234); err != nil {
		t.Fatalf("first Register failed: %v", err)
	}

	// Start daemon so CheckPresence returns true
	daemonErr := make(chan error, 1)
	go func() {
		daemonErr <- store.RunDaemon(name, 0)
	}()

	socketPath := store.SocketPath(name)
	for i := 0; i < 40; i++ {
		conn, err := net.DialTimeout("unix", socketPath, 100*time.Millisecond)
		if err == nil {
			conn.Close()
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	defer os.Remove(socketPath)

	// Same name + different PID → original error
	err := store.Register(name, 5678)
	if err == nil {
		t.Fatal("expected error for different PID re-registration")
	}
	if errors.Is(err, ErrAlreadyJoined) {
		t.Error("should not be ErrAlreadyJoined for different PID")
	}
	if !strings.Contains(err.Error(), "already exists") {
		t.Errorf("expected 'already exists' error, got: %v", err)
	}
}

func TestConcurrentRegistration(t *testing.T) {
	store := newTestStore(t)

	var wg sync.WaitGroup
	errs := make(chan error, 10)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			name := "peer" + string(rune('a'+n))
			if err := store.Register(name, 1000+n); err != nil {
				errs <- err
			}
		}(i)
	}

	wg.Wait()
	close(errs)

	for err := range errs {
		t.Errorf("concurrent registration error: %v", err)
	}

	peers, err := store.ListPeers()
	if err != nil {
		t.Fatalf("ListPeers failed: %v", err)
	}
	if len(peers) != 10 {
		t.Errorf("expected 10 peers, got %d", len(peers))
	}
}
