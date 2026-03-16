package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	whiplib "github.com/bang9/ai-tools/whip/internal/whip"
)

func TestWorkspaceArchiveGitWorktreeFlow(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	store := tempWhipStore(t)
	repo := initWhipCLIRepo(t)
	repoAppDir := filepath.Join(repo, "app")

	runWhipCLI(t, "task", "create", "API task", "--workspace", "issue-sweep", "--cwd", repoAppDir, "--desc", "test task")

	tasks, err := store.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks after create: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("ListTasks count = %d, want 1", len(tasks))
	}
	task := tasks[0]

	workspace, err := store.LoadWorkspace("issue-sweep")
	if err != nil {
		t.Fatalf("LoadWorkspace before archive: %v", err)
	}
	if workspace.EffectiveExecutionModel() != whiplib.WorkspaceExecutionModelGitWorktree {
		t.Fatalf("EffectiveExecutionModel = %q, want %q", workspace.EffectiveExecutionModel(), whiplib.WorkspaceExecutionModelGitWorktree)
	}
	worktreePath := workspace.WorktreePath
	if worktreePath == "" {
		t.Fatalf("WorktreePath should be set for git-backed workspace")
	}
	if task.CWD != filepath.Join(worktreePath, "app") {
		t.Fatalf("Task.CWD = %q, want %q", task.CWD, filepath.Join(worktreePath, "app"))
	}
	if _, err := os.Stat(worktreePath); err != nil {
		t.Fatalf("worktree path should exist before archive: %v", err)
	}

	runWhipCLI(t, "task", "cancel", task.ID, "--note", "done")
	runWhipCLI(t, "workspace", "archive", "issue-sweep")

	workspace, err = store.LoadWorkspace("issue-sweep")
	if err != nil {
		t.Fatalf("LoadWorkspace after archive: %v", err)
	}
	if workspace.EffectiveStatus() != whiplib.WorkspaceStatusArchived {
		t.Fatalf("workspace status = %q, want %q", workspace.EffectiveStatus(), whiplib.WorkspaceStatusArchived)
	}
	if workspace.WorktreePath != "" {
		t.Fatalf("archived workspace should clear worktree path, got %q", workspace.WorktreePath)
	}

	activeTasks, err := store.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks after archive: %v", err)
	}
	for _, activeTask := range activeTasks {
		if activeTask.WorkspaceName() == "issue-sweep" {
			t.Fatalf("active workspace task %s should be archived", activeTask.ID)
		}
	}

	archivedTasks, err := store.ListArchivedTasks()
	if err != nil {
		t.Fatalf("ListArchivedTasks after archive: %v", err)
	}
	found := false
	for _, archivedTask := range archivedTasks {
		if archivedTask.ID == task.ID && archivedTask.WorkspaceName() == "issue-sweep" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("archived workspace task %s not found after archive", task.ID)
	}

	workspaceView, _, err := execWhipCLICapture(t, "workspace", "view", "issue-sweep")
	if err != nil {
		t.Fatalf("workspace view after archive: %v", err)
	}
	if !strings.Contains(workspaceView, "Status:           archived") {
		t.Fatalf("workspace view should show archived status:\n%s", workspaceView)
	}
	if !strings.Contains(workspaceView, "Active tasks:     none") {
		t.Fatalf("workspace view should show no active tasks:\n%s", workspaceView)
	}
	if !strings.Contains(workspaceView, "Archived tasks:") || !strings.Contains(workspaceView, task.ID) {
		t.Fatalf("workspace view should show archived child task:\n%s", workspaceView)
	}

	if _, err := os.Stat(worktreePath); !os.IsNotExist(err) {
		t.Fatalf("worktree path should be removed after archive, got err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(repo, "app", "main.txt")); err != nil {
		t.Fatalf("original repo should remain intact after archive: %v", err)
	}
}

