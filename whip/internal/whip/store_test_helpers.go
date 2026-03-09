package whip

import (
	"os"
	"path/filepath"
	"testing"
)

func tempStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	s := &Store{BaseDir: dir}
	os.MkdirAll(filepath.Join(dir, tasksDir), 0755)
	return s
}
