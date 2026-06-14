import type { AIMessage, Message } from "@langchain/langgraph-sdk";

import type { UploadedDerivedFile, UploadedFileInfo } from "@/core/uploads";

interface GenericMessageGroup<T = string> {
  type: T;
  id: string | undefined;
  messages: Message[];
}

interface HumanMessageGroup extends GenericMessageGroup<"human"> {}

interface SummaryMessageGroup extends GenericMessageGroup<"summary"> {}

interface AssistantProcessingGroup extends GenericMessageGroup<"assistant:processing"> {}

interface AssistantMessageGroup extends GenericMessageGroup<"assistant"> {}

interface AssistantPresentFilesGroup extends GenericMessageGroup<"assistant:present-files"> {}

interface AssistantClarificationGroup extends GenericMessageGroup<"assistant:clarification"> {}

interface AssistantSubagentGroup extends GenericMessageGroup<"assistant:subagent"> {}

type MessageGroup =
  | HumanMessageGroup
  | SummaryMessageGroup
  | AssistantProcessingGroup
  | AssistantMessageGroup
  | AssistantPresentFilesGroup
  | AssistantClarificationGroup
  | AssistantSubagentGroup;

export function groupMessages<T>(
  messages: Message[],
  mapper: (group: MessageGroup) => T,
): T[] {
  if (messages.length === 0) {
    return [];
  }

  const groups: MessageGroup[] = [];

  // Returns the nearest previous in-flight processing group that can
  // accept tool messages. We intentionally skip terminal groups like
  // human/assistant/clarification while walking backward.
  function lastOpenGroup() {
    for (let i = groups.length - 1; i >= 0; i -= 1) {
      const group = groups[i];
      if (
        group &&
        group.type !== "human" &&
        group.type !== "assistant" &&
        group.type !== "assistant:clarification" &&
        group.type !== "assistant:present-files"
      ) {
        return group;
      }
    }
    return null;
  }

  for (const message of messages) {
    if (message.name === "todo_reminder") {
      continue;
    }

    if (message.type === "human") {
      // Check if this is a conversation summary message
      if (isSummaryMessage(message)) {
        groups.push({ id: message.id, type: "summary", messages: [message] });
      } else {
        groups.push({ id: message.id, type: "human", messages: [message] });
      }
      continue;
    }

    if (message.type === "tool") {
      if (isClarificationToolMessage(message)) {
        // Add to the preceding processing group to preserve tool-call association,
        // then also open a standalone clarification group for prominent display.
        lastOpenGroup()?.messages.push(message);
        groups.push({
          id: message.id,
          type: "assistant:clarification",
          messages: [message],
        });
      } else {
        const open = lastOpenGroup();
        if (open) {
          open.messages.push(message);
        } else {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "Unexpected tool message outside a processing group",
              message,
            );
          }
        }
      }
      continue;
    }

    if (message.type === "ai") {
      if (hasPresentFiles(message)) {
        groups.push({
          id: message.id,
          type: "assistant:present-files",
          messages: [message],
        });
      } else if (hasSubagent(message)) {
        groups.push({
          id: message.id,
          type: "assistant:subagent",
          messages: [message],
        });
      }
      
      // Push content FIRST so it appears above tool calls in the UI timeline
      if (hasContent(message) && !hasPresentFiles(message)) {
        groups.push({ id: message.id, type: "assistant", messages: [message] });
      }

      if (hasReasoning(message) || hasToolCalls(message)) {
        const lastGroup = groups[groups.length - 1];
        // Accumulate consecutive intermediate AI messages into one processing group.
        // We only append to the last group if it's processing. 
        if (lastGroup?.type !== "assistant:processing") {
          groups.push({
            id: message.id,
            type: "assistant:processing",
            messages: [message],
          });
        } else {
          lastGroup.messages.push(message);
        }
      }
    }
  }

  return groups
    .map(mapper)
    .filter((result) => result !== undefined && result !== null) as T[];
}