func TestWorkspaceArchiveDirectCWDFlow(t *testing.T) {
	store := tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())
	markerPath := filepath.Join(nonGitDir, "marker.txt")
	if err := os.WriteFile(markerPath, []byte("keep"), 0o644); err != nil {
		t.Fatalf("write marker: %v", err)
	}

	runWhipCLI(t, "task", "create", "Docs task", "--workspace", "docs-lane", "--cwd", nonGitDir, "--desc", "docs")
	tasks, err := store.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("ListTasks count = %d, want 1", len(tasks))
	}

	runWhipCLI(t, "task", "cancel", tasks[0].ID, "--note", "done")
	runWhipCLI(t, "workspace", "archive", "docs-lane")

	if _, err := os.Stat(markerPath); err != nil {
		t.Fatalf("original non-git cwd content should remain after archive: %v", err)
	}

	workspace, err := store.LoadWorkspace("docs-lane")
	if err != nil {
		t.Fatalf("LoadWorkspace after archive: %v", err)
	}
	if workspace.EffectiveStatus() != whiplib.WorkspaceStatusArchived {
		t.Fatalf("workspace status = %q, want archived", workspace.EffectiveStatus())
	}
}

func TestWorkspaceArchiveTearsDownTerminalRuntime(t *testing.T) {
	store := tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())

	runWhipCLI(t, "task", "create", "Runtime task", "--workspace", "runtime-lane", "--cwd", nonGitDir, "--desc", "runtime")
	tasks, err := store.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("ListTasks count = %d, want 1", len(tasks))
	}
	task := tasks[0]

	sleepCmd := exec.Command("sleep", "30")
	sleepCmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := sleepCmd.Start(); err != nil {
		t.Fatalf("start sleep: %v", err)
	}
	waitDone := make(chan error, 1)
	go func() {
		waitDone <- sleepCmd.Wait()
	}()
	waited := false
	defer func() {
		if waited {
			return
		}
		_ = sleepCmd.Process.Kill()
		<-waitDone
	}()

	task.Status = whiplib.StatusCompleted
	task.Runner = "terminal"
	task.IRCName = "wp-" + task.ID
	task.MasterIRCName = "wp-master-runtime"
	task.ShellPID = sleepCmd.Process.Pid
	if err := store.SaveTask(task); err != nil {
		t.Fatalf("SaveTask runtime state: %v", err)
	}

	runWhipCLI(t, "workspace", "archive", "runtime-lane")

	select {
	case <-waitDone:
		waited = true
	case <-time.After(2 * time.Second):
		t.Fatalf("workspace archive should stop terminal runtime pid %d", sleepCmd.Process.Pid)
	}

	archivedTask, err := store.LoadArchivedTask(task.ID)
	if err != nil {
		t.Fatalf("LoadArchivedTask: %v", err)
	}
	if archivedTask.Runner != "" || archivedTask.IRCName != "" || archivedTask.MasterIRCName != "" || archivedTask.ShellPID != 0 {
		t.Fatalf("archived task runtime should be cleared: runner=%q irc=%q master=%q pid=%d", archivedTask.Runner, archivedTask.IRCName, archivedTask.MasterIRCName, archivedTask.ShellPID)
	}
}

func TestWorkspaceArchiveRejectsDirtyWorktree(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	store := tempWhipStore(t)
	repo := initWhipCLIRepo(t)
	repoAppDir := filepath.Join(repo, "app")

	runWhipCLI(t, "task", "create", "Dirty task", "--workspace", "dirty-lane", "--cwd", repoAppDir, "--desc", "test dirty")

	tasks, err := store.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	task := tasks[0]

	workspace, err := store.LoadWorkspace("dirty-lane")
	if err != nil {
		t.Fatalf("LoadWorkspace: %v", err)
	}

	// Create uncommitted changes in worktree
	dirtyFile := filepath.Join(workspace.WorktreePath, "dirty.txt")
	if err := os.WriteFile(dirtyFile, []byte("unsaved work\n"), 0o644); err != nil {
		t.Fatalf("write dirty file: %v", err)
	}

	runWhipCLI(t, "task", "cancel", task.ID, "--note", "done")

	// Archive should reject dirty worktree
	_, _, err = execWhipCLICapture(t, "workspace", "archive", "dirty-lane")
	if err == nil {
		t.Fatal("workspace archive should reject dirty worktree")
	}
	if !strings.Contains(err.Error(), "uncommitted changes") {
		t.Fatalf("workspace archive error = %v, want uncommitted changes rejection", err)
	}

	// Workspace should still be active
	workspace, err = store.LoadWorkspace("dirty-lane")
	if err != nil {
		t.Fatalf("LoadWorkspace after rejected archive: %v", err)
	}
	if workspace.EffectiveStatus() != whiplib.WorkspaceStatusActive {
		t.Fatalf("workspace status = %q, want active", workspace.EffectiveStatus())
	}
}

