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
	}

	baseDir, err := ResolveWhipBaseDir()
	if err != nil {
		return fmt.Errorf("cannot determine whip home directory: %w", err)
	}
	homePaths, err := ensureWhipHome(baseDir)
	if err != nil {
		return fmt.Errorf("ensure whip home: %w", err)
	}

	launchCmd := backend.BuildLaunchCmd(task, homePaths.Prompt)

	cwd := cfg.CWD
	if cwd == "" {
		cwd, _ = os.Getwd()
	}

	shellCmd := fmt.Sprintf(
		`cd %s && %s ; exit`,
		shellEscape(cwd),
		launchCmd,
	)

	return spawnMasterTmuxSession(MasterSessionName, shellCmd)
}

// IsMasterSessionAlive checks if the whip-master tmux session exists.
func IsMasterSessionAlive() bool {
	return IsTmuxSessionName(MasterSessionName)
}

// StopMasterSession kills the whip-master tmux session.
func StopMasterSession() error {
	return KillTmuxSessionName(MasterSessionName)
}
