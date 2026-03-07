# whip - Claude Usage Guide

## When to Use

Use `whip` when one Claude session should act as a lead and dispatch work to other Claude sessions.

- Split a larger task into parallel sub-tasks
- Track ownership, status, and dependencies between tasks
- Resume or retry agent sessions with preserved context
- Coordinate a team through `claude-irc`

For ad hoc execution, use the CLI directly. For guided planning and dispatch, prefer `/whip-plan` and `/whip-start`.

## Typical Workflow

```bash
# 1. Join IRC as the lead
claude-irc join whip-master

# 2. Create tasks
whip create "Auth module" --difficulty medium --desc "Implement JWT auth"
whip create "Deploy" --difficulty easy --desc "Deploy after auth"

# 3. Wire dependencies
whip dep <deploy-id> --after <auth-id>

# 4. Assign root tasks
whip assign <auth-id> --master-irc whip-master

# 5. Monitor progress
whip list
whip dashboard
claude-irc inbox
```

## Help

Run `whip --help` for the full command list. For guided usage, see `/whip-plan` and `/whip-start`.

## Notes

- `assign` only works for tasks in `created` status whose dependencies are already complete.
- Dependent tasks auto-assign when prerequisites become `completed`.
- `tmux` is the preferred runner because it allows dashboard capture and attach.