func TestWorkspaceArchiveRejectsNonTerminalTask(t *testing.T) {
	store := tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())

	runWhipCLI(t, "task", "create", "Docs task", "--workspace", "docs-lane", "--cwd", nonGitDir, "--desc", "docs")

	_, _, err := execWhipCLICapture(t, "workspace", "archive", "docs-lane")
	if err == nil {
		t.Fatal("workspace archive should reject non-terminal tasks")
	}
	if !strings.Contains(err.Error(), "non-terminal task") {
		t.Fatalf("workspace archive error = %v, want non-terminal task rejection", err)
	}

	workspace, err := store.LoadWorkspace("docs-lane")
	if err != nil {
		t.Fatalf("LoadWorkspace after rejected archive: %v", err)
	}
	if workspace.EffectiveStatus() != whiplib.WorkspaceStatusActive {
		t.Fatalf("workspace status = %q, want active", workspace.EffectiveStatus())
	}
}

func TestWorkspaceDeleteRequiresArchivedWorkspace(t *testing.T) {
	store := tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())

	runWhipCLI(t, "task", "create", "Done task", "--workspace", "docs-lane", "--cwd", nonGitDir, "--desc", "docs")
	tasks, err := store.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	runWhipCLI(t, "task", "cancel", tasks[0].ID, "--note", "done")

	_, _, err = execWhipCLICapture(t, "workspace", "delete", "docs-lane")
	if err == nil {
		t.Fatal("workspace delete should reject active workspace")
	}
	if !strings.Contains(err.Error(), "archive it before deleting") {
		t.Fatalf("workspace delete error = %v, want archive-first rejection", err)
	}
}

func TestWorkspaceDeleteRemovesArchivedWorkspaceTasksAndMetadata(t *testing.T) {
	store := tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())

	runWhipCLI(t, "task", "create", "Done task", "--workspace", "archive-lane", "--cwd", nonGitDir, "--desc", "docs")

	tasks, err := store.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("ListTasks count = %d, want 1", len(tasks))
	}
	task := tasks[0]

	runWhipCLI(t, "task", "cancel", task.ID, "--note", "done")
	runWhipCLI(t, "workspace", "archive", "archive-lane")
	runWhipCLI(t, "workspace", "delete", "archive-lane")

	if _, err := store.LoadWorkspace("archive-lane"); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("LoadWorkspace after delete = %v, want not found", err)
	}
	archived, err := store.ListArchivedTasks()
	if err != nil {
		t.Fatalf("ListArchivedTasks after delete: %v", err)
	}
	for _, archivedTask := range archived {
		if archivedTask.WorkspaceName() == "archive-lane" {
			t.Fatalf("archived workspace task %s should be removed on delete", archivedTask.ID)
		}
	}
}

func TestWorkspaceArchiveRejectsArchivedNameReuse(t *testing.T) {
	_ = tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())

	taskID := createWhipTask(t,
		"task", "create", "Done task",
		"--workspace", "reserved-lane",
		"--cwd", nonGitDir,
		"--desc", "docs",
	)
	runWhipCLI(t, "task", "cancel", taskID, "--note", "done")
	runWhipCLI(t, "workspace", "archive", "reserved-lane")

	_, _, err := execWhipCLICapture(t,
		"task", "create", "Another task",
		"--workspace", "reserved-lane",
		"--cwd", nonGitDir,
		"--desc", "docs",
	)
	if err == nil {
		t.Fatal("task create should reject archived workspace name reuse")
	}
	if !strings.Contains(err.Error(), "delete it before reusing the name") {
		t.Fatalf("task create error = %v, want archived-name reuse rejection", err)
	}
}

func TestWorkspaceDeleteReleasesArchivedNameReuse(t *testing.T) {
	_ = tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())

	taskID := createWhipTask(t,
		"task", "create", "Done task",
		"--workspace", "reusable-lane",
		"--cwd", nonGitDir,
		"--desc", "docs",
	)
	runWhipCLI(t, "task", "cancel", taskID, "--note", "done")
	runWhipCLI(t, "workspace", "archive", "reusable-lane")
	runWhipCLI(t, "workspace", "delete", "reusable-lane")

	_, _, err := execWhipCLICapture(t,
		"task", "create", "Another task",
		"--workspace", "reusable-lane",
		"--cwd", nonGitDir,
		"--desc", "docs",
	)
	if err != nil {
		t.Fatalf("task create should allow archived workspace name reuse after delete: %v", err)
	}
}

