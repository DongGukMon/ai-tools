package whip

import (
	"fmt"
	"strings"
)

type LaunchSource struct {
	Actor   string
	Command string
}

func DefaultMasterIRCName(cfg *Config) string {
	if cfg != nil && strings.TrimSpace(cfg.MasterIRCName) != "" {
		return strings.TrimSpace(cfg.MasterIRCName)
	}
	return MasterSessionName
}

func AssignCreatedTask(store *Store, id string, source LaunchSource, masterIRC string) (*Task, error) {
	resolvedMasterIRC := defaultLaunchMasterIRC(masterIRC)

	task, err := store.UpdateTask(id, func(task *Task) error {
		if task.Status != StatusCreated {
			return fmt.Errorf("task %s is %s, must be 'created' to assign", id, task.Status)
		}

		met, unmet, err := store.AreDependenciesMet(task)
		if err != nil {
			return err
		}
		if !met {
			return fmt.Errorf("unmet dependencies: %s", strings.Join(unmet, ", "))
		}

		from := task.Status
		prepareAssignedTask(task, resolvedMasterIRC)
		task.RecordEvent(source.Actor, source.Command, "assigned", from, task.Status, fmt.Sprintf("irc=%s master=%s", task.IRCName, task.MasterIRCName))
		return nil
	})
	if err != nil {
		return nil, err
	}

	if err := store.SavePrompt(task.ID, GeneratePrompt(task)); err != nil {
		_, _ = store.UpdateTask(task.ID, func(task *Task) error {
			from := task.Status
			revertAssignedTask(task)
			task.UpdatedAt = currentTime()
			task.AddNote("assign aborted before spawn: failed to save prompt")
			task.RecordEvent(source.Actor, source.Command, "reverted", from, task.Status, "failed to save prompt")
			return nil
		})
		return nil, err
	}

	return finalizeAssignedTaskSpawn(store, task, source, func(task *Task, spawnErr error) {
		from := task.Status
		revertAssignedTask(task)
		task.UpdatedAt = currentTime()
		task.AddNote(fmt.Sprintf("assign spawn failed: %v", spawnErr))
		task.RecordEvent(source.Actor, source.Command, "reverted", from, task.Status, spawnErr.Error())
	})
}

func RetryTaskRun(store *Store, id string, source LaunchSource, masterIRC string) (*Task, error) {
	resolvedMasterIRC := defaultLaunchMasterIRC(masterIRC)

	task, err := store.UpdateTask(id, func(task *Task) error {
		from := task.Status
		if err := task.Retry(); err != nil {
			return err
		}

		prepareAssignedTask(task, resolvedMasterIRC)
		task.RecordEvent(source.Actor, source.Command, "assigned", from, task.Status, fmt.Sprintf("irc=%s master=%s", task.IRCName, task.MasterIRCName))
		return nil
	})
	if err != nil {
		return nil, err
	}

	if err := store.SavePrompt(task.ID, GeneratePrompt(task)); err != nil {
		_, _ = store.UpdateTask(task.ID, func(task *Task) error {
			from := task.Status
			failRetriedTask(task)
			task.AddNote("retry aborted before spawn: failed to save prompt")
			task.RecordEvent(source.Actor, source.Command, "spawn_failed", from, task.Status, "failed to save prompt")
			return nil
		})
		return nil, err
	}

	return finalizeAssignedTaskSpawn(store, task, source, func(task *Task, spawnErr error) {
		from := task.Status
		failRetriedTask(task)
		task.AddNote(fmt.Sprintf("retry spawn failed: %v", spawnErr))
		task.RecordEvent(source.Actor, source.Command, "spawn_failed", from, task.Status, spawnErr.Error())
	})
}

func defaultLaunchMasterIRC(masterIRC string) string {
	masterIRC = strings.TrimSpace(masterIRC)
	if masterIRC == "" {
		return MasterSessionName
	}
	return masterIRC
}

func prepareAssignedTask(task *Task, masterIRC string) {
	task.IRCName = "whip-" + task.ID
	task.MasterIRCName = masterIRC
	if task.Backend == "" {
		task.Backend = DefaultBackendName
	}
	task.Status = StatusAssigned
	now := currentTime()
	task.AssignedAt = &now
	task.UpdatedAt = now
}

func revertAssignedTask(task *Task) {
	task.Status = StatusCreated
	task.Runner = ""
	task.IRCName = ""
	task.MasterIRCName = ""
	task.AssignedAt = nil
	task.CompletedAt = nil
	task.HeartbeatAt = nil
}

func failRetriedTask(task *Task) {
	task.Status = StatusFailed
	task.Runner = ""
	task.HeartbeatAt = nil
	now := currentTime()
	task.CompletedAt = &now
	task.UpdatedAt = now
}

func finalizeAssignedTaskSpawn(store *Store, task *Task, source LaunchSource, onSpawnFailure func(*Task, error)) (*Task, error) {
	runner, err := Spawn(task, store.PromptPath(task.ID))
	if err != nil {
		_, _ = store.UpdateTask(task.ID, func(task *Task) error {
			onSpawnFailure(task, err)
			return nil
		})
		return nil, fmt.Errorf("failed to spawn session: %w", err)
	}

	task, err = store.UpdateTask(task.ID, func(current *Task) error {
		current.Runner = runner
		if task.SessionID != "" {
			current.SessionID = task.SessionID
		}
		current.UpdatedAt = currentTime()
		current.RecordEvent(source.Actor, source.Command, "spawned", current.Status, current.Status, fmt.Sprintf("runner=%s session_id=%s", runner, current.SessionID))
		return nil
	})
	if err != nil {
		return nil, err
	}

	return task, nil
}
