package whip

import (
	"fmt"
	"os"
)

// SpawnMasterSession creates a detached tmux session running the AI backend
// as the whip master, following the same pattern as Spawn() in spawn.go.
func SpawnMasterSession(cfg RemoteConfig) error {
	backend, err := GetBackend(cfg.Backend)
	if err != nil {
		return fmt.Errorf("get backend: %w", err)
	}

	task := &Task{
		Difficulty: cfg.Difficulty,
		CWD:        cfg.CWD,
		Backend:    cfg.Backend,
		Workspace:  NormalizeWorkspaceName(cfg.Workspace),
	}

	baseDir, err := ResolveWhipBaseDir()
	if err != nil {
		return fmt.Errorf("cannot determine whip home directory: %w", err)
	}
	homePaths, err := ensureWhipHome(baseDir)
	if err != nil {
		return fmt.Errorf("ensure whip home: %w", err)
	}

	task.Backend = backend.Name()
	promptPath, err := prepareMasterPrompt(homePaths, backend.Name())
	if err != nil {
		return fmt.Errorf("prepare master prompt: %w", err)
	}

	launchCmd := backend.BuildLaunchCmd(task, promptPath)

	cwd := cfg.CWD
	if cwd == "" {
		cwd, _ = os.Getwd()
	}

	shellCmd := fmt.Sprintf(
		`cd %s && WHIP_MASTER_IRC=%s %s ; exit`,
		shellEscape(cwd),
		shellEscape(WorkspaceMasterIRCName(task.WorkspaceName())),
		launchCmd,
	)

	return spawnMasterTmuxSession(WorkspaceMasterSessionName(task.WorkspaceName()), shellCmd)
}

// IsMasterSessionAlive checks if the whip-master tmux session exists.
func IsMasterSessionAlive(workspace string) bool {
	return IsTmuxSessionName(WorkspaceMasterSessionName(workspace))
}

// StopMasterSession kills the whip-master tmux session.
func StopMasterSession(workspace string) error {
	return KillTmuxSessionName(WorkspaceMasterSessionName(workspace))
}
