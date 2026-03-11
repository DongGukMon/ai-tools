export interface TimelineEvent {
  timestamp: string;
  type: "user" | "assistant" | "tool_call" | "tool_result" | "thinking" | "system";
  role: "user" | "assistant" | "system";
  summary: string;
  content: string;
  toolName?: string;
  toolInput?: string;
  toolResult?: string;
}

export interface Session {
  id: string;
  backend: string;
  model?: string;
  cwd?: string;
  startedAt: string;
  events: TimelineEvent[];
}
