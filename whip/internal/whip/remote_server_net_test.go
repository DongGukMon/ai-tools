package whip

import (
	"errors"
	"syscall"
	"testing"
	"time"
)

func TestKillPortHolderSkipsCurrentProcess(t *testing.T) {
	origList := listPortHolderPIDs
	origSignal := signalPortHolderPID
	origCurrent := currentPortHolderPID
	origWait := waitAfterPortHolderKill
	t.Cleanup(func() {
		listPortHolderPIDs = origList
		signalPortHolderPID = origSignal
		currentPortHolderPID = origCurrent
		waitAfterPortHolderKill = origWait
	})

	selfPID := 101
	listPortHolderPIDs = func(port int) ([]int, error) {
		return []int{selfPID, 202}, nil
	}
	currentPortHolderPID = func() int { return selfPID }
	waitAfterPortHolderKill = func(time.Duration) {}

	var signaled []int
	signalPortHolderPID = func(pid int, sig syscall.Signal) error {
		signaled = append(signaled, pid)
		if sig != syscall.SIGTERM {
			t.Fatalf("expected SIGTERM, got %v", sig)
		}
		return nil
	}

	if err := killPortHolder(8585); err != nil {
		t.Fatalf("killPortHolder: %v", err)
	}
	if len(signaled) != 1 || signaled[0] != 202 {
		t.Fatalf("expected only external pid to be signaled, got %v", signaled)
	}
}

func TestKillPortHolderReturnsSelfOwnedError(t *testing.T) {
	origList := listPortHolderPIDs
	origSignal := signalPortHolderPID
	origCurrent := currentPortHolderPID
	t.Cleanup(func() {
		listPortHolderPIDs = origList
		signalPortHolderPID = origSignal
		currentPortHolderPID = origCurrent
	})

	selfPID := 303
	listPortHolderPIDs = func(port int) ([]int, error) {
		return []int{selfPID}, nil
	}
	currentPortHolderPID = func() int { return selfPID }

	signalCalled := false
	signalPortHolderPID = func(pid int, sig syscall.Signal) error {
		signalCalled = true
		return nil
	}

	err := killPortHolder(8585)
	if !errors.Is(err, errPortHeldByCurrentProcess) {
		t.Fatalf("expected self-owned port error, got %v", err)
	}
	if signalCalled {
		t.Fatal("expected current process to be skipped")
	}
}
