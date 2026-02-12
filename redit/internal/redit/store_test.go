package redit

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	return &Store{baseDir: dir}
}

func TestInitAndRead(t *testing.T) {
	s := newTestStore(t)

	content := "hello world"
	path, err := s.Init("test:1", strings.NewReader(content))
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	if !filepath.IsAbs(path) {
		t.Errorf("expected absolute path, got %s", path)
	}

	data, err := s.Read("test:1")
	if err != nil {
		t.Fatalf("Read failed: %v", err)
	}
	if string(data) != content {
		t.Errorf("expected %q, got %q", content, string(data))
	}
}

func TestInitDuplicate(t *testing.T) {
	s := newTestStore(t)

	_, err := s.Init("test:1", strings.NewReader("content"))
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	_, err = s.Init("test:1", strings.NewReader("content2"))
	if err == nil {
		t.Fatal("expected error on duplicate init")
	}
}

func TestGet(t *testing.T) {
	s := newTestStore(t)

	_, err := s.Get("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent key")
	}

	path, _ := s.Init("test:1", strings.NewReader("content"))
	got, err := s.Get("test:1")
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if got != path {
		t.Errorf("expected %s, got %s", path, got)
	}
}

func TestStatusClean(t *testing.T) {
	s := newTestStore(t)

	s.Init("test:1", strings.NewReader("content"))

	status, err := s.Status("test:1")
	if err != nil {
		t.Fatalf("Status failed: %v", err)
	}
	if status != "clean" {
		t.Errorf("expected clean, got %s", status)
	}
}

func TestStatusDirty(t *testing.T) {
	s := newTestStore(t)

	path, _ := s.Init("test:1", strings.NewReader("original"))

	os.WriteFile(path, []byte("modified"), 0644)

	status, err := s.Status("test:1")
	if err != nil {
		t.Fatalf("Status failed: %v", err)
	}
	if status != "dirty" {
		t.Errorf("expected dirty, got %s", status)
	}
}

func TestReset(t *testing.T) {
	s := newTestStore(t)

	path, _ := s.Init("test:1", strings.NewReader("original"))
	os.WriteFile(path, []byte("modified"), 0644)

	err := s.Reset("test:1")
	if err != nil {
		t.Fatalf("Reset failed: %v", err)
	}

	data, _ := s.Read("test:1")
	if string(data) != "original" {
		t.Errorf("expected original, got %s", string(data))
	}

	status, _ := s.Status("test:1")
	if status != "clean" {
		t.Errorf("expected clean after reset, got %s", status)
	}
}

func TestDrop(t *testing.T) {
	s := newTestStore(t)

	s.Init("test:1", strings.NewReader("content"))

	err := s.Drop("test:1")
	if err != nil {
		t.Fatalf("Drop failed: %v", err)
	}

	_, err = s.Get("test:1")
	if err == nil {
		t.Fatal("expected error after drop")
	}
}

func TestDropNonexistent(t *testing.T) {
	s := newTestStore(t)

	err := s.Drop("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent key")
	}
}

func TestList(t *testing.T) {
	s := newTestStore(t)

	items, err := s.List()
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected empty list, got %d items", len(items))
	}

	s.Init("test:1", strings.NewReader("content1"))
	s.Init("test:2", strings.NewReader("content2"))

	items, err = s.List()
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(items) != 2 {
		t.Errorf("expected 2 items, got %d", len(items))
	}
}

func TestDiff(t *testing.T) {
	s := newTestStore(t)

	path, _ := s.Init("test:1", strings.NewReader("line1\nline2\n"))

	// No changes
	diff, err := s.Diff("test:1")
	if err != nil {
		t.Fatalf("Diff failed: %v", err)
	}
	if diff != "" {
		t.Errorf("expected empty diff, got %s", diff)
	}

	// With changes
	os.WriteFile(path, []byte("line1\nline2 modified\n"), 0644)

	diff, err = s.Diff("test:1")
	if err != nil {
		t.Fatalf("Diff failed: %v", err)
	}
	if diff == "" {
		t.Error("expected non-empty diff")
	}
}

func TestDiffNonexistent(t *testing.T) {
	s := newTestStore(t)

	_, err := s.Diff("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent key")
	}
}
