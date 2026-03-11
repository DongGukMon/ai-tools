package whip

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const messagesFile = "messages.json"

func (s *Store) SaveMessages(id string, msgs []ircMessage) error {
	dir := s.taskDir(id)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return err
	}
	data, err := json.MarshalIndent(msgs, "", "  ")
	if err != nil {
		return err
	}
	return atomicWriteFile(filepath.Join(dir, messagesFile), data, privateFilePerm)
}

func (s *Store) LoadMessages(id string) ([]ircMessage, error) {
	path := filepath.Join(s.taskDir(id), messagesFile)
	data, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			return nil, err
		}
		path = filepath.Join(s.archiveTaskDir(id), messagesFile)
		data, err = os.ReadFile(path)
		if err != nil {
			return nil, err
		}
	}
	var msgs []ircMessage
	if err := json.Unmarshal(data, &msgs); err != nil {
		return nil, err
	}
	return msgs, nil
}

func (s *Store) HasMessages(id string) bool {
	if _, err := os.Stat(filepath.Join(s.taskDir(id), messagesFile)); err == nil {
		return true
	}
	if _, err := os.Stat(filepath.Join(s.archiveTaskDir(id), messagesFile)); err == nil {
		return true
	}
	return false
}

func (s *Store) SaveTask(task *Task) error {
	task.Workspace = NormalizeWorkspaceName(task.Workspace)
	return s.withTaskLockInWorkspace(task.Workspace, task.ID, func() error {
		return s.saveTaskUnlocked(task)
	})
}

func (s *Store) saveTaskUnlocked(task *Task) error {
	task.Workspace = NormalizeWorkspaceName(task.Workspace)
	if !task.Status.IsValid() {
		return fmt.Errorf("invalid task status %q", task.Status)
	}
	dir := s.taskDirInWorkspace(task.Workspace, task.ID)
	if err := ensurePrivateDir(dir); err != nil {
		return err
	}
	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		return err
	}
	return atomicWriteFile(filepath.Join(dir, taskFile), data, privateFilePerm)
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
	task.Workspace = NormalizeWorkspaceName(task.Workspace)
	if !task.Status.IsValid() {
		return nil, fmt.Errorf("task %s has invalid status %q", id, task.Status)
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
	var tasks []*Task
	for _, workspace := range s.listWorkspaceNames() {
		dir := s.workspaceTasksDir(workspace)
		entries, err := os.ReadDir(dir)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
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
		return atomicWriteFile(s.promptPath(id), []byte(content), privateFilePerm)
	})
}

func (s *Store) PromptPath(id string) string {
	return s.promptPath(id)
}

