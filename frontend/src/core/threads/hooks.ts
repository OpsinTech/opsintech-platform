import type { AIMessage, Message } from "@langchain/langgraph-sdk";
import type { ThreadsClient } from "@langchain/langgraph-sdk/client";
import { useStream } from "@langchain/langgraph-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { getSession } from "@/core/auth/auth-api";
import { getCurrentTenantId } from "@/core/tenants/store";

import { getAPIClient } from "../api";
import { getAuthHeaders } from "../api/auth-client";
import { getBackendBaseURL } from "../config";
import { useI18n } from "../i18n/hooks";
import { isSummaryMessage } from "../messages/utils";
import type { FileInMessage } from "../messages/utils";
import type { LocalSettings } from "../settings";
import { useUpdateSubtask } from "../tasks/context";
import type { UploadedFileInfo } from "../uploads";
import { uploadFiles } from "../uploads";

import type { AgentThread, AgentThreadState } from "./types";

const THREAD_OWNER_METADATA_KEY = "owner_user_id";

const THREAD_TENANT_METADATA_KEY = "owner_tenant_id";
async function getCurrentUserId(): Promise<string | undefined> {
  const session = await getSession();
  return session?.user?.id;
}
export type ToolEndEvent = {
  name: string;
  data: unknown;
};

export type MessageAttachmentReference = {
  attachment_id: string;
  filename: string;
  original_filename?: string;
  stored_filename?: string;
  virtual_path: string;
  artifact_url: string;
  content_type?: string;
  size?: number;
  derived_files?: UploadedFileInfo["derived_files"];
};

export function buildAttachmentSubmitPayload(
  selectedAttachments: UploadedFileInfo[],
  uploadedFileInfo: UploadedFileInfo[],
): {
  dedupedAttachmentRefs: MessageAttachmentReference[];
} {
  const uploadedAttachments: MessageAttachmentReference[] = uploadedFileInfo.map(
    (info) => ({
      attachment_id: info.attachment_id,
      filename: info.filename,
      original_filename: info.original_filename ?? info.filename,
      stored_filename: info.stored_filename ?? info.filename,
      virtual_path: info.virtual_path,
      artifact_url: info.artifact_url,
      content_type: info.content_type,
      size: Number(info.size ?? 0),
      derived_files: info.derived_files,
    }),
  );

  const selectedAttachmentRefs: MessageAttachmentReference[] = selectedAttachments.map(
    (info) => ({
      attachment_id: info.attachment_id,
      filename: info.filename,
      original_filename: info.original_filename ?? info.filename,
      stored_filename: info.stored_filename ?? info.filename,
      virtual_path: info.virtual_path,
      artifact_url: info.artifact_url,
      content_type: info.content_type,
      size: Number(info.size ?? 0),
      derived_files: info.derived_files,
    }),
  );

  const dedupedAttachmentRefs = [
    ...selectedAttachmentRefs,
    ...uploadedAttachments,
  ].filter((file, index, array) => {
    const key = file.attachment_id || file.virtual_path;
    return array.findIndex((item) => (item.attachment_id || item.virtual_path) === key) === index;
  });

  return {
    dedupedAttachmentRefs,
  };
}

export type ThreadStreamOptions = {
  threadId?: string | null | undefined;
  context: LocalSettings["context"];
  isMock?: boolean;
  onStart?: (threadId: string) => void;
  onFinish?: (state: AgentThreadState) => void;
  onToolEnd?: (event: ToolEndEvent) => void;
};