func TestTaskDeleteRejectsArchivedTaskInActiveWorkspace(t *testing.T) {
	store := tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())

	runWhipCLI(t, "task", "create", "Done task", "--workspace", "delete-lane", "--cwd", nonGitDir, "--desc", "docs")
	tasks, err := store.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	task := tasks[0]

	runWhipCLI(t, "task", "cancel", task.ID, "--note", "done")
	runWhipCLI(t, "task", "archive", task.ID)

	_, _, err = execWhipCLICapture(t, "task", "delete", task.ID)
	if err == nil {
		t.Fatal("task delete should reject archived task in active workspace")
	}
	if !strings.Contains(err.Error(), "archive the workspace before deleting") {
		t.Fatalf("task delete error = %v, want active-workspace rejection", err)
	}

	runWhipCLI(t, "workspace", "archive", "delete-lane")
	runWhipCLI(t, "task", "delete", task.ID)
	if _, err := store.LoadArchivedTask(task.ID); err == nil {
		t.Fatal("archived task should be deleted after workspace archive")
	}
}

func TestTaskDepRejectsCrossWorkspaceDependency(t *testing.T) {
	store := tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())

	runWhipCLI(t, "task", "create", "Task A", "--workspace", "lane-a", "--cwd", nonGitDir, "--desc", "a")
	runWhipCLI(t, "task", "create", "Task B", "--workspace", "lane-b", "--cwd", nonGitDir, "--desc", "b")

	tasks, err := store.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("ListTasks count = %d, want 2", len(tasks))
	}

	var laneATask, laneBTask *whiplib.Task
	for _, task := range tasks {
		switch task.WorkspaceName() {
		case "lane-a":
			laneATask = task
		case "lane-b":
			laneBTask = task
		}
	}
	if laneATask == nil || laneBTask == nil {
		t.Fatalf("expected tasks in lane-a and lane-b, got %+v", tasks)
	}

	_, _, err = execWhipCLICapture(t, "task", "dep", laneATask.ID, "--after", laneBTask.ID)
	if err == nil {
		t.Fatal("task dep should reject cross-workspace dependencies")
	}
	if !strings.Contains(err.Error(), "cross-workspace dependencies are not allowed") {
		t.Fatalf("task dep error = %v, want cross-workspace rejection", err)
	}
}

func TestWorkspaceListFiltersByStatus(t *testing.T) {
	store := tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())

	runWhipCLI(t, "task", "create", "Active task", "--workspace", "active-lane", "--cwd", nonGitDir, "--desc", "active")
	runWhipCLI(t, "task", "create", "Archived task", "--workspace", "archived-lane", "--cwd", nonGitDir, "--desc", "archived")

	tasks, err := store.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	for _, task := range tasks {
		if task.WorkspaceName() == "archived-lane" {
			runWhipCLI(t, "task", "cancel", task.ID, "--note", "done")
		}
	}
	runWhipCLI(t, "workspace", "archive", "archived-lane")

	activeList, _, err := execWhipCLICapture(t, "workspace", "list")
	if err != nil {
		t.Fatalf("workspace list: %v", err)
	}
	if !strings.Contains(activeList, "active-lane") || strings.Contains(activeList, "archived-lane") {
		t.Fatalf("workspace list should show only active workspaces:\n%s", activeList)
	}

	archivedList, _, err := execWhipCLICapture(t, "workspace", "list", "--archive")
	if err != nil {
		t.Fatalf("workspace list --archive: %v", err)
	}
	if !strings.Contains(archivedList, "archived-lane") || strings.Contains(archivedList, "active-lane") {
		t.Fatalf("workspace list --archive should show only archived workspaces:\n%s", archivedList)
	}

	allList, _, err := execWhipCLICapture(t, "workspace", "list", "--all")
	if err != nil {
		t.Fatalf("workspace list --all: %v", err)
	}
	if !strings.Contains(allList, "active-lane") || !strings.Contains(allList, "archived-lane") {
		t.Fatalf("workspace list --all should show both workspaces:\n%s", allList)
	}
}

