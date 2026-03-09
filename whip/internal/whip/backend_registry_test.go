package whip

import (
	"strings"
	"testing"
)

func TestGetBackend_Default(t *testing.T) {
	b, err := GetBackend("")
	if err != nil {
		t.Fatalf("GetBackend empty: %v", err)
	}
	if b.Name() != "claude" {
		t.Errorf("Name = %q, want %q", b.Name(), "claude")
	}
}

func TestGetBackend_Claude(t *testing.T) {
	b, err := GetBackend("claude")
	if err != nil {
		t.Fatalf("GetBackend claude: %v", err)
	}
	if b.Name() != "claude" {
		t.Errorf("Name = %q, want %q", b.Name(), "claude")
	}
}

func TestGetBackend_Codex(t *testing.T) {
	b, err := GetBackend("codex")
	if err != nil {
		t.Fatalf("GetBackend codex: %v", err)
	}
	if b.Name() != "codex" {
		t.Errorf("Name = %q, want %q", b.Name(), "codex")
	}
}

func TestGetBackend_Unknown(t *testing.T) {
	_, err := GetBackend("bogus")
	if err == nil {
		t.Error("GetBackend should fail for unknown backend")
	}
	if !strings.Contains(err.Error(), "unknown backend") {
		t.Errorf("error = %q, want 'unknown backend'", err.Error())
	}
}

func TestSpawn_UsesTaskBackend(t *testing.T) {
	task := NewTask("Test", "desc", "/tmp")
	task.Backend = "claude"

	b, err := GetBackend(task.Backend)
	if err != nil {
		t.Fatalf("GetBackend: %v", err)
	}
	if b.Name() != "claude" {
		t.Errorf("backend name = %q, want %q", b.Name(), "claude")
	}

	task.Backend = ""
	b, err = GetBackend(task.Backend)
	if err != nil {
		t.Fatalf("GetBackend empty: %v", err)
	}
	if b.Name() != "claude" {
		t.Errorf("default backend name = %q, want %q", b.Name(), "claude")
	}
}

func TestDefaultBackendName(t *testing.T) {
	if DefaultBackendName != "claude" {
		t.Errorf("DefaultBackendName = %q, want %q", DefaultBackendName, "claude")
	}
}