export function isRateLimitLikeError(error: unknown): boolean {
  const status =
    typeof error === "object" && error !== null
      ? Reflect.get(error, "status") ?? Reflect.get(error, "status_code")
      : undefined;
  if (status === 429 || status === "429") {
    return true;
  }

  const text = (() => {
    if (typeof error === "string") {
      return error;
    }
    if (error instanceof Error) {
      return `${error.name} ${error.message}`;
    }
    if (typeof error === "object" && error !== null) {
      const name = Reflect.get(error, "name");
      const message = Reflect.get(error, "message");
      const code = Reflect.get(error, "code");
      const type = Reflect.get(error, "type");
      return [name, message, code, type]
        .filter((v) => typeof v === "string")
        .join(" ");
    }
    return "";
  })().toLowerCase();

  return (
    text.includes("ratelimit") ||
    text.includes("rate limit") ||
    text.includes("too many requests") ||
    text.includes("quota")
  );
}

function getStreamErrorMessage(error: unknown): string {
  const rawMessage = (() => {
    if (typeof error === "string") {
      return error;
    }
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "object" && error !== null) {
      const msg = Reflect.get(error, "message");
      if (typeof msg === "string") {
        return msg;
      }
      const nested = Reflect.get(error, "error");
      if (typeof nested === "string") {
        return nested;
      }
      if (nested instanceof Error) {
        return nested.message;
      }
    }
    return "";
  })();

  const lowerMessage = rawMessage.toLowerCase();

  if (isRateLimitLikeError(error)) {
    return "模型请求已限速，请稍后重试。";
  }

  if (lowerMessage.includes("authentication") || lowerMessage.includes("invalid api key") || lowerMessage.includes("unauthorized")) {
    return "模型认证失败，请检查 API 密钥配置。";
  }

  if (lowerMessage.includes("context_length") || lowerMessage.includes("max context") || lowerMessage.includes("token limit")) {
    return "输入内容过长，超出模型上下文限制，请缩短输入后重试。";
  }

  if (lowerMessage.includes("null") && lowerMessage.includes("choices")) {
    return "模型返回了无效响应，请重试。";
  }

  if (lowerMessage.includes("no model") && lowerMessage.includes("specified")) {
    return "未选择模型，请先选择一个可用的模型。";
  }

  if (lowerMessage.includes("model") && (lowerMessage.includes("not found") || lowerMessage.includes("not available") || lowerMessage.includes("does not exist"))) {
    return "请求的模型不可用，请选择其他模型。";
  }

  if (lowerMessage.includes("connection") || lowerMessage.includes("timeout") || lowerMessage.includes("econnrefused")) {
    return "无法连接到模型服务，请检查网络或稍后重试。";
  }

  if (lowerMessage.includes("insufficient_quota") || lowerMessage.includes("billing")) {
    return "模型配额不足，请联系管理员。";
  }

  if (lowerMessage.includes("internal error") || lowerMessage.includes("an internal error occurred")) {
    return "服务暂时不可用，请稍后重试。如果问题持续，请联系管理员。";
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    const message = Reflect.get(error, "message");
    if (typeof message === "string" && message.trim()) {
      return message;
    }
    const nestedError = Reflect.get(error, "error");
    if (nestedError instanceof Error && nestedError.message.trim()) {
      return nestedError.message;
    }
    if (typeof nestedError === "string" && nestedError.trim()) {
      return nestedError;
    }
  }
  return "请求失败，请稍后重试。";
}