// ResolveID finds a task by exact or prefix match.
func (s *Store) ResolveID(idPrefix string) (string, error) {
	var matches []string
	foundAny := false
	for _, workspace := range s.listWorkspaceNames() {
		dir := s.workspaceTasksDir(workspace)
		entries, err := os.ReadDir(dir)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return "", err
		}
		foundAny = true
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			if e.Name() == idPrefix {
				return idPrefix, nil
			}
			if strings.HasPrefix(e.Name(), idPrefix) {
				matches = append(matches, e.Name())
			}
		}
	}
	if !foundAny {
		return "", fmt.Errorf("no tasks found")
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

func (s *Store) listWorkspaceNames() []string {
	workspaces := []string{GlobalWorkspaceName}
	entries, err := os.ReadDir(filepath.Join(s.BaseDir, workspacesDir))
	if err != nil {
		return workspaces
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		workspaces = append(workspaces, NormalizeWorkspaceName(entry.Name()))
	}
	return workspaces
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

// FindWorkspaceLead returns the active lead task for a named workspace, or nil.
func (s *Store) FindWorkspaceLead(workspace string) (*Task, error) {
	workspace = NormalizeWorkspaceName(workspace)
	if workspace == GlobalWorkspaceName {
		return nil, nil
	}
	tasks, err := s.ListTasks()
	if err != nil {
		return nil, err
	}
	for _, t := range tasks {
		if t.WorkspaceName() == workspace && t.Role == TaskRoleLead && t.Status.IsActive() {
			return t, nil
		}
	}
	return nil, nil
}

// AreDependenciesMet checks if all dependencies of a task are completed.
// A dependency that no longer exists (e.g. removed by clean) is treated as met
// because only terminal (completed/canceled) tasks are ever cleaned.
func (s *Store) AreDependenciesMet(task *Task) (bool, []string, error) {
	var unmet []string
	for _, depID := range task.DependsOn {
		dep, err := s.LoadTask(depID)
		if err != nil {
			// Task was cleaned — it was terminal, treat as met.
			continue
		}
		if dep.Status != StatusCompleted {
			unmet = append(unmet, depID)
		}
	}
	return len(unmet) == 0, unmet, nil
}

// CleanTerminal removes completed/canceled tasks that are no longer
// referenced as a dependency by any non-terminal task.
func (s *Store) CleanTerminal() (int, error) {
	tasks, err := s.ListTasks()
	if err != nil {
		return 0, err
	}

	// Build set of IDs still depended on by non-terminal tasks.
	referenced := make(map[string]bool)
	for _, t := range tasks {
		if !t.Status.IsTerminal() {
			for _, depID := range t.DependsOn {
				referenced[depID] = true
			}
		}
	}

	count := 0
	for _, t := range tasks {
		if t.Status.IsTerminal() && !referenced[t.ID] {
			if err := s.DeleteTask(t.ID); err != nil {
				return count, err
			}
			count++
		}
	}
	return count, nil
}

func (s *Store) archiveTaskDir(id string) string {
	return filepath.Join(s.BaseDir, archiveDir, id)
}

// ArchiveTask moves a single task from its active location to the archive.
func (s *Store) ArchiveTask(id string) error {
	src := s.taskDir(id)
	dst := s.archiveTaskDir(id)
	return os.Rename(src, dst)
}

// ArchiveTerminal archives completed/canceled tasks that are no longer
// referenced as a dependency by any non-terminal task.
func (s *Store) ArchiveTerminal() (int, error) {
	tasks, err := s.ListTasks()
	if err != nil {
		return 0, err
	}

	// Build set of IDs still depended on by non-terminal tasks.
	referenced := make(map[string]bool)
	for _, t := range tasks {
		if !t.Status.IsTerminal() {
			for _, depID := range t.DependsOn {
				referenced[depID] = true
			}
		}
	}

	count := 0
	for _, t := range tasks {
		if t.Status.IsTerminal() && !referenced[t.ID] {
			if err := s.ArchiveTask(t.ID); err != nil {
				return count, err
			}
			count++
		}
	}
	return count, nil
}

// ListArchivedTasks returns all tasks in the archive directory.
func (s *Store) ListArchivedTasks() ([]*Task, error) {
	dir := filepath.Join(s.BaseDir, archiveDir)
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
		task, err := s.LoadArchivedTask(e.Name())
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

// LoadArchivedTask loads a task from the archive directory.
func (s *Store) LoadArchivedTask(id string) (*Task, error) {
	path := filepath.Join(s.archiveTaskDir(id), taskFile)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("archived task %s not found", id)
		}
		return nil, err
	}
	var task Task
	if err := json.Unmarshal(data, &task); err != nil {
		return nil, fmt.Errorf("corrupt archived task %s: %w", id, err)
	}
	task.Workspace = NormalizeWorkspaceName(task.Workspace)
	return &task, nil
}

// ResolveArchivedID finds an archived task by exact or prefix match.
func (s *Store) ResolveArchivedID(idPrefix string) (string, error) {
	dir := filepath.Join(s.BaseDir, archiveDir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("archived task %s not found", idPrefix)
		}
		return "", err
	}

	var matches []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if e.Name() == idPrefix {
			return idPrefix, nil
		}
		if strings.HasPrefix(e.Name(), idPrefix) {
			matches = append(matches, e.Name())
		}
	}

	switch len(matches) {
	case 0:
		return "", fmt.Errorf("archived task %s not found", idPrefix)
	case 1:
		return matches[0], nil
	default:
		return "", fmt.Errorf("ambiguous archived id prefix %s: matches %s", idPrefix, strings.Join(matches, ", "))
	}
}