export function extractTextFromMessage(message: Message) {
  if (typeof message.content === "string") {
    return splitInlineReasoningFromAIMessage(message)?.content ?? message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((content) => (content.type === "text" ? content.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

const THINK_TAG_RE = /<think>\s*([\s\S]*?)\s*<\/think>/g;

function splitInlineReasoning(content: string) {
  const reasoningParts: string[] = [];
  const cleaned = content
    .replace(THINK_TAG_RE, (_, reasoning: string) => {
      const normalized = reasoning.trim();
      if (normalized) {
        reasoningParts.push(normalized);
      }
      return "";
    })
    .trim();

  return {
    content: cleaned,
    reasoning: reasoningParts.length > 0 ? reasoningParts.join("\n\n") : null,
  };
}

function splitInlineReasoningFromAIMessage(message: Message) {
  if (message.type !== "ai" || typeof message.content !== "string") {
    return null;
  }
  return splitInlineReasoning(message.content);
}

export function extractContentFromMessage(message: Message) {
  if (typeof message.content === "string") {
    return splitInlineReasoningFromAIMessage(message)?.content ?? message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((content) => {
        switch (content.type) {
          case "text":
            return content.text;
          case "image_url":
            const imageURL = extractURLFromImageURLContent(content.image_url);
            return `![image](${imageURL})`;
          default:
            return "";
        }
      })
      .join("\n")
      .trim();
  }
  return "";
}

export function extractReasoningContentFromMessage(message: Message) {
  if (message.type !== "ai") {
    return null;
  }
  if (
    message.additional_kwargs &&
    "reasoning_content" in message.additional_kwargs
  ) {
    return message.additional_kwargs.reasoning_content as string | null;
  }
  if (Array.isArray(message.content)) {
    const part = message.content[0];
    if (part && "thinking" in part) {
      return part.thinking as string;
    }
  }
  if (typeof message.content === "string") {
    return splitInlineReasoning(message.content).reasoning;
  }
  return null;
}

export function removeReasoningContentFromMessage(message: Message) {
  if (message.type !== "ai" || !message.additional_kwargs) {
    return;
  }
  delete message.additional_kwargs.reasoning_content;
}

export function extractURLFromImageURLContent(
  content:
    | string
    | {
        url: string;
      },
) {
  if (typeof content === "string") {
    return content;
  }
  return content.url;
}

export function hasContent(message: Message) {
  if (typeof message.content === "string") {
    return (
      splitInlineReasoningFromAIMessage(message)?.content ?? message.content.trim()
    ).length > 0;
  }
  if (Array.isArray(message.content)) {
    return message.content.length > 0;
  }
  return false;
}

export function hasReasoning(message: Message) {
  if (message.type !== "ai") {
    return false;
  }
  if (typeof message.additional_kwargs?.reasoning_content === "string") {
    return true;
  }
  if (Array.isArray(message.content)) {
    const part = message.content[0];
    // Compatible with the Anthropic gateway
    return (part as unknown as { type: "thinking" })?.type === "thinking";
  }
  if (typeof message.content === "string") {
    return splitInlineReasoning(message.content).reasoning !== null;
  }
  return false;
}

export function hasToolCalls(message: Message) {
  return (
    message.type === "ai" && message.tool_calls && message.tool_calls.length > 0
  );
}

export function hasPresentFiles(message: Message) {
  return (
    message.type === "ai" &&
    message.tool_calls?.some((toolCall) => toolCall.name === "present_files")
  );
}

export function isClarificationToolMessage(message: Message) {
  return message.type === "tool" && message.name === "ask_clarification";
}

/**
 * Check if a message is a conversation summary message.
 * Summary messages are injected by the summarization middleware and marked with
 * additional_kwargs.is_summary = true, or contain the summary prefix text.
 */
export function isSummaryMessage(message: Message): boolean {
  if (message.type !== "human") {
    return false;
  }
  // Check for explicit marker from backend
  if (message.additional_kwargs?.is_summary === true) {
    return true;
  }
  // Fallback: check for summary prefix text (for backward compatibility)
  const content = extractTextFromMessage(message);
  if (content.startsWith("Here is a summary of the conversation to date:")) {
    return true;
  }
  return false;
}

export function extractPresentFilesFromMessage(message: Message) {
  if (message.type !== "ai" || !hasPresentFiles(message)) {
    return [];
  }
  const files: string[] = [];
  for (const toolCall of message.tool_calls ?? []) {
    if (
      toolCall.name === "present_files" &&
      Array.isArray(toolCall.args.filepaths)
    ) {
      files.push(...(toolCall.args.filepaths as string[]));
    }
  }
  return files;
}

function isMessageAttachmentRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeMessageDerivedFiles(
  derivedFiles: unknown,
): UploadedDerivedFile[] | undefined {
  if (!Array.isArray(derivedFiles)) {
    return undefined;
  }

  const normalized = derivedFiles
    .filter(isMessageAttachmentRecord)
    .map((derived): UploadedDerivedFile | null => {
      const virtualPath =
        typeof derived.virtual_path === "string"
          ? derived.virtual_path
          : typeof derived.path === "string"
            ? derived.path
            : "";
      const artifactUrl =
        typeof derived.artifact_url === "string" ? derived.artifact_url : "";
      const attachmentId =
        typeof derived.attachment_id === "string"
          ? derived.attachment_id
          : "";
      const filename =
        typeof derived.filename === "string"
          ? derived.filename
          : virtualPath.split("/").filter(Boolean).pop() ?? "";

      if (!attachmentId || !filename || !virtualPath || !artifactUrl) {
        return null;
      }

      const normalized: UploadedDerivedFile = {
        attachment_id: attachmentId,
        filename,
        virtual_path: virtualPath,
        artifact_url: artifactUrl,
      };

      if (typeof derived.content_type === "string") {
        normalized.content_type = derived.content_type;
      }
      if (typeof derived.is_derived === "boolean") {
        normalized.is_derived = derived.is_derived;
      }
      if (typeof derived.source_filename === "string") {
        normalized.source_filename = derived.source_filename;
      }
      if (typeof derived.source_attachment_id === "string") {
        normalized.source_attachment_id = derived.source_attachment_id;
      }

      return normalized;
    })
    .filter((item): item is UploadedDerivedFile => item !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeMessageAttachment(item: Record<string, unknown>): UploadedFileInfo | null {
  const virtualPath =
    typeof item.virtual_path === "string"
      ? item.virtual_path
      : typeof item.path === "string"
        ? item.path
        : "";
  const artifactUrl = typeof item.artifact_url === "string" ? item.artifact_url : "";
  const filename =
    typeof item.filename === "string"
      ? item.filename
      : virtualPath.split("/").filter(Boolean).pop() ?? "";

  if (!filename || !virtualPath || !artifactUrl) {
    return null;
  }

  return {
    attachment_id:
      typeof item.attachment_id === "string" ? item.attachment_id : "",
    filename,
    original_filename:
      typeof item.original_filename === "string"
        ? item.original_filename
        : undefined,
    stored_filename:
      typeof item.stored_filename === "string"
        ? item.stored_filename
        : undefined,
    is_derived:
      typeof item.is_derived === "boolean" ? item.is_derived : undefined,
    source_filename:
      typeof item.source_filename === "string" ? item.source_filename : undefined,
    source_attachment_id:
      typeof item.source_attachment_id === "string"
        ? item.source_attachment_id
        : undefined,
    size: typeof item.size === "number" ? item.size : Number(item.size ?? 0),
    path: virtualPath,
    virtual_path: virtualPath,
    artifact_url: artifactUrl,
    content_type:
      typeof item.content_type === "string" ? item.content_type : undefined,
    derived_files: normalizeMessageDerivedFiles(item.derived_files),
    extension: typeof item.extension === "string" ? item.extension : undefined,
    modified: typeof item.modified === "number" ? item.modified : undefined,
    markdown_file:
      typeof item.markdown_file === "string" ? item.markdown_file : undefined,
    markdown_path:
      typeof item.markdown_path === "string" ? item.markdown_path : undefined,
    markdown_virtual_path:
      typeof item.markdown_virtual_path === "string"
        ? item.markdown_virtual_path
        : undefined,
    markdown_artifact_url:
      typeof item.markdown_artifact_url === "string"
        ? item.markdown_artifact_url
        : undefined,
  };
}

export function extractAttachmentsFromMessage(message: Message): UploadedFileInfo[] {
  const attachments = message.additional_kwargs?.attachments;
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  return attachments
    .filter(isMessageAttachmentRecord)
    .map(normalizeMessageAttachment)
    .filter((item): item is UploadedFileInfo => item !== null && item.filename.length > 0);
}

export function buildRetrySubmissionFromMessage(message: Message) {
  return {
    text: stripSystemContext(stripUploadedFilesTag(extractContentFromMessage(message) || "")).trim(),
    attachments: extractAttachmentsFromMessage(message),
  };
}

export function hasSubagent(message: AIMessage) {
  for (const toolCall of message.tool_calls ?? []) {
    if (toolCall.name === "task") {
      return true;
    }
  }
  return false;
}

export function findToolCallResult(toolCallId: string, messages: Message[]) {
  for (const message of messages) {
    if (message.type === "tool" && message.tool_call_id === toolCallId) {
      const content = extractTextFromMessage(message);
      if (content) {
        return content;
      }
    }
  }
  return undefined;
}

/**
 * Represents a file shown in message attachment UI.
 * Covers optimistic upload state and structured reference metadata.
 */
export interface FileInMessage {
  attachment_id?: string;
  filename: string;
  original_filename?: string;
  stored_filename?: string;
  size: number; // bytes
  path?: string; // virtual path, may not be set during upload
  virtual_path?: string;
  artifact_url?: string;
  content_type?: string;
  derived_files?: Array<{
    attachment_id?: string;
    path?: string;
    filename?: string;
    virtual_path: string;
    artifact_url: string;
    content_type?: string;
    mime_type?: string;
  }>;
  status?: "uploading" | "uploaded" | "referenced" | "invalid";
}

/**
 * Remove legacy <uploaded_files> tag blocks from historic messages.
 * New attachment flow is fully structured via additional_kwargs.attachments/files.
 */
export function stripUploadedFilesTag(content: string): string {
  return content
    .replace(/<uploaded_files>[\s\S]*?<\/uploaded_files>/g, "")
    .trim();
}

export function stripSystemContext(content: string): string {
  const regex = /\[SYSTEM CONTEXT:[\s\S]*?\]\s*[\s\S]*?\[USER QUERY\]\s*([\s\S]*)/;
  const match = regex.exec(content);
  if (match?.[1]) {
    return match[1].trim();
  }
  return content;
}


export function isMCPTool(toolName: string): boolean {
  return toolName.startsWith("mcp__") || toolName.startsWith("mcp_");
}

const BUILTIN_TOOL_NAMES = new Set([
  "web_search",
  "image_search",
  "web_fetch",
  "ls",
  "read_file",
  "write_file",
  "str_replace",
  "bash",
  "ask_clarification",
  "write_todos",
  "present_files",
  "task",
]);

export function isExternalIntegratedTool(toolName: string): boolean {
  if (BUILTIN_TOOL_NAMES.has(toolName)) {
    return false;
  }
  // Some MCP gateways expose tools as <server>_<tool>, e.g. K8s_pods_list.
  return /^[A-Za-z][A-Za-z0-9-]*_[A-Za-z0-9_]+$/.test(toolName);
}

export function shouldRenderToolResultAsArtifact(
  toolName: string,
  args?: Record<string, unknown>,
): boolean {
  if (toolName === "write_file") {
    return true;
  }

  if (toolName === "str_replace") {
    return typeof args?.content === "string" && args.content.trim().length > 0;
  }

  return isMCPTool(toolName) || isExternalIntegratedTool(toolName);
}

export function buildToolResultArtifactPath({
  toolName,
  args,
  messageId,
  toolCallId,
}: {
  toolName: string;
  args: Record<string, unknown>;
  messageId: string;
  toolCallId: string;
}) {
  if (toolName === "write_file" && typeof args.path === "string") {
    return `write-file:${args.path}?message_id=${messageId}&tool_call_id=${toolCallId}`;
  }

  if (
    toolName === "str_replace" &&
    typeof args.path === "string" &&
    typeof args.content === "string" &&
    args.content.trim().length > 0
  ) {
    return `write-file:${args.path}?message_id=${messageId}&tool_call_id=${toolCallId}`;
  }

  if (isMCPTool(toolName) || isExternalIntegratedTool(toolName)) {
    const safeName = toolName.replace(/[^A-Za-z0-9._-]+/g, "-");
    const safeCallId = toolCallId.replace(/[^A-Za-z0-9._-]+/g, "-");
    return `mcp-result:/mnt/user-data/outputs/${safeName}-${safeCallId}.json?message_id=${messageId}&tool_call_id=${toolCallId}`;
  }

  return undefined;
}

export function extractToolResultArtifacts(
  messages: Message[],
): Array<{ tool_call_id: string; tool_name: string; filepath: string; content: string; messageId: string }> {
  const artifacts: Array<{ tool_call_id: string; tool_name: string; filepath: string; content: string; messageId: string }> = [];

  for (const message of messages) {
    if (message.type === "ai" && message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (shouldRenderToolResultAsArtifact(toolCall.name, toolCall.args)) {
          const toolCallId = toolCall.id;
          const messageId = message.id;
          if (toolCallId && messageId) {
            const filepath = buildToolResultArtifactPath({
              toolName: toolCall.name,
              args: toolCall.args,
              messageId,
              toolCallId,
            });
            const result = findToolCallResult(toolCallId, messages);
            if (filepath && result) {
              artifacts.push({
                tool_call_id: toolCallId,
                tool_name: toolCall.name,
                filepath,
                content: result,
                messageId,
              });
            }
          }
        }
      }
    }
  }

  return artifacts;
}
