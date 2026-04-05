<div align="center">

<pre>
⬜⬜⬜⬜⬛⬛⬛⬛⬛⬛⬛⬛⬜⬜⬜⬜
⬜⬜⬛⬛🟩🟩🟩🟩🟩🟩🟩🟩⬛⬛⬜⬜
⬛⬛🟩🟩⬛⬛⬛⬛⬛⬛⬛⬛🟩🟩⬛⬛
⬛🟩🟩⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛🟩🟩⬛
⬛🟩🟩🟩⬛⬛⬛⬛⬛⬛⬛⬛🟩🟩🟩⬛
⬛🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩⬛
⬜⬛⬛🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩⬛⬛⬜
⬜⬛🟩⬛⬛🟩🟩🟩🟩🟩🟩⬛⬛🟩⬛⬜
⬜⬛🟩🟩🟩⬛⬛⬛⬛⬛⬛🟩🟩🟩⬛⬜
⬜⬛🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩⬛⬜
⬜⬛🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩⬛⬜
⬜⬛🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩⬛⬜
⬜⬛🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩⬛⬜
⬜⬛⬛🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩⬛⬛⬜
⬜⬜⬜⬛⬛🟩🟩🟩🟩🟩🟩⬛⬛⬜⬜⬜
⬜⬜⬜⬜⬜⬛⬛⬛⬛⬛⬛⬜⬜⬜⬜⬜

██████╗ ██╗██████╗ ███████╗███╗   ███╗██████╗
 ██╔══██╗██║██╔══██╗██╔════╝████╗ ████║██╔══██╗
 ██████╔╝██║██████╔╝█████╗  ██╔████╔██║██║  ██║
 ██╔═══╝ ██║██╔═══╝ ██╔══╝  ██║╚██╔╝██║██║  ██║
 ██║     ██║██║     ███████╗██║ ╚═╝ ██║██████╔╝
╚═╝     ╚═╝╚═╝     ╚══════╝╚═╝     ╚═╝╚═════╝
markdown renderer for AI pipes
</pre>

**Fast markdown-to-terminal renderer for pipe-heavy AI workflows.**

`stdin` | box tables | ANSI emphasis | code blocks | width-aware wrapping

---

</div>

`pipemd` reads markdown from stdin or files and renders it for terminal output with:

- box-drawn tables
- ANSI inline emphasis for bold, italic, bold+italic, and inline code
- fenced code block syntax highlighting
- width-aware wrapping for paragraphs and table cells
- ANSI styling enabled by default (`--color never` for plain text, `--color auto` for TTY-aware behavior)

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/pipemd/install.sh | bash
```

## AI Agent Setup

If you want another AI agent to install and configure `pipemd` automatically, paste this prompt as-is.

Note: the Codex instructions file is `~/.codex/AGENTS.md`, not `~/.codex/agents.md`.

```text
1. Run this install command:
   curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/pipemd/install.sh | bash

2. Append the following instruction to `~/.codex/AGENTS.md` only if it is missing:

   Instruction to append:
   When you need to present Markdown content, especially tables or code blocks, pipe it through `pipemd` first and use the rendered output.
```

## Usage

```bash
# Pipe AI output directly
codex ... | pipemd

# Render a markdown file
pipemd README.md

# Force a narrower layout
cat answer.md | pipemd --width 88

# Disable ANSI styling but keep table rendering
cat answer.md | pipemd --color never

# Use TTY-aware color detection instead of the default always-on ANSI
cat answer.md | pipemd --color auto

# Upgrade to the latest release
pipemd upgrade
```

## Help

Run `pipemd --help` for the full CLI.
