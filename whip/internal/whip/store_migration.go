package whip

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const currentSchemaVersion = 1

func (s *Store) runMigrations() error {
	meta, err := s.loadStoreMetadata()
	if err != nil {
		return err
	}
	if meta.SchemaVersion > currentSchemaVersion {
		return fmt.Errorf("unsupported store schema version %d (current %d)", meta.SchemaVersion, currentSchemaVersion)
	}

	for meta.SchemaVersion < currentSchemaVersion {
		switch meta.SchemaVersion {
		case 0:
			if err := s.migrateV0ToV1(); err != nil {
				return fmt.Errorf("migrate schema 0->1: %w", err)
			}
			meta.SchemaVersion = 1
		default:
			return fmt.Errorf("no migration path for schema version %d", meta.SchemaVersion)
		}

		if err := s.saveStoreMetadata(meta); err != nil {
			return err
		}
	}

	return nil
}

func (s *Store) migrateV0ToV1() error {
	tasks, err := s.ListTasks()
	if err != nil {
		return err
	}
	for _, task := range tasks {
		if task.Type != "" {
			continue
		}
		task.Type = InferTaskType(task.Title, task.Description)
		if err := s.SaveTask(task); err != nil {
			return fmt.Errorf("save task %s: %w", task.ID, err)
		}
	}

	archivedTasks, err := s.ListArchivedTasks()
	if err != nil {
		return err
	}
	for _, task := range archivedTasks {
		if task.Type != "" {
			continue
		}
		task.Type = InferTaskType(task.Title, task.Description)
		if err := s.saveArchivedTask(task); err != nil {
			return fmt.Errorf("save archived task %s: %w", task.ID, err)
		}
	}

	return nil
}

func (s *Store) loadStoreMetadata() (*storeMetadata, error) {
	path := filepath.Join(s.BaseDir, storeMetaFile)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var meta storeMetadata
	if err := json.Unmarshal(data, &meta); err != nil {
		return nil, fmt.Errorf("parse %s: %w", storeMetaFile, err)
	}
	return &meta, nil
}

func (s *Store) saveStoreMetadata(meta *storeMetadata) error {
	if meta == nil {
		return fmt.Errorf("store metadata is nil")
	}

	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return atomicWriteFile(filepath.Join(s.BaseDir, storeMetaFile), data, privateFilePerm)
}

func (s *Store) saveArchivedTask(task *Task) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	task.Workspace = NormalizeWorkspaceName(task.Workspace)
	if !task.Status.IsValid() {
		return fmt.Errorf("invalid task status %q", task.Status)
	}

	dir := s.archiveTaskDir(task.ID)
	if err := ensurePrivateDir(dir); err != nil {
		return err
	}

	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		return err
	}
	return atomicWriteFile(filepath.Join(dir, taskFile), data, privateFilePerm)
}
