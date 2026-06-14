import type { BaseStream } from "@langchain/langgraph-sdk/react";

import { fetchAuthApi } from "../api/auth-client";
import type { AgentThreadState } from "../threads";

import { ensureLeadingSlash, urlOfArtifact } from "./utils";

export async function loadArtifactContent({
  filepath,
  threadId,
  isMock,
}: {
  filepath: string;
  threadId: string;
  isMock?: boolean;
}) {
  let enhancedFilepath = filepath;
  if (filepath.endsWith(".skill")) {
    enhancedFilepath = filepath + "/SKILL.md";
  }
  const response = isMock
    ? await fetch(urlOfArtifact({ filepath: enhancedFilepath, threadId, isMock }))
    : await fetchAuthApi(`/api/threads/${threadId}/artifacts${ensureLeadingSlash(enhancedFilepath)}`);
  if (!response.ok) {
    throw new Error(`Failed to load artifact content: HTTP ${response.status}`);
  }
  const text = await response.text();
  return text;
}

export function loadArtifactContentFromToolCall({
  url: urlString,
  thread,
}: {
  url: string;
  thread: BaseStream<AgentThreadState> | null | undefined;
}) {
  const url = new URL(urlString);
  const toolCallId = url.searchParams.get("tool_call_id");
  const messageId = url.searchParams.get("message_id");
  
  if (messageId && toolCallId && thread?.messages) {
    if (urlString.startsWith("mcp-result:")) {
      const resultMessage = thread.messages.find(
        (m) => m.type === "tool" && m.tool_call_id === toolCallId,
      );
      if (resultMessage && "content" in resultMessage) {
        if (typeof resultMessage.content === "string") {
          return resultMessage.content;
        } else if (Array.isArray(resultMessage.content)) {
          return resultMessage.content
            .map((content) => {
              if (content.type === "text") {
                return content.text;
              }
              if ("text" in content && typeof content.text === "string") {
                return content.text;
              }
              return JSON.stringify(content, null, 2);
            })
            .join("\n")
            .trim();
        }
      }
      return null;
    }

    const message = thread.messages.find((m) => m.id === messageId);
    if (message?.type === "ai" && message.tool_calls) {
      const toolCall = message.tool_calls.find(
        (tc) => tc.id === toolCallId,
      );
      if (toolCall && "content" in toolCall.args) {
        return toolCall.args.content as string;
      }
    }
  }
}
