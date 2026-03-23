package irclib

import "testing"

func TestFindSessionPID_FullPathComm(t *testing.T) {
	// Simulate macOS where ps -o comm= returns full binary path.
	tree := map[int]struct{ comm string; parent int }{
		100: {"zsh", 200},
		200: {"zsh", 300},
		300: {"/Users/user/.local/bin/claude", 1},
	}

	origComm, origParent := commFunc, parentFunc
	defer func() { commFunc, parentFunc = origComm, origParent }()

	commFunc = func(pid int) string {
		if info, ok := tree[pid]; ok {
			return info.comm
		}
		return ""
	}
	parentFunc = func(pid int) int {
		if info, ok := tree[pid]; ok {
			return info.parent
		}
		return 0
	}

	got := FindSessionPID(100)
	if got != 300 {
		t.Errorf("FindSessionPID(100) = %d, want 300 (claude PID)", got)
	}
}

func TestFindSessionPID_BareComm(t *testing.T) {
	// Linux-style where ps -o comm= returns bare name.
	tree := map[int]struct{ comm string; parent int }{
		10: {"bash", 20},
		20: {"claude", 1},
	}

	origComm, origParent := commFunc, parentFunc
	defer func() { commFunc, parentFunc = origComm, origParent }()

	commFunc = func(pid int) string {
		if info, ok := tree[pid]; ok {
			return info.comm
		}
		return ""
	}
	parentFunc = func(pid int) int {
		if info, ok := tree[pid]; ok {
			return info.parent
		}
		return 0
	}

	got := FindSessionPID(10)
	if got != 20 {
		t.Errorf("FindSessionPID(10) = %d, want 20 (claude PID)", got)
	}
}

func TestFindSessionPID_CodexSession(t *testing.T) {
	tree := map[int]struct{ comm string; parent int }{
		10: {"bash", 20},
		20: {"/usr/local/bin/codex", 1},
	}

	origComm, origParent := commFunc, parentFunc
	defer func() { commFunc, parentFunc = origComm, origParent }()

	commFunc = func(pid int) string {
		if info, ok := tree[pid]; ok {
			return info.comm
		}
		return ""
	}
	parentFunc = func(pid int) int {
		if info, ok := tree[pid]; ok {
			return info.parent
		}
		return 0
	}

	got := FindSessionPID(10)
	if got != 20 {
		t.Errorf("FindSessionPID(10) = %d, want 20 (codex PID)", got)
	}
}

func TestFindSessionPID_NoSessionBinary(t *testing.T) {
	tree := map[int]struct{ comm string; parent int }{
		10: {"bash", 20},
		20: {"tmux", 1},
	}

	origComm, origParent := commFunc, parentFunc
	defer func() { commFunc, parentFunc = origComm, origParent }()

	commFunc = func(pid int) string {
		if info, ok := tree[pid]; ok {
			return info.comm
		}
		return ""
	}
	parentFunc = func(pid int) int {
		if info, ok := tree[pid]; ok {
			return info.parent
		}
		return 0
	}

	got := FindSessionPID(10)
	if got != 10 {
		t.Errorf("FindSessionPID(10) = %d, want 10 (fallback to startPID)", got)
	}
}
