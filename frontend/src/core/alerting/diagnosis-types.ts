/**
 * Diagnosis SSE Message Types — AG-UI Protocol
 *
 * Implements the AG-UI (Agent-User Interaction Protocol) standard for
 * incident diagnosis streaming.
 * Ref: https://github.com/ag-ui-protocol/ag-ui
 */

// ---------------------------------------------------------------------------
// AG-UI event type constants
// ---------------------------------------------------------------------------

// Lifecycle
export const AGUI_RUN_STARTED = "RUN_STARTED" as const;
export const AGUI_RUN_FINISHED = "RUN_FINISHED" as const;
export const AGUI_RUN_ERROR = "RUN_ERROR" as const;

// Text messages
export const AGUI_TEXT_MESSAGE_START = "TEXT_MESSAGE_START" as const;
export const AGUI_TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT" as const;
export const AGUI_TEXT_MESSAGE_END = "TEXT_MESSAGE_END" as const;

// Thinking
export const AGUI_THINKING_START = "THINKING_START" as const;
export const AGUI_THINKING_CONTENT = "THINKING_CONTENT" as const;
export const AGUI_THINKING_END = "THINKING_END" as const;

// Tool calls
export const AGUI_TOOL_CALL_START = "TOOL_CALL_START" as const;
export const AGUI_TOOL_CALL_ARGS = "TOOL_CALL_ARGS" as const;
export const AGUI_TOOL_CALL_END = "TOOL_CALL_END" as const;
export const AGUI_TOOL_CALL_RESULT = "TOOL_CALL_RESULT" as const;

// Steps
export const AGUI_STEP_STARTED = "STEP_STARTED" as const;
export const AGUI_STEP_FINISHED = "STEP_FINISHED" as const;

// Clarification / HITL (Human-In-The-Loop)
export const AGUI_CLARIFICATION_REQUEST = "CLARIFICATION_REQUEST" as const;
export const AGUI_CLARIFICATION_RESPONSE = "CLARIFICATION_RESPONSE" as const;

// Legacy — kept for backward compat with old constants referenced elsewhere
export const MSG_THREAD = "thread" as const;
export const MSG_THINKING = "thinking" as const;
export const MSG_TOOL_CALL = "tool_call" as const;
export const MSG_TOOL_RESULT = "tool_result" as const;
export const MSG_STEP_START = "step_start" as const;
export const MSG_STEP_COMPLETE = "step_complete" as const;
export const MSG_STEP_ERROR = "step_error" as const;
export const MSG_TOKEN = "token" as const;
export const MSG_CONCLUSION = "conclusion" as const;
export const MSG_DONE = "done" as const;
export const MSG_ERROR = "error" as const;

export type DiagnosisMessageType = string;

// ---------------------------------------------------------------------------
// AG-UI message interfaces
// ---------------------------------------------------------------------------

export interface AguiRunStarted {
  type: typeof AGUI_RUN_STARTED;
  threadId: string;
  agentName: string;
}

export interface AguiRunFinished {
  type: typeof AGUI_RUN_FINISHED;
}

export interface AguiRunError {
  type: typeof AGUI_RUN_ERROR;
  message: string;
}

export interface AguiTextMessageStart {
  type: typeof AGUI_TEXT_MESSAGE_START;
  messageId: string;
  role: string;
}

export interface AguiTextMessageContent {
  type: typeof AGUI_TEXT_MESSAGE_CONTENT;
  messageId: string;
  delta: string;
}

export interface AguiTextMessageEnd {
  type: typeof AGUI_TEXT_MESSAGE_END;
  messageId: string;
}

export interface AguiThinkingStart {
  type: typeof AGUI_THINKING_START;
  messageId: string;
}

export interface AguiThinkingContent {
  type: typeof AGUI_THINKING_CONTENT;
  messageId: string;
  delta: string;
}

export interface AguiThinkingEnd {
  type: typeof AGUI_THINKING_END;
  messageId: string;
}

