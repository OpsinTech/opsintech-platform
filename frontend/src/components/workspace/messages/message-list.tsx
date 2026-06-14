import type { Message } from "@langchain/langgraph-sdk";
import type { BaseStream } from "@langchain/langgraph-sdk/react";
import { SparklesIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import { getAuthToken } from "@/core/auth/auth-api";
import { resolveArtifactURL } from "@/core/artifacts/utils";
import { useI18n } from "@/core/i18n/hooks";
import {
  extractContentFromMessage,
  extractPresentFilesFromMessage,
  extractTextFromMessage,
  groupMessages,
  hasContent,
  hasReasoning,
  hasToolCalls,
} from "@/core/messages/utils";
import { useRehypeSplitWordsIntoSpans } from "@/core/rehype";
import type { Subtask } from "@/core/tasks";
import { useUpdateSubtask } from "@/core/tasks/context";
import type { AgentThreadState } from "@/core/threads";
import { cn } from "@/lib/utils";

import { StreamingIndicator } from "../streaming-indicator";

import { ClarificationBlock } from "./clarification-block";
import { MessageGroup } from "./message-group";
import { MessageListItem } from "./message-list-item";
import { MessageListSkeleton } from "./skeleton";
import { SubtaskCard } from "./subtask-card";
import { SummaryCard } from "./summary-card";

function parseTaskToolResult(result: string) {
  if (result.startsWith("Task Succeeded. Result:")) {
    return {
      status: "completed" as const,
      result: result.split("Task Succeeded. Result:")[1]?.trim(),
    };
  }
  if (result.startsWith("Task failed.")) {
    return {
      status: "failed" as const,
      error: result.split("Task failed.")[1]?.trim(),
    };
  }
  if (result.startsWith("Task timed out")) {
    return {
      status: "timed_out" as const,
      error: result,
    };
  }
  return {
    status: "in_progress" as const,
  };
}

function StreamingInlineStatus({
  isLoading,
  messages,
  className,
}: {
  isLoading: boolean;
  messages: Message[];
  className?: string;
}) {
  const { t } = useI18n();

  const statusText = useMemo(() => {
    if (!isLoading) return null;

    // Find the last AI message to infer current action
    const lastAiMsg = [...messages].reverse().find((m) => m.type === "ai");
    if (!lastAiMsg) {
      return t.messageList.streamingThinking;
    }

    const toolCalls = lastAiMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // No tool calls yet → still "thinking"
      return t.messageList.streamingThinking;
    }

    // Check if any tool call hasn't received a result yet
    const hasPendingToolCalls = toolCalls.some(
      (tc) =>
        tc.id &&
        !messages.find(
          (m) => m.type === "tool" && m.tool_call_id === tc.id,
        ),
    );
    if (hasPendingToolCalls) {
      const lastToolCall = toolCalls.at(-1);
      if (lastToolCall) {
        return t.messageList.streamingUsingTool(lastToolCall.name);
      }
    }

    // All tool calls done, generating final response
    return t.messageList.streamingGenerating;
  }, [isLoading, messages, t]);

  if (!statusText) return null;

  return (
    <div className={cn("flex items-center gap-2 px-4 py-2 animate-in fade-in", className)}>
      <SparklesIcon className="size-3.5 text-primary animate-pulse" />
      <span className="text-xs text-muted-foreground">{statusText}</span>
      <StreamingIndicator size="sm" />
    </div>
  );
}

