# redit - Claude Usage Guide

## When to Use

Use `redit` when you need to edit source content locally and push back one final result.

- Large documents where partial edits are safer than full regeneration
- Remote systems that do not support patch-style updates
- Multi-step edits where you want diff/status/reset before committing

## Typical Workflow

```bash
# 1. Fetch or receive current content
content="<current document content>"

# 2. Initialize local cache
path=$(echo "$content" | redit init "confluence:12345")

# 3. Edit the working file with precise partial changes
# Edit <path>

# 4. Review before committing
redit diff "confluence:12345"
redit status "confluence:12345"

# 5. Push final content back to the source system
final=$(redit read "confluence:12345")

# 6. Clean up
redit drop "confluence:12345"
```

## Help

Run `redit --help` for the full command list.

## Notes

- Use `service:id` keys such as `confluence:12345` or `notion:page-abc`.
- If you need cache separation by version, use `service:id:version`.
- Always `drop` after the edit cycle is complete.
