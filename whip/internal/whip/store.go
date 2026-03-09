package whip

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
)

const (
	whipDir      = ".whip"
	configFile   = "config.json"
	configLock   = "config.lock"
	tasksDir     = "tasks"
	taskFile     = "task.json"
	taskLockFile = "task.lock"
	promptFile   = "prompt.txt"
)

type Config struct {
	MasterIRCName string `json:"master_irc_name"`
	Tunnel        string `json:"tunnel,omitempty"`
	RemotePort    int    `json:"remote_port,omitempty"`
	ServeToken    string `json:"serve_token,omitempty"`
}

type Store struct {
	BaseDir string
}

func NewStore() (*Store, error) {
	baseDir, err := ResolveWhipBaseDir()
	if err != nil {
		return nil, fmt.Errorf("cannot determine home directory: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(baseDir, tasksDir), 0755); err != nil {
		return nil, fmt.Errorf("cannot create whip directory: %w", err)
	}
	return &Store{BaseDir: baseDir}, nil
}

func ResolveWhipBaseDir() (string, error) {
	if override := strings.TrimSpace(os.Getenv("WHIP_HOME")); override != "" {
		return override, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, whipDir), nil
}

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

// Config

func (s *Store) LoadConfig() (*Config, error) {
	path := filepath.Join(s.BaseDir, configFile)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &Config{}, nil
		}
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (s *Store) SaveConfig(cfg *Config) error {
	return s.withConfigLock(func() error {
		data, err := json.MarshalIndent(cfg, "", "  ")
		if err != nil {
			return err
		}
		return atomicWriteFile(filepath.Join(s.BaseDir, configFile), data, 0644)
	})
}

func (s *Store) UpdateConfig(fn func(*Config) error) (*Config, error) {
	var updated *Config
	err := s.withConfigLock(func() error {
		cfg, err := s.LoadConfig()
		if err != nil {
			return err
		}
		if err := fn(cfg); err != nil {
			return err
		}
		data, err := json.MarshalIndent(cfg, "", "  ")
		if err != nil {
			return err
		}
		if err := atomicWriteFile(filepath.Join(s.BaseDir, configFile), data, 0644); err != nil {
			return err
		}
		updated, err = cloneConfig(cfg)
		return err
	})
	return updated, err
}

// Task CRUD

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

func (s *Store) SaveTask(task *Task) error {
	return s.withTaskLock(task.ID, func() error {
		return s.saveTaskUnlocked(task)
	})
}

func (s *Store) saveTaskUnlocked(task *Task) error {
	dir := s.taskDir(task.ID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		return err
	}
	return atomicWriteFile(s.taskPath(task.ID), data, 0644)
}

func (s *Store) LoadTask(id string) (*Task, error) {
	return s.loadTaskUnlocked(id)
}

func (s *Store) loadTaskUnlocked(id string) (*Task, error) {
	data, err := os.ReadFile(s.taskPath(id))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("task %s not found", id)
		}
		return nil, err
	}
	var task Task
	if err := json.Unmarshal(data, &task); err != nil {
		return nil, fmt.Errorf("corrupt task %s: %w", id, err)
	}
	return &task, nil
}

func (s *Store) UpdateTask(id string, fn func(*Task) error) (*Task, error) {
	var updated *Task
	err := s.withTaskLock(id, func() error {
		task, err := s.loadTaskUnlocked(id)
		if err != nil {
			return err
		}
		if err := fn(task); err != nil {
			return err
		}
		if err := s.saveTaskUnlocked(task); err != nil {
			return err
		}
		updated, err = cloneTask(task)
		return err
	})
	return updated, err
}

func (s *Store) ListTasks() ([]*Task, error) {
	dir := filepath.Join(s.BaseDir, tasksDir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var tasks []*Task
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		task, err := s.LoadTask(e.Name())
		if err != nil {
			continue
		}
		tasks = append(tasks, task)
	}

	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].CreatedAt.Before(tasks[j].CreatedAt)
	})
	return tasks, nil
}

func (s *Store) DeleteTask(id string) error {
	return os.RemoveAll(s.taskDir(id))
}

func (s *Store) SavePrompt(id, content string) error {
	return s.withTaskLock(id, func() error {
		return atomicWriteFile(s.promptPath(id), []byte(content), 0644)
	})
}

func (s *Store) PromptPath(id string) string {
	return s.promptPath(id)
}

// ResolveID finds a task by exact or prefix match.
func (s *Store) ResolveID(idPrefix string) (string, error) {
	dir := filepath.Join(s.BaseDir, tasksDir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", fmt.Errorf("no tasks found")
	}

	var matches []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if e.Name() == idPrefix {
			return idPrefix, nil // exact match
		}
		if strings.HasPrefix(e.Name(), idPrefix) {
			matches = append(matches, e.Name())
		}
	}

	switch len(matches) {
	case 0:
		return "", fmt.Errorf("task %s not found", idPrefix)
	case 1:
		return matches[0], nil
	default:
		return "", fmt.Errorf("ambiguous id prefix %s: matches %s", idPrefix, strings.Join(matches, ", "))
	}
}

// GetDependents returns tasks that depend on the given task ID.
func (s *Store) GetDependents(id string) ([]*Task, error) {
	tasks, err := s.ListTasks()
	if err != nil {
		return nil, err
	}
	var deps []*Task
	for _, t := range tasks {
		for _, dep := range t.DependsOn {
			if dep == id {
				deps = append(deps, t)
				break
			}
		}
	}
	return deps, nil
}

// AreDependenciesMet checks if all dependencies of a task are completed.
func (s *Store) AreDependenciesMet(task *Task) (bool, []string, error) {
	var unmet []string
	for _, depID := range task.DependsOn {
		dep, err := s.LoadTask(depID)
		if err != nil {
			return false, nil, fmt.Errorf("dependency %s not found: %w", depID, err)
		}
		if dep.Status != StatusCompleted {
			unmet = append(unmet, depID)
		}
	}
	return len(unmet) == 0, unmet, nil
}

// CleanTerminal removes all completed/failed tasks.
func (s *Store) CleanTerminal() (int, error) {
	tasks, err := s.ListTasks()
	if err != nil {
		return 0, err
	}
	count := 0
	for _, t := range tasks {
		if t.Status.IsTerminal() {
			if err := s.DeleteTask(t.ID); err != nil {
				return count, err
			}
			count++
		}
	}
	return count, nil
}