func TestWorkspaceListRejectsArchiveAndAllFlagsTogether(t *testing.T) {
	_, _, err := execWhipCLICapture(t, "workspace", "list", "--archive", "--all")
	if err == nil {
		t.Fatal("workspace list should reject --archive with --all")
	}
	if !strings.Contains(err.Error(), "cannot be used together") {
		t.Fatalf("workspace list error = %v, want conflicting flag rejection", err)
	}
}

func TestWorkspaceBroadcastRejectsArchivedWorkspace(t *testing.T) {
	_ = tempWhipStore(t)
	nonGitDir := canonicalTestPath(t, t.TempDir())

	taskID := createWhipTask(t,
		"task", "create", "Done task",
		"--workspace", "quiet-lane",
		"--cwd", nonGitDir,
		"--desc", "docs",
	)
	runWhipCLI(t, "task", "cancel", taskID, "--note", "done")
	runWhipCLI(t, "workspace", "archive", "quiet-lane")

	_, _, err := execWhipCLICapture(t, "workspace", "broadcast", "quiet-lane", "hello")
	if err == nil {
		t.Fatal("workspace broadcast should reject archived workspace")
	}
	if !strings.Contains(err.Error(), "broadcasting is disabled") {
		t.Fatalf("workspace broadcast error = %v, want archived-workspace rejection", err)
	}
}

func TestWorkspaceCommandsRejectInvalidName(t *testing.T) {
	for _, args := range [][]string{
		{"workspace", "view", "../../tmp/poc"},
		{"workspace", "archive", "../../tmp/poc"},
		{"workspace", "delete", "../../tmp/poc"},
	} {
		_, _, err := execWhipCLICapture(t, args...)
		if err == nil {
			t.Fatalf("%s should reject invalid workspace name", strings.Join(args, " "))
		}
		if !strings.Contains(err.Error(), "invalid workspace") {
			t.Fatalf("%s error = %v, want invalid workspace", strings.Join(args, " "), err)
		}
	}
}

func TestWorkspaceHelpListsArchiveAndDeleteCommands(t *testing.T) {
	helpText, _, err := execWhipCLICapture(t, "workspace", "--help")
	if err != nil {
		t.Fatalf("workspace --help: %v", err)
	}
	if !helpListsCommand(helpText, "archive") || !helpListsCommand(helpText, "delete") {
		t.Fatalf("workspace help should list archive/delete commands:\n%s", helpText)
	}
	if helpListsCommand(helpText, "drop") {
		t.Fatalf("workspace help should not list drop command:\n%s", helpText)
	}
}

func tempWhipStore(t *testing.T) *whiplib.Store {
	t.Helper()

	tmpHome := t.TempDir()
	t.Setenv("HOME", tmpHome)
	t.Setenv("WHIP_HOME", filepath.Join(tmpHome, ".whip", "test-store"))

	store, err := whiplib.NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	return store
}

func runWhipCLI(t *testing.T, args ...string) {
	t.Helper()
	if err := execWhipCLI(args...); err != nil {
		t.Fatalf("whip %s: %v", strings.Join(args, " "), err)
	}
}

func execWhipCLI(args ...string) error {
	root := newRootCmd()
	root.SetArgs(args)
	return root.Execute()
}

func initWhipCLIRepo(t *testing.T) string {
	t.Helper()

	repo := canonicalTestPath(t, t.TempDir())
	runWhipGit(t, repo, "init")
	runWhipGit(t, repo, "config", "user.name", "Whip CLI Test")
	runWhipGit(t, repo, "config", "user.email", "whip-cli@example.com")

	if err := os.MkdirAll(filepath.Join(repo, "app"), 0o755); err != nil {
		t.Fatalf("mkdir app: %v", err)
	}
	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("hello\n"), 0o644); err != nil {
		t.Fatalf("write README: %v", err)
	}
	if err := os.WriteFile(filepath.Join(repo, "app", "main.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write app/main.txt: %v", err)
	}

	runWhipGit(t, repo, "add", "README.md", "app/main.txt")
	runWhipGit(t, repo, "commit", "-m", "init")
	return repo
}

func runWhipGit(t *testing.T, repo string, args ...string) {
	t.Helper()

	cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
}

func canonicalTestPath(t *testing.T, path string) string {
	t.Helper()

	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		if os.IsNotExist(err) {
			return path
		}
		t.Fatalf("EvalSymlinks %s: %v", path, err)
	}
	return resolved
}
