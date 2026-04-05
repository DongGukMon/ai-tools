# pipemd - Claude Usage Guide

## When to Use

Use `pipemd` when markdown output is technically correct but hard to read in a plain terminal.

- AI answers that contain GFM tables
- mixed prose + code fence output
- terminal logs or previews where browser rendering is too heavy

## Typical Workflow

```bash
# Render piped output
some-command | pipemd

# Inspect a generated markdown file
pipemd output.md

# Keep layout deterministic
some-command | pipemd --width 96 --color never

# Upgrade to the latest release
pipemd upgrade
```

## Help

Run `pipemd --help` for the full command list.

## Notes

- `pipemd` is a standalone CLI, not a Claude Code plugin.
- It is optimized for pipe use and terminal readability, not markdown reformatting.
- ANSI styling is enabled by default. Use `--color never` for plain text or `--color auto` for TTY-aware behavior.
- If the input is already visually wrapped before `pipemd` receives it, table recovery will still be limited.
