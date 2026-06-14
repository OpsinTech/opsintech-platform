import type { AIMessage } from "@langchain/langgraph-sdk";

export type SubtaskStatus = "pending" | "in_progress" | "completed" | "failed" | "timed_out";

export interface Subtask {
  id: string;
  status: SubtaskStatus;
  subagent_type: string;
  description: string;
  latestMessage?: AIMessage;
  prompt: string;
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  timeoutSeconds?: number;
}
