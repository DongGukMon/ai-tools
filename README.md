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

**MCP Server & Skill** (via Claude Code Plugin)

```bash
/plugin marketplace add bang9/ai-tools
/plugin install redit
```

### [vaultkey](./vaultkey)

Encrypted secrets manager backed by a private Git repo. AES-256-GCM encryption, synced across machines via git.

#### Installation

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/vaultkey/install.sh | bash
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

## License

MIT