export function useThreadStream({
  threadId,
  context,
  isMock,
  onStart,
  onFinish,
  onToolEnd,
}: ThreadStreamOptions) {
  const { t } = useI18n();
  // Track the thread ID that is currently streaming to handle thread changes during streaming
  const [onStreamThreadId, setOnStreamThreadId] = useState(() => threadId);
  // Ref to track current thread ID across async callbacks without causing re-renders,
  // and to allow access to the current thread id in onUpdateEvent
  const threadIdRef = useRef<string | null>(threadId ?? null);
  const startedRef = useRef(false);

  const listeners = useRef({
    onStart,
    onFinish,
    onToolEnd,
  });



  // Keep listeners ref updated with latest callbacks
  useEffect(() => {
    listeners.current = { onStart, onFinish, onToolEnd };
  }, [onStart, onFinish, onToolEnd]);

  useEffect(() => {
    const normalizedThreadId = threadId ?? null;
    if (!normalizedThreadId) {
      startedRef.current = false;
    }
    setOnStreamThreadId(normalizedThreadId);
    threadIdRef.current = normalizedThreadId;
  }, [threadId]);

  const _handleOnStart = useCallback((id: string) => {
    if (!startedRef.current) {
      listeners.current.onStart?.(id);
      startedRef.current = true;
    }
  }, []);

  const handleStreamStart = useCallback(
    (_threadId: string) => {
      threadIdRef.current = _threadId;
      _handleOnStart(_threadId);
    },
    [_handleOnStart],
  );

  const queryClient = useQueryClient();
  const updateSubtask = useUpdateSubtask();

  const thread = useStream<AgentThreadState>({
    client: getAPIClient(isMock),
    assistantId: "lead_agent",
    threadId: onStreamThreadId,
    reconnectOnMount: true,
    fetchStateHistory: { limit: 1 },
    onCreated(meta) {
      handleStreamStart(meta.thread_id);
      setOnStreamThreadId(meta.thread_id);
      void (async () => {
        try {
          const userId = await getCurrentUserId();
          if (!userId) {
            return;
          }
          await getAPIClient(isMock).threads.update(meta.thread_id, {
            metadata: { 
              [THREAD_OWNER_METADATA_KEY]: userId,
              [THREAD_TENANT_METADATA_KEY]: getCurrentTenantId() ?? "default",
            },
          });
        } catch (error) {
          console.warn("Failed to bind thread owner metadata", error);
        }
      })();
    },
    onLangChainEvent(event) {
      if (event.event === "on_tool_end") {
        listeners.current.onToolEnd?.({
          name: event.name,
          data: event.data,
        });
      }
    },
    onUpdateEvent(data) {
      const updates: Array<Partial<AgentThreadState> | null> = Object.values(
        data || {},
      );
      for (const update of updates) {
        if (update && "title" in update && update.title) {
          void queryClient.setQueriesData(
            {
              queryKey: ["threads", "search"],
              exact: false,
            },
            (oldData: Array<AgentThread> | undefined) => {
              return oldData?.map((t) => {
                if (t.thread_id === threadIdRef.current) {
                  return {
                    ...t,
                    values: {
                      ...t.values,
                      title: update.title,
                    },
                  };
                }
                return t;
              });
            },
          );
        }
      }
    },
    onCustomEvent(event: unknown) {
      if (
        typeof event === "object" &&
        event !== null &&
        "type" in event
      ) {
        const e = event as Record<string, unknown>;
        const taskId = e.task_id as string | undefined;
        if (!taskId) return;

        if (event.type === "task_running") {
          updateSubtask({
            id: taskId,
            latestMessage: e.message as AIMessage,
          });
        } else if (event.type === "task_started") {
          const patch: Record<string, unknown> = { id: taskId };
          if (e.started_at) {
            patch.startedAt = e.started_at as string;
          }
          if (e.timeout_seconds != null) {
            patch.timeoutSeconds = e.timeout_seconds as number;
          }
          updateSubtask(patch as Parameters<typeof updateSubtask>[0]);
        } else if (event.type === "task_completed") {
          updateSubtask({
            id: taskId,
            status: "completed",
            result: e.result as string,
            completedAt: e.completed_at as string,
          });
        } else if (event.type === "task_failed") {
          updateSubtask({
            id: taskId,
            status: "failed",
            error: e.error as string,
            completedAt: e.completed_at as string,
          });
        } else if (event.type === "task_timed_out") {
          updateSubtask({
            id: taskId,
            status: "timed_out",
            error: e.error as string,
            completedAt: e.completed_at as string,
          });
        }
      }
    },
    onError(error) {
      setOptimisticMessages([]);
      toast.error(getStreamErrorMessage(error));
    },
    onFinish(state) {
      listeners.current.onFinish?.(state.values);
      void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
      // Force state refresh to ensure messages are always displayed after stream completes
      if (state.values) {
        void queryClient.invalidateQueries({ queryKey: ["thread"] });
      }
    },
  });

  // Optimistic messages
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const sendInFlightRef = useRef(false);
  const prevMsgCountRef = useRef(thread.messages.length);

  // Clear optimistic when server messages arrive
  useEffect(() => {
    if (
      optimisticMessages.length > 0 &&
      thread.messages.length > prevMsgCountRef.current
    ) {
      setOptimisticMessages([]);
    }
  }, [thread.messages.length, optimisticMessages.length]);

  // Show toast when conversation is auto-summarized
  const summaryCountRef = useRef(0);
  useEffect(() => {
    const currentCount = thread.messages.filter((m) => isSummaryMessage(m)).length;
    if (currentCount > summaryCountRef.current) {
      summaryCountRef.current = currentCount;
      toast.info(t.threadErrors.conversationSummarized, {
        description: t.threadErrors.conversationSummarizedDesc,
        duration: 4000,
      });
    }
  }, [thread.messages]);

  const sendMessage = useCallback(
    async (
      threadId: string,
      message: PromptInputMessage,
      extraContext?: Record<string, unknown>,
    ) => {
      if (sendInFlightRef.current) {
        return;
      }
      sendInFlightRef.current = true;

      const text = message.text.trim();

      // Capture current count before showing optimistic messages
      prevMsgCountRef.current = thread.messages.length;

      const selectedAttachments = Array.isArray(extraContext?.attachments)
        ? (extraContext.attachments as UploadedFileInfo[])
        : [];

      // Build optimistic files list with uploading status
      const optimisticFiles: FileInMessage[] = (message.files ?? []).map(
        (f) => ({
          filename: f.filename ?? "",
          size: 0,
          status: "uploading" as const,
        }),
      );

      const optimisticSelectedFiles: FileInMessage[] = selectedAttachments.map(
        (file) => ({
          attachment_id: file.attachment_id,
          filename: file.filename,
          size: Number(file.size ?? 0),
          path: file.virtual_path,
          artifact_url: file.artifact_url,
          content_type: file.content_type,
          derived_files: file.derived_files,
          status: "uploaded" as const,
        }),
      );

      const optimisticDisplayFiles = [...optimisticSelectedFiles, ...optimisticFiles];

      // Create optimistic human message (shown immediately)
      const optimisticHumanMsg: Message = {
        type: "human",
        id: `opt-human-${Date.now()}`,
        content: text ? [{ type: "text", text }] : "",
        additional_kwargs:
          optimisticDisplayFiles.length > 0 ? { files: optimisticDisplayFiles } : {},
      };

      const newOptimistic: Message[] = [optimisticHumanMsg];
      if (optimisticFiles.length > 0) {
        // Mock AI message while files are being uploaded
        newOptimistic.push({
          type: "ai",
          id: `opt-ai-${Date.now()}`,
          content: t.uploads.uploadingFiles,
          additional_kwargs: { element: "task" },
        });
      }
      setOptimisticMessages(newOptimistic);

      if (threadIdRef.current) {
        _handleOnStart(threadId);
      }

      let uploadedFileInfo: UploadedFileInfo[] = [];

      try {
        // Upload files first if any
        if (message.files && message.files.length > 0) {
          setIsUploading(true);
          try {
            // Convert FileUIPart to File objects by fetching blob URLs
            const filePromises = message.files.map(async (fileUIPart) => {
              if (fileUIPart.url && fileUIPart.filename) {
                try {
                  // Fetch the blob URL to get the file data
                  const response = await fetch(fileUIPart.url);
                  const blob = await response.blob();

                  // Create a File object from the blob
                  return new File([blob], fileUIPart.filename, {
                    type: fileUIPart.mediaType || blob.type,
                  });
                } catch (error) {
                  console.error(
                    `Failed to fetch file ${fileUIPart.filename}:`,
                    error,
                  );
                  return null;
                }
              }
              return null;
            });

            const conversionResults = await Promise.all(filePromises);
            const files = conversionResults.filter(
              (file): file is File => file !== null,
            );
            const failedConversions = conversionResults.length - files.length;

            if (failedConversions > 0) {
              throw new Error(
                `Failed to prepare ${failedConversions} attachment(s) for upload. Please retry.`,
              );
            }

            if (!threadId) {
              throw new Error("Thread is not ready for file upload.");
            }

            if (files.length > 0) {
              const uploadResponse = await uploadFiles(threadId, files);
              uploadedFileInfo = uploadResponse.files;
              void queryClient.invalidateQueries({
                queryKey: ["uploads", "list", threadId],
              });

              // Update optimistic human message with uploaded status + paths
              const uploadedFiles: FileInMessage[] = uploadedFileInfo.map(
                (info) => ({
                  attachment_id: info.attachment_id,
                  filename: info.filename,
                  size: Number(info.size ?? 0),
                  path: info.virtual_path,
                  artifact_url: info.artifact_url,
                  content_type: info.content_type,
                  derived_files: info.derived_files,
                  status: "uploaded" as const,
                }),
              );
              setOptimisticMessages((messages) => {
                if (messages.length > 1 && messages[0]) {
                  const humanMessage: Message = messages[0];
                  return [
                    {
                      ...humanMessage,
                      additional_kwargs: {
                        files: [...optimisticSelectedFiles, ...uploadedFiles],
                      },
                    },
                    ...messages.slice(1),
                  ];
                }
                return messages;
              });
            }
          } catch (error) {
            console.error("Failed to upload files:", error);
            const errorMessage =
              error instanceof Error
                ? error.message
                : "Failed to upload files.";
            toast.error(errorMessage);
            setOptimisticMessages([]);
            throw error;
          } finally {
            setIsUploading(false);
          }
        }

        const { dedupedAttachmentRefs } =
          buildAttachmentSubmitPayload(selectedAttachments, uploadedFileInfo);

        const submitMessage = {
          type: "human",
          content: [
            {
              type: "text",
              text,
            },
          ],
          attachments: dedupedAttachmentRefs,
          additional_kwargs: {
            attachments: dedupedAttachmentRefs,
          },
        } as unknown as Message;

        await thread.submit(
          {
            messages: [submitMessage],
          },
          {
            // Keep runtime context tenant-aware so UploadsMiddleware can locate
            // the same tenant-scoped uploads directory used by the upload API.
            // Without this, file context may be omitted in multi-tenant mode.
            
            threadId: threadId,
            streamSubgraphs: true,
            streamResumable: true,
            config: {
              recursion_limit: 1000,
            },
            context: {
              ...extraContext,
              ...context,
              referenced_attachments: dedupedAttachmentRefs,
              tenant_id: getCurrentTenantId() ?? undefined,
              user_id: await getCurrentUserId(),
              thinking_enabled: context.mode !== "flash",
              is_plan_mode: context.mode === "pro" || context.mode === "ultra",
              subagent_enabled: context.mode === "ultra",
              reasoning_effort:
                context.reasoning_effort ??
                (context.mode === "ultra"
                  ? "high"
                  : context.mode === "pro"
                    ? "medium"
                    : context.mode === "thinking"
                      ? "low"
                      : undefined),
              thread_id: threadId,
              skill_name: context.skill_name,
            },
          },
        );
        void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
      } catch (error) {
        setOptimisticMessages([]);
        setIsUploading(false);
        if (isRateLimitLikeError(error)) {
          return;
        }
        toast.error(getStreamErrorMessage(error));
      } finally {
        sendInFlightRef.current = false;
      }
    },
    [thread, _handleOnStart, t.uploads.uploadingFiles, context, queryClient],
  );

  // Merge thread with optimistic messages for display
  const mergedThread =
    optimisticMessages.length > 0
      ? ({
          ...thread,
          messages: [...thread.messages, ...optimisticMessages],
        } as typeof thread)
      : thread;

  return [mergedThread, sendMessage, isUploading] as const;
}