export interface AguiToolCallStart {
  type: typeof AGUI_TOOL_CALL_START;
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

export interface AguiToolCallArgs {
  type: typeof AGUI_TOOL_CALL_ARGS;
  toolCallId: string;
  delta: string;
}

export interface AguiToolCallEnd {
  type: typeof AGUI_TOOL_CALL_END;
  toolCallId: string;
}

export interface AguiToolCallResult {
  type: typeof AGUI_TOOL_CALL_RESULT;
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface AguiStepStarted {
  type: typeof AGUI_STEP_STARTED;
  stepName: string;
}

export interface AguiStepFinished {
  type: typeof AGUI_STEP_FINISHED;
  stepName: string;
}

export interface AguiClarificationRequest {
  type: typeof AGUI_CLARIFICATION_REQUEST;
  messageId: string;
  question: string;
  options?: string[];
}

export interface AguiClarificationResponse {
  type: typeof AGUI_CLARIFICATION_RESPONSE;
  messageId: string;
  response: string;
}

export type DiagnosisMessage =
  | AguiRunStarted
  | AguiRunFinished
  | AguiRunError
  | AguiTextMessageStart
  | AguiTextMessageContent
  | AguiTextMessageEnd
  | AguiThinkingStart
  | AguiThinkingContent
  | AguiThinkingEnd
  | AguiToolCallStart
  | AguiToolCallArgs
  | AguiToolCallEnd
  | AguiToolCallResult
  | AguiStepStarted
  | AguiStepFinished
  | AguiClarificationRequest
  | AguiClarificationResponse;

// ---------------------------------------------------------------------------
// Diagnosis event types for the UI
// ---------------------------------------------------------------------------

export interface DiagnosisStep {
  id: number;
  label: string;
  status: "pending" | "running" | "done" | "error";
}

export interface DiagnosisToolCall {
  callId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  isComplete: boolean;
  startedAt?: number;
  completedAt?: number;
  parentMessageId?: string;
}

export interface DiagnosisThinkingBlock {
  id: string;
  content: string;
  timestamp: number;
}

export interface DiagnosisClarification {
  messageId: string;
  question: string;
  options?: string[];
  response?: string;
  isAnswered: boolean;
}

// ---------------------------------------------------------------------------
// SSE Parser
// ---------------------------------------------------------------------------

export function parseSSELine(line: string): DiagnosisMessage | null {
  if (!line.startsWith("data: ")) return null;
  try {
    const data = JSON.parse(line.slice(6));
    if (data && typeof data.type === "string") {
      return data as DiagnosisMessage;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

// ---------------------------------------------------------------------------
// State manager for diagnosis stream
// ---------------------------------------------------------------------------

export class DiagnosisStreamState {
  steps: DiagnosisStep[] = [];
  toolCalls: Map<string, DiagnosisToolCall> = new Map();
  thinkingBlocks: DiagnosisThinkingBlock[] = [];
  clarifications: DiagnosisClarification[] = [];
  textBuffer = "";
  threadId: string | null = null;
  agentName: string | null = null;
  isDone = false;
  error: string | null = null;
  isWaitingForClarification = false;

  private thinkingIdCounter = 0;
  private stepIdCounter = 0;
  // Track which step names map to which IDs for lookup
  private stepNameToId: Map<string, number> = new Map();

  processMessage(msg: DiagnosisMessage): void {
    switch (msg.type) {
      case AGUI_RUN_STARTED:
        this.threadId = msg.threadId;
        this.agentName = msg.agentName;
        break;

      case AGUI_RUN_FINISHED:
        this.isDone = true;
        this.isWaitingForClarification = false;
        break;

      case AGUI_RUN_ERROR:
        this.error = msg.message;
        this.isWaitingForClarification = false;
        break;

      // --- Text messages ---
      case AGUI_TEXT_MESSAGE_CONTENT:
        this.textBuffer += msg.delta;
        break;

      // --- Thinking ---
      case AGUI_THINKING_START:
        this.thinkingBlocks.push({
          id: msg.messageId || `thinking-${++this.thinkingIdCounter}`,
          content: "",
          timestamp: Date.now(),
        });
        break;

      case AGUI_THINKING_CONTENT: {
        const block = this.thinkingBlocks.find((b) => b.id === msg.messageId);
        if (block) {
          block.content += msg.delta;
        } else {
          this.thinkingBlocks.push({
            id: msg.messageId || `thinking-${++this.thinkingIdCounter}`,
            content: msg.delta,
            timestamp: Date.now(),
          });
        }
        break;
      }

      // --- Tool calls ---
      case AGUI_TOOL_CALL_START:
        this.toolCalls.set(msg.toolCallId, {
          callId: msg.toolCallId,
          toolName: msg.toolCallName,
          toolArgs: {},
          isComplete: false,
          startedAt: Date.now(),
          parentMessageId: msg.parentMessageId,
        });
        break;

      case AGUI_TOOL_CALL_ARGS: {
        const tc = this.toolCalls.get(msg.toolCallId);
        if (tc) {
          try {
            // Accumulate streaming JSON args
            const parsed = JSON.parse(msg.delta);
            if (typeof parsed === "object" && parsed !== null) {
              Object.assign(tc.toolArgs, parsed);
            }
          } catch {
            // Partial JSON chunk — store as raw string for display
            tc.toolArgs = tc.toolArgs || {};
          }
        }
        break;
      }

      case AGUI_TOOL_CALL_END: {
        const tc = this.toolCalls.get(msg.toolCallId);
        if (tc) {
          tc.isComplete = true;
          if (!tc.completedAt) {
            tc.completedAt = Date.now();
          }
        }
        break;
      }

      case AGUI_TOOL_CALL_RESULT: {
        const tc = this.toolCalls.get(msg.toolCallId);
        if (tc) {
          tc.result = msg.content;
          tc.isError = msg.isError || false;
          tc.isComplete = true;
          if (!tc.completedAt) {
            tc.completedAt = Date.now();
          }
        } else {
          // Result arrived before start — create a full entry
          this.toolCalls.set(msg.toolCallId, {
            callId: msg.toolCallId,
            toolName: "",
            toolArgs: {},
            result: msg.content,
            isError: msg.isError || false,
            isComplete: true,
            completedAt: Date.now(),
          });
        }
        break;
      }

      // --- Steps ---
      case AGUI_STEP_STARTED: {
        const existingId = this.stepNameToId.get(msg.stepName);
        if (existingId !== undefined) {
          const step = this.steps.find((s) => s.id === existingId);
          if (step) step.status = "running";
        } else {
          const newId = ++this.stepIdCounter;
          this.stepNameToId.set(msg.stepName, newId);
          this.steps.push({
            id: newId,
            label: msg.stepName,
            status: "running",
          });
        }
        break;
      }

      case AGUI_STEP_FINISHED: {
        const stepId = this.stepNameToId.get(msg.stepName);
        if (stepId !== undefined) {
          const step = this.steps.find((s) => s.id === stepId);
          if (step) step.status = "done";
        }
        break;
      }

      // --- Clarification / HITL ---
      case AGUI_CLARIFICATION_REQUEST: {
        this.isWaitingForClarification = true;
        const existing = this.clarifications.find((c) => c.messageId === msg.messageId);
        if (!existing) {
          this.clarifications.push({
            messageId: msg.messageId,
            question: msg.question,
            options: msg.options,
            isAnswered: false,
          });
        }
        break;
      }

      case AGUI_CLARIFICATION_RESPONSE: {
        const clarification = this.clarifications.find((c) => c.messageId === msg.messageId);
        if (clarification) {
          clarification.response = msg.response;
          clarification.isAnswered = true;
        }
        this.isWaitingForClarification = false;
        break;
      }
    }
  }

  getSteps(): DiagnosisStep[] {
    return this.steps;
  }

  getToolCalls(): DiagnosisToolCall[] {
    return Array.from(this.toolCalls.values());
  }

  getThinkingBlocks(): DiagnosisThinkingBlock[] {
    return this.thinkingBlocks;
  }

  getClarifications(): DiagnosisClarification[] {
    return this.clarifications;
  }

  getPendingClarification(): DiagnosisClarification | null {
    return this.clarifications.find((c) => !c.isAnswered) || null;
  }

  getTextContent(): string {
    return this.textBuffer;
  }

  getRunningToolCall(): DiagnosisToolCall | null {
    for (const tc of this.toolCalls.values()) {
      if (!tc.isComplete) return tc;
    }
    return null;
  }
}
