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

export type TabId = "timeline" | "stats" | "analysis";

// Stats types
export interface TimeAllocation {
  userInput: number;
  thinking: number;
  toolExecution: number;
  idle: number;
}

export interface ToolFailure {
  index: number;
  toolName: string;
  errorSnippet: string;
}

export interface RetryHotspot {
  toolName: string;
  startIndex: number;
  count: number;
  targets: string[];
}

export interface FileHeat {
  filePath: string;
  count: number;
  percentage: number;
}

export type PromptSignalType = "retry" | "spiral" | "abandon";
export type PromptSignalConfidence = "low" | "medium" | "high";

export interface PromptSignal {
  type: PromptSignalType;
  confidence: PromptSignalConfidence;
  startIndex: number;
  endIndex: number;
  description: string;
  promptSnippet: string;
}

export interface SessionStats {
  timeAllocation: TimeAllocation;
  toolFailures: ToolFailure[];
  retryHotspots: RetryHotspot[];
  fileHeatmap: FileHeat[];
  promptSignals: PromptSignal[];
}

// Analysis types (AI-generated)
export interface AnalysisData {
  generatedAt: string;
  model: string;
  promptReviews: PromptReview[];
  strategyCritique: StrategyCritique;
  keyDecisions: KeyDecision[];
  takeaways: string[];
}

export interface PromptReview {
  eventIndex: number;
  promptSnippet: string;
  quality: "good" | "fair" | "poor";
  feedback: string;
  suggestion?: string;
}

export interface StrategyCritique {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  alternativeApproach?: string;
}

export interface KeyDecision {
  eventIndex: number;
  description: string;
  impact: "positive" | "neutral" | "negative";
  reasoning: string;
}
