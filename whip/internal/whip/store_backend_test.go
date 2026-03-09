package whip

import (
	"path/filepath"
	"testing"
)

func TestBackendPersistence(t *testing.T) {
	s := tempStore(t)
	task := NewTask("Backend Test", "desc", "/tmp")
	task.Backend = "claude"
	s.SaveTask(task)

	loaded, err := s.LoadTask(task.ID)
	if err != nil {
		t.Fatalf("LoadTask: %v", err)
	}
	if loaded.Backend != "claude" {
		t.Errorf("Backend = %q, want %q", loaded.Backend, "claude")
	}
}

func TestBackendEmptyDefault(t *testing.T) {
	s := tempStore(t)
	task := NewTask("No Backend", "desc", "/tmp")
	s.SaveTask(task)

	loaded, err := s.LoadTask(task.ID)
	if err != nil {
		t.Fatalf("LoadTask: %v", err)
	}
	if loaded.Backend != "" {
		t.Errorf("Backend = %q, want empty", loaded.Backend)
	}

	b, err := GetBackend(loaded.Backend)
	if err != nil {
		t.Fatalf("GetBackend: %v", err)
	}
	if b.Name() != "claude" {
		t.Errorf("default backend = %q, want %q", b.Name(), "claude")
	}
}

func TestConfig(t *testing.T) {
	s := tempStore(t)

	cfg, err := s.LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.MasterIRCName != "" {
		t.Errorf("default MasterIRCName = %q, want empty", cfg.MasterIRCName)
	}

	cfg.MasterIRCName = "whip-master"
	if err := s.SaveConfig(cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	cfg2, err := s.LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig after save: %v", err)
	}
	if cfg2.MasterIRCName != "whip-master" {
		t.Errorf("MasterIRCName = %q, want %q", cfg2.MasterIRCName, "whip-master")
	}
}

func TestResolveWhipBaseDir_UsesEnvOverride(t *testing.T) {
	override := filepath.Join(t.TempDir(), "custom-whip-home")
	t.Setenv("WHIP_HOME", override)

	got, err := ResolveWhipBaseDir()
	if err != nil {
		t.Fatalf("ResolveWhipBaseDir: %v", err)
	}
	if got != override {
		t.Fatalf("ResolveWhipBaseDir = %q, want %q", got, override)
	}
}