function PresentFilesBlock({
  filepaths,
  threadId,
  className,
}: {
  filepaths: string[];
  threadId: string;
  className?: string;
}) {
  const artifactToken = getAuthToken() ?? undefined;
  const { t } = useI18n();

  return (
    <div className={cn("rounded-xl border px-3 py-2", className)}>
      <div className="text-muted-foreground mb-2 text-xs">{t.messageList.generatedFiles}</div>
      <ul className="space-y-1">
        {filepaths.map((filepath) => {
          const filename = filepath.split("/").filter(Boolean).pop() ?? filepath;
          const href = resolveArtifactURL(filepath, threadId, artifactToken);
          return (
            <li key={filepath} className="text-sm">
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {filename}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MessageList({
  className,
  threadId: _threadId,
  thread,
  paddingBottom = 160,
  availableAttachmentKeys,
  onRetryHumanMessage,
  onSubmitClarification,
}: {
  className?: string;
  threadId: string;
  thread: BaseStream<AgentThreadState>;
  paddingBottom?: number;
  availableAttachmentKeys?: Set<string>;
  onRetryHumanMessage?: (message: Message) => void;
  onSubmitClarification?: (text: string) => void;
}) {
  const { t } = useI18n();
  const rehypePlugins = useRehypeSplitWordsIntoSpans(thread.isLoading);
  const updateSubtask = useUpdateSubtask();
  const messages = thread.messages;

  useEffect(() => {
    for (const message of messages) {
      if (message.type === "ai") {
        for (const toolCall of message.tool_calls ?? []) {
          if (toolCall.name === "task" && toolCall.id) {
            const task: Subtask = {
              id: toolCall.id,
              subagent_type: toolCall.args.subagent_type,
              description: toolCall.args.description,
              prompt: toolCall.args.prompt,
              status: "in_progress",
            };
            updateSubtask(task);
          }
        }
      }

      if (
        message.type === "tool" &&
        message.tool_call_id &&
        message.name === "task"
      ) {
        const parsed = parseTaskToolResult(extractTextFromMessage(message));
        updateSubtask({
          id: message.tool_call_id,
          ...parsed,
        });
      }
    }
  }, [messages, updateSubtask]);

  if (thread.isThreadLoading && messages.length === 0) {
    return <MessageListSkeleton />;
  }
  return (
    <Conversation
      className={cn("flex size-full flex-col justify-center", className)}
    >
      <ConversationContent className="mx-auto w-full max-w-5xl gap-2 pt-12">
        {groupMessages(messages, (group) => {
          if (group.type === "summary") {
            const message = group.messages[0];
            if (message) {
              return (
                <SummaryCard
                  key={group.id}
                  message={message}
                  className="mb-3"
                />
              );
            }
            return null;
          } else if (group.type === "human" || group.type === "assistant") {
            return group.messages.map((msg) => {
              const hasFollowingSteps =
                msg.type === "ai" &&
                (hasToolCalls(msg) || hasReasoning(msg));
              return (
                <MessageListItem
                  key={`${group.id}/${msg.id}`}
                  message={msg}
                  isLoading={thread.isLoading}
                  availableAttachmentKeys={availableAttachmentKeys}
                  onRetry={onRetryHumanMessage}
                  className={hasFollowingSteps ? "mb-1" : undefined}
                />
              );
            });
          } else if (group.type === "assistant:clarification") {
            const message = group.messages[0];
            if (message && hasContent(message)) {
              return (
                <ClarificationBlock
                  key={group.id}
                  className="ml-9 mb-3 max-w-[85%]"
                  content={extractContentFromMessage(message)}
                  isLoading={thread.isLoading}
                  rehypePlugins={rehypePlugins}
                  onSubmitOption={onSubmitClarification}
                />
              );
            }
            return null;
          } else if (group.type === "assistant:present-files") {
            const message = group.messages[0];
            if (message?.type !== "ai") {
              return null;
            }

            const filepaths = extractPresentFilesFromMessage(message);
            if (filepaths.length === 0) {
              return null;
            }

            return (
              <PresentFilesBlock
                key={group.id}
                className="ml-9 mb-3 max-w-[85%]"
                filepaths={filepaths}
                threadId={_threadId}
              />
            );
          } else if (group.type === "assistant:subagent") {
            // Render only the parent reasoning inside the subagent group.
            // Subtask execution cards are rendered below the streaming status
            // so the status ("正在使用 task...") appears above the tasks.
            const results: React.ReactNode[] = [];
            for (const message of group.messages) {
              if (message.type === "ai" && hasReasoning(message)) {
                results.push(
                  <MessageGroup
                    key={"thinking-group-" + message.id}
                    messages={[message]}
                    isLoading={thread.isLoading}
                    variant="secondary"
                  />,
                );
              }
            }
            if (results.length > 0) {
              return (
                <div
                  key={"subtask-group-" + group.id}
                  className="relative z-1 flex flex-col gap-1 mb-3"
                >
                  {results}
                </div>
              );
            }
            // Fallback: show a minimal block for subagent messages with no reasoning
            // so they don't silently disappear when the AI only issues task tool calls.
            const message = group.messages[0];
            if (message?.type === "ai") {
              return (
                <div
                  key={"subtask-fallback-" + group.id}
                  className="ml-9 mb-3 flex items-center gap-2 text-muted-foreground text-xs py-1"
                >
                  <SparklesIcon className="size-3.5 shrink-0 opacity-60" />
                  <span>
                    {t.subtasks?.in_progress ?? "Running subtasks..."}
                  </span>
                </div>
              );
            }
            return null;
          }
            
          return (
            <MessageGroup
              key={"group-" + group.id}
              className="mb-3"
              messages={group.messages}
              isLoading={thread.isLoading}
            />
          );
          })}
        <StreamingInlineStatus
          isLoading={thread.isLoading}
          messages={messages}
          className="ml-9"
        />
        {thread.isLoading && (() => {
          const activeTaskIds = new Set<string>();
          for (const msg of messages) {
            if (msg.type === "ai") {
              for (const tc of msg.tool_calls ?? []) {
                if (tc.name === "task" && tc.id) {
                  activeTaskIds.add(tc.id);
                }
              }
            }
          }
          if (activeTaskIds.size === 0) return null;
          return (
            <div className="flex flex-col gap-1 mb-3 ml-9">
              <div className="text-muted-foreground flex items-center gap-1.5 pt-1 pb-1 pl-9 text-[11px] font-semibold uppercase tracking-widest">
                {t.subtasks.executing(activeTaskIds.size)}
              </div>
              {Array.from(activeTaskIds).map((taskId) => (
                <SubtaskCard
                  key={"task-group-" + taskId}
                  taskId={taskId}
                  isLoading={thread.isLoading}
                />
              ))}
            </div>
          );
        })()}
        <div style={{ height: `${paddingBottom}px` }} />
      </ConversationContent>
    </Conversation>
  );
}
