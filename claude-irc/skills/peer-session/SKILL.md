---
name: peer-session
description: Start an inter-session communication channel with other Claude Code agents working on the same project
argument-hint: "<name> [description of your work area]"
user-invocable: true
allowed-tools: Bash
---

# Inter-Session Communication Setup

## Step 1: Join the channel

Run `claude-irc join <name>` using the name provided by the user.

```bash
claude-irc join <name>
```

The name should be short and describe the work area (e.g., `server`, `client`, `api`, `frontend`).

## Step 2: Check who's online

```bash
claude-irc who
```

## Step 3: Read existing context from other peers

For each online peer, check their published topics:

```bash
claude-irc board <peer>
```

If there are topics, read the latest ones to understand what they've been working on.

## Step 4: Introduce yourself

Send a brief message to online peers describing what you're working on:

```bash
claude-irc msg <peer> "Joined as <name>. Working on <brief description>."
```

## Step 5: Publish your initial context (if applicable)

If you already have relevant context to share (API contracts, schemas, architecture decisions), publish it:

```bash
claude-irc topic "<title>" <<'EOF'
<structured context>
EOF
```

## Done

You are now connected. From here:
- Incoming messages will appear automatically via `[claude-irc]` prefixed lines before each tool use
- When you see a message, acknowledge it and incorporate the information into your work
- Send messages when you make changes that affect other sessions
- Publish topics when you establish interfaces, contracts, or important decisions
