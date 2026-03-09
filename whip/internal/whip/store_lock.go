package whip

import (
	"encoding/json"
	"os"
	"path/filepath"
	"syscall"
)

func atomicWriteFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".tmp.*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := func() {
		tmp.Close()
		os.Remove(tmpPath)
	}

	if _, err := tmp.Write(data); err != nil {
		cleanup()
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		cleanup()
		return err
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return nil
}

func withFileLock(path string, fn func() error) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		return err
	}
	defer syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
	return fn()
}

func cloneTask(task *Task) (*Task, error) {
	data, err := json.Marshal(task)
	if err != nil {
		return nil, err
	}
	var cloned Task
	if err := json.Unmarshal(data, &cloned); err != nil {
		return nil, err
	}
	return &cloned, nil
}

func cloneConfig(cfg *Config) (*Config, error) {
	data, err := json.Marshal(cfg)
	if err != nil {
		return nil, err
	}
	var cloned Config
	if err := json.Unmarshal(data, &cloned); err != nil {
		return nil, err
	}
	return &cloned, nil
}

func (s *Store) taskDir(id string) string {
	return filepath.Join(s.BaseDir, tasksDir, id)
}

func (s *Store) taskLockPath(id string) string {
	return filepath.Join(s.taskDir(id), taskLockFile)
}

func (s *Store) withTaskLock(id string, fn func() error) error {
	return withFileLock(s.taskLockPath(id), fn)
}

func (s *Store) withConfigLock(fn func() error) error {
	return withFileLock(filepath.Join(s.BaseDir, configLock), fn)
}

func (s *Store) taskPath(id string) string {
	return filepath.Join(s.taskDir(id), taskFile)
}

func (s *Store) promptPath(id string) string {
	return filepath.Join(s.taskDir(id), promptFile)
}
