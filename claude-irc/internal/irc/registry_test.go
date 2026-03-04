package irc

import (
	"sync"
	"testing"
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

func TestRegisterDuplicate(t *testing.T) {
	store := newTestStore(t)

	if err := store.Register("server", 1234); err != nil {
		t.Fatalf("first Register failed: %v", err)
	}

	err := store.Register("server", 5678)
	if err == nil {
		t.Fatal("expected error for duplicate registration")
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
