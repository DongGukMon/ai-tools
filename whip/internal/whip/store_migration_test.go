package whip

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNewStore_MigratesSchemaV0TaskTypes(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	baseDir, err := canonicalizeStorePath(filepath.Join(tmpHome, whipDir))
	if err != nil {
		t.Fatalf("canonicalizeStorePath: %v", err)
	}
	prepareLegacyStoreFixture(t, baseDir, 0)

	active := NewTask("Fix worker panic", "", "/tmp")
	active.Type = ""
	writeTaskFixture(t, filepath.Join(baseDir, tasksDir, active.ID, taskFile), active)

	preserved := NewTask("Custom docs work", "", "/tmp")
	preserved.Type = TaskTypeDocs
	writeTaskFixture(t, filepath.Join(baseDir, tasksDir, preserved.ID, taskFile), preserved)

	archived := NewTask("React component polish", "", "/tmp")
	archived.Type = ""
	archived.Status = StatusCompleted
	writeTaskFixture(t, filepath.Join(baseDir, archiveDir, archived.ID, taskFile), archived)

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	loadedActive, err := store.LoadTask(active.ID)
	if err != nil {
		t.Fatalf("LoadTask active: %v", err)
	}
	if loadedActive.Type != TaskTypeDebugging {
		t.Fatalf("active Type = %q, want %q", loadedActive.Type, TaskTypeDebugging)
	}

	loadedPreserved, err := store.LoadTask(preserved.ID)
	if err != nil {
		t.Fatalf("LoadTask preserved: %v", err)
	}
	if loadedPreserved.Type != TaskTypeDocs {
		t.Fatalf("preserved Type = %q, want %q", loadedPreserved.Type, TaskTypeDocs)
	}

	loadedArchived, err := store.LoadArchivedTask(archived.ID)
	if err != nil {
		t.Fatalf("LoadArchivedTask archived: %v", err)
	}
	if loadedArchived.Type != TaskTypeFrontend {
		t.Fatalf("archived Type = %q, want %q", loadedArchived.Type, TaskTypeFrontend)
	}

	meta := readStoreMetadataFixture(t, filepath.Join(baseDir, storeMetaFile))
	if meta.SchemaVersion != currentSchemaVersion {
		t.Fatalf("SchemaVersion = %d, want %d", meta.SchemaVersion, currentSchemaVersion)
	}

	if err := store.runMigrations(); err != nil {
		t.Fatalf("runMigrations second pass: %v", err)
	}

	loadedActive, err = store.LoadTask(active.ID)
	if err != nil {
		t.Fatalf("LoadTask active after rerun: %v", err)
	}
	if loadedActive.Type != TaskTypeDebugging {
		t.Fatalf("active Type after rerun = %q, want %q", loadedActive.Type, TaskTypeDebugging)
	}
}

func TestNewStore_SkipsSchemaV1Migration(t *testing.T) {
	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)

	baseDir, err := canonicalizeStorePath(filepath.Join(tmpHome, whipDir))
	if err != nil {
		t.Fatalf("canonicalizeStorePath: %v", err)
	}
	prepareLegacyStoreFixture(t, baseDir, currentSchemaVersion)

	task := NewTask("Fix worker panic", "", "/tmp")
	task.Type = ""
	writeTaskFixture(t, filepath.Join(baseDir, tasksDir, task.ID, taskFile), task)

	store, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}

	loaded, err := store.LoadTask(task.ID)
	if err != nil {
		t.Fatalf("LoadTask: %v", err)
	}
	if loaded.Type != "" {
		t.Fatalf("Type = %q, want empty when schema migration is skipped", loaded.Type)
	}
}

func prepareLegacyStoreFixture(t *testing.T, baseDir string, schemaVersion int) {
	t.Helper()

	if err := os.MkdirAll(filepath.Join(baseDir, tasksDir), privateDirPerm); err != nil {
		t.Fatalf("MkdirAll tasks: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(baseDir, archiveDir), privateDirPerm); err != nil {
		t.Fatalf("MkdirAll archive: %v", err)
	}

	meta := storeMetadata{
		StoreKind:     whipStoreKind,
		OwnerUID:      os.Geteuid(),
		CanonicalRoot: baseDir,
		CreatedAt:     time.Now().UTC(),
		InstallID:     "test-install",
		SchemaVersion: schemaVersion,
	}
	writeStoreMetadataFixture(t, filepath.Join(baseDir, storeMetaFile), meta)
}

func writeTaskFixture(t *testing.T, path string, task *Task) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), privateDirPerm); err != nil {
		t.Fatalf("MkdirAll task dir: %v", err)
	}
	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent task: %v", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(path, data, privateFilePerm); err != nil {
		t.Fatalf("WriteFile task: %v", err)
	}
}

func readStoreMetadataFixture(t *testing.T, path string) storeMetadata {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile store metadata: %v", err)
	}
	var meta storeMetadata
	if err := json.Unmarshal(data, &meta); err != nil {
		t.Fatalf("Unmarshal store metadata: %v", err)
	}
	return meta
}
