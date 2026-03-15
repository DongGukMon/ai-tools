export interface ToolEntry {
  id: string
  name: string
  category: string
  tagline: string
  description: string
  install: string
  href: string
  accent: string
}

export interface WorkflowScene {
  id: string
  phase: string
  title: string
  summary: string
  you: string
  whip: string
  result: string
  panelTitle: string
  panelLines: string[]
}

export const siteMeta = {
  name: 'ai-tools',
  productName: 'whip',
  origin: 'https://whip.bang9.dev',
  repoURL: 'https://github.com/bang9/ai-tools',
  defaultTitle: 'whip · ai-tools',
  defaultDescription: 'Task Orchestrator for AI Agents. One lead. Many agents. Ship faster. Split complex tasks across parallel AI Agent sessions. Wire dependencies. Watch them converge.',
  ogImagePath: '/og-cover.svg',
}

export const toolCatalog: ToolEntry[] = [
  {
    id: 'whip',
    name: 'whip',
    category: 'Orchestration',
    tagline: 'Lead one run, dispatch many agents.',
    description: 'Task orchestrator for AI agent work. Run single-task work in global, move grouped work through named workspaces, and manage tmux-backed agent sessions.',
    install: '/plugin install whip',
    href: 'https://github.com/bang9/ai-tools/tree/main/whip',
    accent: '#F59E0B',
  },
  {
    id: 'claude-irc',
    name: 'claude-irc',
    category: 'Messaging',
    tagline: 'Inter-session messaging for coordinating AI agents.',
    description: 'Presence, inbox, and direct messaging for multiple AI agent sessions on the same machine.',
    install: '/plugin install claude-irc',
    href: 'https://github.com/bang9/ai-tools/tree/main/claude-irc',
    accent: '#22C55E',
  },
  {
    id: 'redit',
    name: 'redit',
    category: 'Remote editing',
    tagline: 'Edit remote documents with local precision.',
    description: 'A local cache layer for Confluence, GitHub, Notion, and other remote docs that do not support precise partial updates.',
    install: '/plugin install redit',
    href: 'https://github.com/bang9/ai-tools/tree/main/redit',
    accent: '#F97316',
  },
  {
    id: 'vaultkey',
    name: 'vaultkey',
    category: 'Secrets',
    tagline: 'Encrypted secrets with git-backed sync.',
    description: 'AES-256-GCM encrypted secret storage backed by a private repo, designed for local usage and scripted automation.',
    install: '/plugin install vaultkey',
    href: 'https://github.com/bang9/ai-tools/tree/main/vaultkey',
    accent: '#06B6D4',
  },
  {
    id: 'webform',
    name: 'webform',
    category: 'Input collection',
    tagline: 'Turn terminal friction into browser-native forms.',
    description: 'Schema-driven browser forms for collecting structured, multi-field, or sensitive input from users.',
    install: '/plugin install webform',
    href: 'https://github.com/bang9/ai-tools/tree/main/webform',
    accent: '#8B5CF6',
  },
  {
    id: 'rewind',
    name: 'rewind',
    category: 'Development',
    tagline: 'Replay agent sessions as a visual timeline.',
    description: 'Session transcript viewer that exports a self-contained timeline of user messages, assistant responses, tool calls, and thinking events for Claude Code and Codex sessions.',
    install: '/plugin install rewind',
    href: 'https://github.com/bang9/ai-tools/tree/main/rewind',
    accent: '#EC4899',
  },
  {
    id: 'vaultkey-action',
    name: 'vaultkey-action',
    category: 'CI companion',
    tagline: 'Bring vaultkey secrets into GitHub Actions.',
    description: 'Composite action that installs vaultkey, initializes the vault, and exports selected secrets into CI jobs.',
    install: 'uses: bang9/ai-tools/vaultkey-action',
    href: 'https://github.com/bang9/ai-tools/tree/main/vaultkey-action',
    accent: '#EF4444',
  },
]
