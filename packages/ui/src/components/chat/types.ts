export type MessageRole = 'user' | 'assistant';

export interface ToolCallData {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'complete';
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallData[];
}