export function useThreads(
  params: Parameters<ThreadsClient["search"]>[0] = {
    limit: 50,
    sortBy: "updated_at",
    sortOrder: "desc",
    select: ["thread_id", "updated_at", "values"],
  },
) {
  const apiClient = getAPIClient();
  return useQuery<AgentThread[]>({
    queryKey: ["threads", "search", params],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId) {
        return [];
      }
      const tenantId = getCurrentTenantId();

      const searchParams = {
        ...params,
        metadata: {
          ...((params as { metadata?: Record<string, unknown> }).metadata ?? {}),
          [THREAD_OWNER_METADATA_KEY]: userId,
          ...(tenantId ? { [THREAD_TENANT_METADATA_KEY]: tenantId } : {}),
        },
      };

      const maxResults = params.limit;
      const initialOffset = params.offset ?? 0;
      const DEFAULT_PAGE_SIZE = 50;

      // Preserve prior semantics: if a non-positive limit is explicitly provided,
      // delegate to a single search call with the original parameters.
      if (maxResults !== undefined && maxResults <= 0) {
        const response = await apiClient.threads.search<AgentThreadState>(
          searchParams,
        );
        return response as AgentThread[];
      }

      const pageSize =
        typeof maxResults === "number" && maxResults > 0
          ? Math.min(DEFAULT_PAGE_SIZE, maxResults)
          : DEFAULT_PAGE_SIZE;

      const threads: AgentThread[] = [];
      let offset = initialOffset;

      while (true) {
        if (typeof maxResults === "number" && threads.length >= maxResults) {
          break;
        }

        const currentLimit =
          typeof maxResults === "number"
            ? Math.min(pageSize, maxResults - threads.length)
            : pageSize;

        if (typeof maxResults === "number" && currentLimit <= 0) {
          break;
        }

        const response = (await apiClient.threads.search<AgentThreadState>({
          ...searchParams,
          limit: currentLimit,
          offset,
        })) as AgentThread[];

        threads.push(...response);

        if (response.length < currentLimit) {
          break;
        }

        offset += response.length;
      }

      return threads;
    },
    refetchOnWindowFocus: false,
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  const apiClient = getAPIClient();

  return useMutation({
    mutationFn: async ({ threadId }: { threadId: string }) => {
      await apiClient.threads.delete(threadId);

      const headers = await getAuthHeaders();

      const response = await fetch(
        `${getBackendBaseURL()}/api/threads/${encodeURIComponent(threadId)}`,
        {
          method: "DELETE",
          headers,
        },
      );

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ detail: "Failed to delete local thread data." }));
        throw new Error(error.detail ?? "Failed to delete local thread data.");
      }
    },
    onSuccess(_, { threadId }) {
      queryClient.setQueriesData(
        {
          queryKey: ["threads", "search"],
          exact: false,
        },
        (oldData: Array<AgentThread> | undefined) => {
          if (oldData == null) {
            return oldData;
          }
          return oldData.filter((t) => t.thread_id !== threadId);
        },
      );
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: ["threads", "search"] });
    },
  });
}

export function useRenameThread() {
  const queryClient = useQueryClient();
  const apiClient = getAPIClient();
  return useMutation({
    mutationFn: async ({
      threadId,
      title,
    }: {
      threadId: string;
      title: string;
    }) => {
      await apiClient.threads.updateState(threadId, {
        values: { title },
      });
    },
    onSuccess(_, { threadId, title }) {
      queryClient.setQueriesData(
        {
          queryKey: ["threads", "search"],
          exact: false,
        },
        (oldData: Array<AgentThread> | undefined) => {
          if (oldData == null) {
            return oldData;
          }
          return oldData.map((t) => {
            if (t.thread_id === threadId) {
              return {
                ...t,
                values: {
                  ...t.values,
                  title,
                },
              };
            }
            return t;
          });
        },
      );
    },
  });
}
