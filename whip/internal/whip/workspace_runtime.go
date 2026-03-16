package whip

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Workspace struct {
	Name             string                  `json:"name"`
	Status           WorkspaceStatus         `json:"status,omitempty"`
	ArchivedTaskIDs  []string                `json:"archived_task_ids,omitempty"`
	ExecutionModel   WorkspaceExecutionModel `json:"execution_model,omitempty"`
	OriginalRepoPath string                  `json:"original_repo_path,omitempty"`
	OriginalCWD      string                  `json:"original_cwd,omitempty"`
	WorktreePath     string                  `json:"worktree_path,omitempty"`
	CreatedAt        time.Time               `json:"created_at,omitempty"`
	UpdatedAt        time.Time               `json:"updated_at,omitempty"`
}

type gitContext struct {
	RepoRoot   string
	RepoSubdir string
}

type WorkspaceExecutionModel string
type WorkspaceStatus string

const (
	WorkspaceExecutionModelGitWorktree WorkspaceExecutionModel = "git-worktree"
	WorkspaceExecutionModelDirectCWD   WorkspaceExecutionModel = "direct-cwd"

	WorkspaceStatusActive   WorkspaceStatus = "active"
	WorkspaceStatusArchived WorkspaceStatus = "archived"
)

func (w *Workspace) WorkspaceName() string {
	return NormalizeWorkspaceName(w.Name)
}

func (w *Workspace) EffectiveStatus() WorkspaceStatus {
	if w == nil || w.Status == "" {
		return WorkspaceStatusActive
	}
	return w.Status
}

func (w *Workspace) StatusLabel() string {
	return string(w.EffectiveStatus())
}

func (w *Workspace) IsArchived() bool {
	return w.EffectiveStatus() == WorkspaceStatusArchived
}

func (w *Workspace) EffectiveExecutionModel() WorkspaceExecutionModel {
	if w == nil {
		return ""
	}
	if w.ExecutionModel != "" {
		return w.ExecutionModel
	}
	if strings.TrimSpace(w.OriginalRepoPath) != "" || strings.TrimSpace(w.WorktreePath) != "" {
		return WorkspaceExecutionModelGitWorktree
	}
	if strings.TrimSpace(w.OriginalCWD) != "" {
		return WorkspaceExecutionModelDirectCWD
	}
	return ""
}

func (w *Workspace) normalizeExecutionModel() error {
	if w == nil {
		return fmt.Errorf("workspace is nil")
	}
	model := w.EffectiveExecutionModel()
	switch model {
	case "", WorkspaceExecutionModelGitWorktree, WorkspaceExecutionModelDirectCWD:
		w.ExecutionModel = model
		return nil
	default:
		return fmt.Errorf("invalid workspace execution model %q", model)
	}
}

func (w *Workspace) normalizeStatus() error {
	if w == nil {
		return fmt.Errorf("workspace is nil")
	}
	switch w.EffectiveStatus() {
	case WorkspaceStatusActive, WorkspaceStatusArchived:
		w.Status = w.EffectiveStatus()
		return nil
	default:
		return fmt.Errorf("invalid workspace status %q", w.Status)
	}
}

func (w *Workspace) ExecutionModelLabel() string {
	model := w.EffectiveExecutionModel()
	if model == "" {
		return "unspecified"
	}
	return string(model)
}

func (s *Store) workspaceMetaPath(name string) string {
	return filepath.Join(s.workspaceDir(name), workspaceFile)
}

func (s *Store) workspaceWorktreePath(name string) string {
	return filepath.Join(s.workspaceDir(name), "worktree")
}

func (s *Store) LoadWorkspace(name string) (*Workspace, error) {
	name = NormalizeWorkspaceName(name)
	if name == GlobalWorkspaceName {
		return nil, fmt.Errorf("global does not use workspace metadata")
	}
	if err := ValidateWorkspaceName(name); err != nil {
		return nil, err
	}

	data, err := os.ReadFile(s.workspaceMetaPath(name))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("workspace %s not found", name)
		}
		return nil, err
	}

	var workspace Workspace
	if err := json.Unmarshal(data, &workspace); err != nil {
		return nil, fmt.Errorf("corrupt workspace %s: %w", name, err)
	}
	workspace.Name = name
	if err := workspace.normalizeStatus(); err != nil {
		return nil, fmt.Errorf("workspace %s has invalid status: %w", name, err)
	}
	return &workspace, nil
}

