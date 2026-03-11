# ai-tools

A collection of tools for Claude Code to operate more efficiently.

## Tools

### [redit](./redit)

A local cache layer for editing remote documents (Confluence, Notion, etc.).

#### Installation

**CLI**

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/redit/install.sh | bash
```

**Skill** (via Claude Code Plugin)

```bash
/plugin marketplace add bang9/ai-tools
/plugin install redit
```

### [vaultkey](./vaultkey)

Encrypted secrets manager backed by a private Git repo. AES-256-GCM encryption, synced across machines via git.

#### Installation

**CLI**

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/vaultkey/install.sh | bash
```

**Plugin** (via Claude Code Plugin)

```bash
/plugin marketplace add bang9/ai-tools
/plugin install vaultkey
```

### [claude-irc](./claude-irc)

IRC-inspired inter-session communication for Claude Code agents. Enable multiple sessions working in the same repo to exchange messages, share context, and coordinate in real-time.

#### Installation

**CLI**

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/claude-irc/install.sh | bash
```

**Plugin** (via Claude Code Plugin)

```bash
/plugin marketplace add bang9/ai-tools
/plugin install claude-irc
```

### [webform](./webform)

Dynamic web form for collecting structured data from users. AI generates a compact schema, opens a browser form, and receives the submitted data as JSON.

#### Installation

**CLI**

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/webform/install.sh | bash
```

**Plugin** (via Claude Code Plugin)

```bash
/plugin marketplace add bang9/ai-tools
/plugin install webform
```

### [rewind](./rewind)

Session transcript timeline viewer for Claude Code and Codex agent sessions. Opens a visual timeline in the browser showing user messages, assistant responses, tool calls, and thinking events.

#### Installation

**CLI**

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/rewind/install.sh | bash
```

**Plugin** (via Claude Code Plugin)

```bash
/plugin marketplace add bang9/ai-tools
/plugin install rewind
```

### [whip](./whip)

Task orchestrator for Claude Code. Run single-task work in `global`, run stacked work in a named `workspace`, and manage multiple Claude Code sessions via tmux with inter-session communication through `claude-irc`. Includes a TUI dashboard, web dashboard with real-time terminal view, and remote mode for headless operation.

#### Installation

**CLI**

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/whip/install.sh | bash
```

**Plugin** (via Claude Code Plugin)

```bash
/plugin marketplace add bang9/ai-tools
/plugin install whip
```

## License

MIT
