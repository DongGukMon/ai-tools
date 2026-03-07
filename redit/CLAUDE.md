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

# 4. Review and ask whether further changes are needed
redit diff "confluence:12345"
redit status "confluence:12345"

# 5. If more edits are requested soon, keep using the same key

# 6. Only after final confirmation, push the final content
final=$(redit read "confluence:12345")

# 7. Clean up after the final push
redit drop "confluence:12345"
```

## Help

Run `redit --help` for the full command list.

## Notes

- Use `service:id` keys such as `confluence:12345` or `notion:page-abc`.
- If you need cache separation by version, use `service:id:version`.
- Ask for confirmation after reviewing `redit diff`.
- Reuse the same key for short follow-up edits.
- Only push remote changes and `drop` after final confirmation.
- Skip the remote update if `redit status` is `clean`.