func (s *Store) SaveWorkspace(workspace *Workspace) error {
	if workspace == nil {
		return fmt.Errorf("workspace is nil")
	}

	workspace.Name = NormalizeWorkspaceName(workspace.Name)
	if workspace.Name == GlobalWorkspaceName {
		return fmt.Errorf("global does not use workspace metadata")
	}
	if err := ValidateWorkspaceName(workspace.Name); err != nil {
		return err
	}
	if err := workspace.normalizeStatus(); err != nil {
		return err
	}
	if err := workspace.normalizeExecutionModel(); err != nil {
		return err
	}
	if err := ensurePrivateDir(s.workspaceDir(workspace.Name)); err != nil {
		return err
	}
	data, err := json.MarshalIndent(workspace, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return atomicWriteFile(s.workspaceMetaPath(workspace.Name), data, privateFilePerm)
}

func (s *Store) ListWorkspaces() ([]*Workspace, error) {
	var workspaces []*Workspace
	entries, err := os.ReadDir(filepath.Join(s.BaseDir, workspacesDir))
	if err != nil {
		if os.IsNotExist(err) {
			return []*Workspace{}, nil
		}
		return nil, err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := NormalizeWorkspaceName(entry.Name())
		workspace, err := s.LoadWorkspace(name)
		if err != nil {
			if strings.Contains(err.Error(), "not found") {
				workspace = &Workspace{Name: name}
			} else {
				return nil, err
			}
		}
		workspaces = append(workspaces, workspace)
	}
	sort.Slice(workspaces, func(i, j int) bool {
		return workspaces[i].WorkspaceName() < workspaces[j].WorkspaceName()
	})
	return workspaces, nil
}

func (s *Store) CountTasksInWorkspace(name string) (int, error) {
	name = NormalizeWorkspaceName(name)
	entries, err := os.ReadDir(s.workspaceTasksDir(name))
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	count := 0
	for _, entry := range entries {
		if entry.IsDir() {
			count++
		}
	}
	return count, nil
}

func (s *Store) ListTasksInWorkspace(name string) ([]*Task, error) {
	name = NormalizeWorkspaceName(name)

	entries, err := os.ReadDir(s.workspaceTasksDir(name))
	if err != nil {
		if os.IsNotExist(err) {
			return []*Task{}, nil
		}
		return nil, err
	}

	var tasks []*Task
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		task, err := s.LoadTask(entry.Name())
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

func (s *Store) CountArchivedTasksInWorkspace(name string) (int, error) {
	name = NormalizeWorkspaceName(name)
	if name == GlobalWorkspaceName {
		return 0, nil
	}

	workspace, err := s.LoadWorkspace(name)
	if err != nil {
		return 0, err
	}
	if workspace.ArchivedTaskIDs != nil {
		return len(workspace.ArchivedTaskIDs), nil
	}

	tasks, err := s.ListArchivedTasks()
	if err != nil {
		return 0, err
	}
	count := 0
	for _, task := range tasks {
		if task.WorkspaceName() == name {
			count++
		}
	}
	return count, nil
}

func (s *Store) ListArchivedTasksInWorkspace(name string) ([]*Task, error) {
	name = NormalizeWorkspaceName(name)
	if name == GlobalWorkspaceName {
		return []*Task{}, nil
	}

	workspace, err := s.LoadWorkspace(name)
	if err != nil {
		return nil, err
	}
	if workspace.ArchivedTaskIDs != nil {
		tasks := make([]*Task, 0, len(workspace.ArchivedTaskIDs))
		for _, id := range workspace.ArchivedTaskIDs {
			task, err := s.LoadArchivedTask(id)
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

	tasks, err := s.ListArchivedTasks()
	if err != nil {
		return nil, err
	}
	filtered := make([]*Task, 0, len(tasks))
	for _, task := range tasks {
		if task.WorkspaceName() == name {
			filtered = append(filtered, task)
		}
	}
	return filtered, nil
}

func (s *Store) EnsureWorkspace(name string, cwd string) (*Workspace, string, error) {
	if err := ValidateWorkspaceName(name); err != nil {
		return nil, "", err
	}
	name = NormalizeWorkspaceName(name)
	if name == GlobalWorkspaceName {
		return nil, cwd, nil
	}
	if cwd == "" {
		return nil, "", fmt.Errorf("cwd is required")
	}

	resolvedCWD, err := canonicalizeStorePath(cwd)
	if err != nil {
		return nil, "", err
	}

	workspace, err := s.loadOrInitWorkspace(name, resolvedCWD)
	if err != nil {
		return nil, "", err
	}
	if workspace.IsArchived() {
		return nil, "", fmt.Errorf("workspace %s is archived; delete it before reusing the name", name)
	}
	if workspace.WorktreePath != "" {
		if canonicalWorktreePath, err := canonicalizeStorePath(workspace.WorktreePath); err == nil {
			workspace.WorktreePath = canonicalWorktreePath
		}
	}

	if workspace.WorktreePath != "" && isPathWithinRoot(workspace.WorktreePath, resolvedCWD) {
		workspace.ExecutionModel = WorkspaceExecutionModelGitWorktree
		workspace.UpdatedAt = time.Now().UTC()
		if err := s.SaveWorkspace(workspace); err != nil {
			return nil, "", err
		}
		return workspace, resolvedCWD, nil
	}

	gitCtx, err := detectGitContext(resolvedCWD)
	if err != nil {
		return nil, "", err
	}
	if gitCtx == nil {
		switch workspace.EffectiveExecutionModel() {
		case "", WorkspaceExecutionModelDirectCWD:
			workspace.ExecutionModel = WorkspaceExecutionModelDirectCWD
		case WorkspaceExecutionModelGitWorktree:
			return nil, "", fmt.Errorf("workspace %s uses execution model %s and is bound to repo %s; cwd %s is outside that repo", name, WorkspaceExecutionModelGitWorktree, workspace.OriginalRepoPath, resolvedCWD)
		default:
			return nil, "", fmt.Errorf("workspace %s has unsupported execution model %q", name, workspace.ExecutionModel)
		}
		if workspace.OriginalCWD == "" {
			workspace.OriginalCWD = resolvedCWD
		}
		workspace.UpdatedAt = time.Now().UTC()
		if err := s.SaveWorkspace(workspace); err != nil {
			return nil, "", err
		}
		return workspace, resolvedCWD, nil
	}

	switch workspace.EffectiveExecutionModel() {
	case "", WorkspaceExecutionModelGitWorktree:
		workspace.ExecutionModel = WorkspaceExecutionModelGitWorktree
	case WorkspaceExecutionModelDirectCWD:
		return nil, "", fmt.Errorf("workspace %s uses execution model %s and cannot be rebound to git repo %s", name, WorkspaceExecutionModelDirectCWD, gitCtx.RepoRoot)
	default:
		return nil, "", fmt.Errorf("workspace %s has unsupported execution model %q", name, workspace.ExecutionModel)
	}

	if workspace.OriginalRepoPath != "" && workspace.OriginalRepoPath != gitCtx.RepoRoot {
		return nil, "", fmt.Errorf("workspace %s belongs to repo %s, not %s", name, workspace.OriginalRepoPath, gitCtx.RepoRoot)
	}

	if workspace.OriginalRepoPath == "" {
		workspace.OriginalRepoPath = gitCtx.RepoRoot
	}
	if workspace.OriginalCWD == "" {
		workspace.OriginalCWD = resolvedCWD
	}
	if workspace.WorktreePath == "" {
		workspace.WorktreePath = s.workspaceWorktreePath(name)
	}
	if err := ensureGitWorktree(workspace.OriginalRepoPath, workspace.WorktreePath); err != nil {
		return nil, "", err
	}
	canonicalWorktreePath, err := canonicalizeStorePath(workspace.WorktreePath)
	if err != nil {
		return nil, "", err
	}
	workspace.WorktreePath = canonicalWorktreePath

	workspace.UpdatedAt = time.Now().UTC()
	if err := s.SaveWorkspace(workspace); err != nil {
		return nil, "", err
	}

	if gitCtx.RepoSubdir == "" {
		return workspace, workspace.WorktreePath, nil
	}
	return workspace, filepath.Join(workspace.WorktreePath, gitCtx.RepoSubdir), nil
}

func (s *Store) DeleteWorkspace(name string) error {
	name = NormalizeWorkspaceName(name)
	if name == GlobalWorkspaceName {
		return fmt.Errorf("cannot delete global workspace")
	}
	if err := ValidateWorkspaceName(name); err != nil {
		return err
	}
	return os.RemoveAll(s.workspaceDir(name))
}

func (s *Store) loadOrInitWorkspace(name string, cwd string) (*Workspace, error) {
	if err := ValidateWorkspaceName(name); err != nil {
		return nil, err
	}
	workspace, err := s.LoadWorkspace(name)
	if err == nil {
		return workspace, nil
	}
	if !strings.Contains(err.Error(), "not found") {
		return nil, err
	}
	now := time.Now().UTC()
	return &Workspace{
		Name:            name,
		Status:          WorkspaceStatusActive,
		ArchivedTaskIDs: []string{},
		CreatedAt:       now,
		UpdatedAt:       now,
	}, nil
}

func detectGitContext(cwd string) (*gitContext, error) {
	if _, err := exec.LookPath("git"); err != nil {
		return nil, nil
	}

	cmd := exec.Command("git", "-C", cwd, "rev-parse", "--show-toplevel")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, nil
	}

	repoRoot, err := canonicalizeStorePath(strings.TrimSpace(string(output)))
	if err != nil {
		return nil, err
	}
	repoSubdir, err := filepath.Rel(repoRoot, cwd)
	if err != nil {
		return nil, err
	}
	if repoSubdir == "." {
		repoSubdir = ""
	}
	return &gitContext{RepoRoot: repoRoot, RepoSubdir: repoSubdir}, nil
}

func ensureGitWorktree(repoRoot string, worktreePath string) error {
	if strings.TrimSpace(repoRoot) == "" || strings.TrimSpace(worktreePath) == "" {
		return fmt.Errorf("repo root and worktree path are required")
	}
	if _, err := os.Stat(worktreePath); err == nil {
		return nil
	}

	if err := ensurePrivateDir(filepath.Dir(worktreePath)); err != nil {
		return err
	}

	pruneCmd := exec.Command("git", "-C", repoRoot, "worktree", "prune")
	_ = pruneCmd.Run()

	cmd := exec.Command("git", "-C", repoRoot, "worktree", "add", "--detach", worktreePath, "HEAD")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git worktree add %s: %s", worktreePath, strings.TrimSpace(string(output)))
	}
	return nil
}

func workspaceTaskSets(store *Store, name string) ([]*Task, []*Task, error) {
	name = NormalizeWorkspaceName(name)
	activeTasks, err := store.ListTasksInWorkspace(name)
	if err != nil {
		return nil, nil, err
	}
	archivedTasks, err := store.ListArchivedTasksInWorkspace(name)
	if err != nil {
		return nil, nil, err
	}
	return activeTasks, archivedTasks, nil
}

func validateWorkspaceTerminalTasks(name string, tasks []*Task) error {
	for _, task := range tasks {
		if task.Status.IsTerminal() {
			continue
		}
		return fmt.Errorf("workspace %s has non-terminal task %s (%s, %s); archive/delete is allowed only when all workspace tasks are terminal", name, task.ID, task.Title, task.Status)
	}
	return nil
}

func validateWorkspaceDependencyBoundary(store *Store, name string) error {
	activeTasks, err := store.ListTasks()
	if err != nil {
		return err
	}
	archivedTasks, err := store.ListArchivedTasks()
	if err != nil {
		return err
	}

	workspaceByTaskID := make(map[string]string, len(activeTasks)+len(archivedTasks))
	for _, task := range activeTasks {
		workspaceByTaskID[task.ID] = task.WorkspaceName()
	}
	for _, task := range archivedTasks {
		workspaceByTaskID[task.ID] = task.WorkspaceName()
	}

	check := func(task *Task) error {
		taskWorkspace := task.WorkspaceName()
		for _, depID := range task.DependsOn {
			depWorkspace, ok := workspaceByTaskID[depID]
			if !ok {
				continue
			}
			if depWorkspace != taskWorkspace && (taskWorkspace == name || depWorkspace == name) {
				return fmt.Errorf("workspace %s has cross-workspace dependency: task %s is in %s but dependency %s is in %s", name, task.ID, taskWorkspace, depID, depWorkspace)
			}
		}
		return nil
	}

	for _, task := range activeTasks {
		if err := check(task); err != nil {
			return err
		}
	}
	for _, task := range archivedTasks {
		if err := check(task); err != nil {
			return err
		}
	}
	return nil
}

func teardownTaskRuntimeForArchive(store *Store, id string) error {
	task, err := store.LoadTask(id)
	if err != nil {
		return err
	}

	snapshotTaskMessages(store, task)
	if err := stopTaskSession(task); err != nil {
		return err
	}

	_, err = store.UpdateTask(id, func(task *Task) error {
		clearTaskRuntime(task, false)
		task.UpdatedAt = currentTime()
		task.RecordEvent("system", "workspace archive", "runtime_cleared", task.Status, task.Status, "workspace archive teardown")
		return nil
	})
	return err
}

func checkWorktreeClean(worktreePath, originalRepoPath string) (dirty bool, unpushed bool, err error) {
	statusOut, err := exec.Command("git", "-C", worktreePath, "status", "--porcelain").Output()
	if err != nil {
		return false, false, err
	}
	dirty = len(strings.TrimSpace(string(statusOut))) > 0

	// Try upstream comparison first
	logOut, err := exec.Command("git", "-C", worktreePath, "log", "@{u}..HEAD", "--oneline").Output()
	if err == nil {
		unpushed = len(strings.TrimSpace(string(logOut))) > 0
	} else if originalRepoPath != "" {
		// No upstream — compare worktree HEAD against original repo HEAD
		wtHead, err1 := exec.Command("git", "-C", worktreePath, "rev-parse", "HEAD").Output()
		origHead, err2 := exec.Command("git", "-C", originalRepoPath, "rev-parse", "HEAD").Output()
		if err1 == nil && err2 == nil {
			unpushed = strings.TrimSpace(string(wtHead)) != strings.TrimSpace(string(origHead))
		} else {
			unpushed = true // can't determine — treat as unpushed
		}
	} else {
		unpushed = true // no upstream, no original repo — treat as unpushed
	}
	return dirty, unpushed, nil
}

func autoSaveWorktree(worktreePath string) error {
	if err := exec.Command("git", "-C", worktreePath, "add", "-A").Run(); err != nil {
		return fmt.Errorf("git add: %w", err)
	}
	// Commit (skip if nothing staged)
	commitCmd := exec.Command("git", "-C", worktreePath, "commit", "-m", "whip: auto-save before archive", "--allow-empty-message")
	commitCmd.Run() // ignore error — may be nothing to commit

	pushCmd := exec.Command("git", "-C", worktreePath, "push")
	if out, err := pushCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git push: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

// ArchiveWorkspace archives all remaining active tasks in a workspace, tears down
// its runtime/worktree, and marks the workspace archived.
// When force is true and the worktree is dirty/unpushed, it auto-saves before archiving.
func ArchiveWorkspace(store *Store, name string, force bool) (int, error) {
	name = NormalizeWorkspaceName(name)
	if name == GlobalWorkspaceName {
		return 0, fmt.Errorf("global is not a named workspace")
	}

	workspace, err := store.LoadWorkspace(name)
	if err != nil {
		return 0, err
	}
	if workspace.IsArchived() {
		return 0, fmt.Errorf("workspace %s is already archived", name)
	}

	workspaceTasks, _, err := workspaceTaskSets(store, name)
	if err != nil {
		return 0, err
	}
	if err := validateWorkspaceDependencyBoundary(store, name); err != nil {
		return 0, err
	}

	if err := validateWorkspaceTerminalTasks(name, workspaceTasks); err != nil {
		return 0, err
	}

	activeTasks, err := store.ListTasks()
	if err != nil {
		return 0, err
	}
	blockers := archiveDependencyBlockers(activeTasks)
	for _, task := range workspaceTasks {
		if err := archiveabilityError(task, blockers); err != nil {
			return 0, fmt.Errorf("workspace %s cannot be archived: %w", name, err)
		}
	}

	count := 0
	for _, task := range workspaceTasks {
		if err := teardownTaskRuntimeForArchive(store, task.ID); err != nil {
			return count, err
		}
		if err := store.archiveTask(task.ID); err != nil {
			return count, err
		}
		if err := store.appendArchivedTaskToWorkspace(task); err != nil {
			return count, err
		}
		count++
	}

	if workspace.WorktreePath != "" {
		dirty, unpushed, err := checkWorktreeClean(workspace.WorktreePath, workspace.OriginalRepoPath)
		if err == nil && (dirty || unpushed) {
			if force {
				if saveErr := autoSaveWorktree(workspace.WorktreePath); saveErr != nil {
					return count, fmt.Errorf("auto-save failed: %w", saveErr)
				}
			} else {
				var reasons []string
				if dirty {
					reasons = append(reasons, "uncommitted changes")
				}
				if unpushed {
					reasons = append(reasons, "unpushed commits")
				}
				return count, fmt.Errorf("workspace %s worktree has %s; use --force to auto-save and archive", name, strings.Join(reasons, " and "))
			}
		}
	}

	if err := RemoveWorkspaceWorktree(workspace); err != nil {
		return count, err
	}

	workspace.Status = WorkspaceStatusArchived
	workspace.WorktreePath = ""
	workspace.UpdatedAt = time.Now().UTC()
	if err := store.SaveWorkspace(workspace); err != nil {
		return count, err
	}

	_ = exec.Command("claude-irc", "clean").Run()
	return count, nil
}

// DeleteArchivedWorkspace permanently removes an archived workspace and all of
// its archived tasks.
func DeleteArchivedWorkspace(store *Store, name string) (int, error) {
	name = NormalizeWorkspaceName(name)
	if name == GlobalWorkspaceName {
		return 0, fmt.Errorf("global is not a named workspace")
	}

	workspace, err := store.LoadWorkspace(name)
	if err != nil {
		return 0, err
	}
	if !workspace.IsArchived() {
		return 0, fmt.Errorf("workspace %s is active; archive it before deleting", name)
	}

	workspaceTasks, archivedWorkspaceTasks, err := workspaceTaskSets(store, name)
	if err != nil {
		return 0, err
	}
	if err := validateWorkspaceDependencyBoundary(store, name); err != nil {
		return 0, err
	}
	if len(workspaceTasks) > 0 {
		if err := validateWorkspaceTerminalTasks(name, workspaceTasks); err != nil {
			return 0, err
		}
		return 0, fmt.Errorf("workspace %s still has active task records; archive the workspace cleanly before deleting", name)
	}

	count := 0
	for _, task := range archivedWorkspaceTasks {
		if err := store.DeleteArchivedTask(task.ID); err != nil {
			return count, err
		}
		count++
	}

	if err := store.DeleteWorkspace(name); err != nil {
		return count, err
	}
	_ = exec.Command("claude-irc", "clean").Run()
	return count, nil
}

func RemoveWorkspaceWorktree(workspace *Workspace) error {
	if workspace == nil || strings.TrimSpace(workspace.WorktreePath) == "" {
		return nil
	}

	if strings.TrimSpace(workspace.OriginalRepoPath) != "" {
		cmd := exec.Command("git", "-C", workspace.OriginalRepoPath, "worktree", "remove", workspace.WorktreePath)
		output, err := cmd.CombinedOutput()
		if err == nil {
			return nil
		}
		if strings.TrimSpace(string(output)) != "" {
			return fmt.Errorf("git worktree remove %s: %s", workspace.WorktreePath, strings.TrimSpace(string(output)))
		}
	}

	if err := os.RemoveAll(workspace.WorktreePath); err != nil {
		return err
	}
	return nil
}
