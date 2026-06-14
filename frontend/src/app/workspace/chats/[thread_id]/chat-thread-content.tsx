"use client";

import type { Message } from "@langchain/langgraph-sdk";
import { ArrowLeft, History, ListChecks, Loader2Icon, SquarePen, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ArtifactsProvider } from "@/components/workspace/artifacts";
import {
  ArtifactTrigger,
} from "@/components/workspace/artifacts/artifact-trigger";
import {
  ChatBox,
  useChatTabs,
  useChatHeader,
  useThreadChat,
} from "@/components/workspace/chats";
import { InputBox } from "@/components/workspace/input-box";
import { MessageList } from "@/components/workspace/messages";
import { ThreadContext } from "@/components/workspace/messages/context";
import { ThreadTitle } from "@/components/workspace/thread-title";
import { TodoList } from "@/components/workspace/todo-list";
import { TokenUsageIndicator } from "@/components/workspace/token-usage-indicator";
import { useIncidentDetail, getSeverityBadgeStyles } from "@/core/alerting";
import { useI18n } from "@/core/i18n/hooks";
import { buildRetrySubmissionFromMessage } from "@/core/messages/utils";
import { useNotification } from "@/core/notification/hooks";
import { type useLocalSettings } from "@/core/settings";
import { SubtasksProvider } from "@/core/tasks/context";
import {
  isRateLimitLikeError,
  useThreadStream,
} from "@/core/threads/hooks";
import { pathOfThread, textOfMessage, titleOfThread } from "@/core/threads/utils";
import { useDeleteUploadedFile, useUploadedFiles, type UploadedFileInfo } from "@/core/uploads";
import { formatTimeAgo } from "@/core/utils/datetime";
import { env } from "@/env";
import { cn } from "@/lib/utils";

import {
  reconcileAttachmentSelection,
  removeDeletedAttachmentSelections,
  selectPreferredReferencesForAddedIds,
} from "./attachment-selection";
import { ThreadAttachmentsPanel } from "./thread-attachments-panel";

interface ChatThreadContentProps {
  threadId: string;
  context: ReturnType<typeof useLocalSettings>[0]["context"];
  onContextChange: (context: ReturnType<typeof useLocalSettings>[0]["context"]) => void;
}

export function ChatThreadContent({ threadId, context, onContextChange }: ChatThreadContentProps) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const incidentId = searchParams.get("incident");
  const { data: sourceIncident } = useIncidentDetail(incidentId);
  const [incidentCardDismissed, setIncidentCardDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { openThread, closeThread } = useChatTabs();
  const headerCtx = useChatHeader();
  const { showNotification } = useNotification();
  const [todosHidden, setTodosHidden] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { threadId: effectiveThreadId, setThreadId, isNewThread, setIsNewThread, isMock } = useThreadChat(threadId);

  const [thread, sendMessage, isUploading] = useThreadStream({
    threadId: isNewThread ? undefined : effectiveThreadId,
    context,
    isMock,
    onStart: (createdThreadId) => {
      setThreadId(createdThreadId);
      setIsNewThread(false);
      setTodosHidden(false);
      closeThread(threadId);
      openThread(createdThreadId);
    },
    onFinish: (state) => {
      if (document.hidden || !document.hasFocus()) {
        let body = "Conversation finished";
        const lastMessage = state.messages.at(-1);
        if (lastMessage) {
          const textContent = textOfMessage(lastMessage);
          if (textContent) {
            body =
              textContent.length > 200
                ? textContent.substring(0, 200) + "..."
                : textContent;
          }
        }
        showNotification(state.title, { body });
      }
    },
  });

  const filteredThread = useMemo(() => {
    if (!incidentId || !thread.messages?.length) return thread;
    const firstMsg = thread.messages[0];
    if (firstMsg?.type === "human") {
      const text = textOfMessage(firstMsg);
      if (text?.startsWith("## Incident Diagnosis Request")) {
        return { ...thread, messages: thread.messages.slice(1) };
      }
    }
    return thread;
  }, [thread, incidentId]);

  const {
    data: uploadsData,
    isSuccess: uploadsReady,
    isFetching: uploadsFetching,
  } = useUploadedFiles(effectiveThreadId);
  const { mutateAsync: deleteUploadedFile } = useDeleteUploadedFile(effectiveThreadId);
  const threadAttachments = useMemo(() => uploadsData?.files ?? [], [uploadsData?.files]);
  const availableAttachmentKeys = useMemo(() => {
    if (!uploadsReady || uploadsFetching) {
      return undefined;
    }
    return new Set(
      threadAttachments.map((file) => file.attachment_id || `legacy:${file.filename}`),
    );
  }, [threadAttachments, uploadsFetching, uploadsReady]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [newlyUploadedPreferredIds, setNewlyUploadedPreferredIds] = useState<string[]>([]);
  const knownAttachmentIdsRef = useRef<Set<string>>(new Set());
  const selectionInitializedRef = useRef(false);

  useEffect(() => {
    setSelectedAttachmentIds([]);
    setNewlyUploadedPreferredIds([]);
    knownAttachmentIdsRef.current = new Set();
    selectionInitializedRef.current = false;
  }, [effectiveThreadId]);

  useEffect(() => {
    const allIds = threadAttachments
      .map((file) => file.attachment_id || `legacy:${file.filename}`)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const addedIds = allIds.filter((id) => !knownAttachmentIdsRef.current.has(id));
    setNewlyUploadedPreferredIds(
      selectPreferredReferencesForAddedIds(addedIds, threadAttachments),
    );

    setSelectedAttachmentIds((previous) => {
      const next = reconcileAttachmentSelection(
        {
          selectedIds: previous,
          knownIds: knownAttachmentIdsRef.current,
          initialized: selectionInitializedRef.current,
        },
        threadAttachments,
      );
      knownAttachmentIdsRef.current = next.knownIds;
      selectionInitializedRef.current = next.initialized;
      return next.selectedIds;
    });
  }, [threadAttachments]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const selectedAttachments = threadAttachments.filter((file) =>
        selectedAttachmentIds.includes(file.attachment_id || `legacy:${file.filename}`),
      );
      void sendMessage(effectiveThreadId, message, {
        attachments: selectedAttachments,
      }).catch((error) => {
        console.warn("Failed to send message", error);
      });
    },
    [selectedAttachmentIds, sendMessage, threadAttachments, effectiveThreadId],
  );

  const handleRetryHumanMessage = useCallback(
    (message: Message) => {
      const { text, attachments } = buildRetrySubmissionFromMessage(message);
      if (!text && attachments.length === 0) {
        return;
      }
      const retryMessage: PromptInputMessage = {
        text,
        files: [],
      };
      void sendMessage(
        effectiveThreadId,
        retryMessage,
        {
          attachments,
        },
      ).catch((error) => {
        console.warn("Retry send failed", error);
      });
    },
    [sendMessage, effectiveThreadId],
  );

  const handleToggleAttachment = useCallback((attachmentId: string) => {
    setSelectedAttachmentIds((previous) =>
      previous.includes(attachmentId)
        ? previous.filter((id) => id !== attachmentId)
        : [...previous, attachmentId],
    );
  }, []);

  const handleClearAttachmentSelection = useCallback(() => {
    setSelectedAttachmentIds([]);
  }, []);

  const handleSelectOnlyNewUploads = useCallback(() => {
    if (newlyUploadedPreferredIds.length === 0) {
      return;
    }
    const availableIds = new Set(
      threadAttachments.map((file) => file.attachment_id || `legacy:${file.filename}`),
    );
    setSelectedAttachmentIds(
      newlyUploadedPreferredIds.filter((id) => availableIds.has(id)),
    );
  }, [newlyUploadedPreferredIds, threadAttachments]);

  const handleDeleteAttachment = useCallback(
    async (file: UploadedFileInfo) => {
      await deleteUploadedFile({
        attachmentId: file.attachment_id,
        filename: file.filename,
      });
      setSelectedAttachmentIds((previous) =>
        removeDeletedAttachmentSelections(previous, file),
      );
    },
    [deleteUploadedFile],
  );

  const handleStop = useCallback(async () => {
    await thread.stop();
  }, [thread]);

  const isRateLimited = isRateLimitLikeError(thread.error);
  const isThreadConnecting = thread.isLoading && thread.messages.length === 0 && !isNewThread;

  if (!mounted) {
    return <div className="flex size-full min-h-0 flex-col bg-background" />;
  }

  return (
    <SubtasksProvider>
    <ArtifactsProvider>
    <PromptInputProvider>
    <ThreadContext.Provider value={{ thread, isMock }}>
      <ChatBox threadId={effectiveThreadId}>
        <div className="relative flex size-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.12),transparent_32%)]">
          {/* Header — inside chat panel, only spans chat width */}
          {headerCtx && (
            <header
              className={cn(
                "sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between px-6 bg-gradient-to-b from-background/90 to-transparent backdrop-blur-sm pointer-events-none",
              )}
            >
              <div className="flex min-w-0 items-center gap-3 opacity-60 hover:opacity-100 transition-opacity pointer-events-auto">
                {headerCtx.incidentId && (
                  <Link
                    href={`/workspace/incidents/${encodeURIComponent(headerCtx.incidentId)}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 no-underline"
                    title="返回告警详情"
                  >
                    <ArrowLeft className="size-3.5" />
                    返回告警
                  </Link>
                )}
                <div className="bg-primary/5 text-primary inline-flex h-[24px] items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wider">
                  {headerCtx.t.chatHeader.smartWorkbench}
                </div>
                <div className="hidden bg-border h-4 w-px lg:block" />
                <div className="min-w-0 text-[13px] font-medium tracking-tight overflow-hidden text-ellipsis whitespace-nowrap pt-0.5 max-w-[120px] sm:max-w-[200px]">
                  <ThreadTitle threadId={effectiveThreadId} thread={thread} />
                </div>
                <div className="hidden bg-border h-4 w-px lg:block" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md hover:bg-muted/70"
                  onClick={headerCtx.handleNewChat}
                  title={headerCtx.t.chatHeader.newSession}
                >
                  <SquarePen className="size-4" />
                </Button>
                <div className="bg-border h-4 w-px" />
                <Select
                  disabled={headerCtx.models.length === 0}
                  onValueChange={headerCtx.handleModelSelect}
                  value={headerCtx.selectedModelName}
                >
                  <SelectTrigger className="h-7 max-w-[200px] gap-1 border-0 bg-transparent px-1 text-xs font-medium text-foreground/70 hover:text-foreground focus:ring-0 shadow-none cursor-pointer group [&>svg]:size-3 [&>svg]:text-muted-foreground/60 [&>svg]:group-hover:text-muted-foreground [&>svg]:transition-colors">
                    <span className="truncate max-w-[140px] border-b border-dashed border-transparent group-hover:border-border/60 transition-colors pb-0.5">
                      {headerCtx.models.length > 0 ? headerCtx.selectedModelLabel : headerCtx.t.chatHeader.noModel}
                    </span>
                  </SelectTrigger>
                  <SelectContent align="start" className="w-[280px]" position="popper" side="bottom">
                    {headerCtx.models.map((m: any) => (
                      <SelectItem className="rounded-lg py-2" key={m.name} value={m.name}>
                        {headerCtx.resolveModelLabel(m) ?? m.model ?? m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="hidden bg-border h-4 w-px lg:block" />
              </div>
              <div className="flex items-center gap-1.5 shrink-0 pl-3 pointer-events-auto opacity-70 hover:opacity-100 transition-opacity">
                <TokenUsageIndicator messages={thread.messages} />
                <ArtifactTrigger threadId={effectiveThreadId} />
                <Sheet open={headerCtx.historyOpen} onOpenChange={headerCtx.setHistoryOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 rounded-md gap-1.5 px-2.5 text-muted-foreground hover:bg-muted/70 hover:text-foreground">
                      <History className="size-4" />
                      <span className="hidden md:inline">{headerCtx.t.chatHeader.executionRecords}</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[460px] sm:max-w-[460px] flex flex-col">
                    <SheetHeader className="shrink-0 border-b pb-3 px-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <SheetTitle>{headerCtx.t.chatHeader.executionRecords}</SheetTitle>
                          <SheetDescription>{headerCtx.t.chatHeader.executionRecordsDesc}</SheetDescription>
                        </div>
                        {!headerCtx.isSelectMode && (
                          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-xs font-normal mr-10" onClick={headerCtx.toggleSelectMode}>
                            <ListChecks className="size-3.5" />
                            {headerCtx.t.common.manage}
                          </Button>
                        )}
                      </div>
                    </SheetHeader>
                    {headerCtx.isSelectMode && (
                      <div className="shrink-0 mx-4 mt-3 flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/10 px-4 py-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                        <button type="button" className="text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={headerCtx.toggleSelectMode}>
                          {headerCtx.t.common.cancelSelection}
                        </button>
                        <div className="h-4 w-px bg-border" />
                        <span className="text-sm font-medium text-foreground">{headerCtx.t.common.selectedCount(headerCtx.selectedCount)}</span>
                        <div className="flex-1" />
                        <button type="button" className="text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={headerCtx.toggleSelectAll}>
                          {headerCtx.isAllSelected ? headerCtx.t.common.deselectAll : headerCtx.t.common.selectAll}
                        </button>
                        <Button variant="destructive" size="sm" className="h-7 gap-1.5 px-3 text-xs" disabled={headerCtx.selectedCount === 0} onClick={() => headerCtx.setBatchDeleteDialogOpen(true)}>
                          <Trash2 className="size-3.5" />
                          {headerCtx.t.common.delete}
                        </Button>
                      </div>
                    )}
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                      {headerCtx.recentThreads.length === 0 ? (
                        <div className="text-muted-foreground py-10 text-center text-sm">{headerCtx.t.chatHeader.noExecutionRecords}</div>
                      ) : (
                        <div className={cn("space-y-1 pt-3", headerCtx.isSelectMode && "pb-2")}>
                          {headerCtx.recentThreads.map((item: any) => {
                            const active = item.thread_id === headerCtx.activeThreadId;
                            const isSelected = headerCtx.selectedIds.has(item.thread_id);
                            return (
                              <div key={item.thread_id} className={cn("group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all duration-150", active && !headerCtx.isSelectMode && "border-primary/35 bg-primary/5", headerCtx.isSelectMode && isSelected && "border-primary/30 bg-primary/5", headerCtx.isSelectMode && !isSelected && "opacity-60")}>
                                {headerCtx.isSelectMode && (
                                  <button type="button" className="shrink-0 rounded-md border p-0.5 transition-all duration-150" style={{ borderColor: isSelected ? "hsl(var(--primary))" : "hsl(var(--border))", background: isSelected ? "hsl(var(--primary) / 0.1)" : "transparent" }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); headerCtx.toggleSelectOne(item.thread_id); }}>
                                    {isSelected ? (
                                      <svg className="size-3.5 text-primary" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    ) : (<div className="size-3.5" />)}
                                  </button>
                                )}
                                <div role="link" tabIndex={0} className="min-w-0 flex-1 cursor-pointer" onClick={() => { if (headerCtx.isSelectMode) { headerCtx.toggleSelectOne(item.thread_id); } else { headerCtx.handleOpenThread(item.thread_id); } }} onKeyDown={(e) => { if (e.key === "Enter" && !headerCtx.isSelectMode) { headerCtx.handleOpenThread(item.thread_id); } }}>
                                  <div className="truncate text-sm font-medium">{titleOfThread(item)}</div>
                                  {item.updated_at && (<div className="text-muted-foreground mt-0.5 text-xs">{formatTimeAgo(item.updated_at)}</div>)}
                                </div>
                                {!headerCtx.isSelectMode && (
                                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.preventDefault(); e.stopPropagation(); headerCtx.setDeleteTargetThreadId(item.thread_id); headerCtx.setDeleteDialogOpen(true); }}>
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </header>
          )}
          <main className="flex min-h-0 max-w-full grow flex-col">
            <div className="mx-auto flex size-full max-w-5xl min-w-0 flex-col px-6 pb-4 pt-5">
              <div className="relative flex min-h-0 flex-1 flex-col">
                {isNewThread && thread.messages.length === 0 && (
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center">
                    <div className="mx-auto flex w-full max-w-(--container-width-md) flex-col items-center justify-center rounded-3xl p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
                      <h2 className="text-xl font-semibold tracking-tight text-foreground">{t.chatHeader.startNewTask}</h2>
                      <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                        {t.chatHeader.startNewTaskDesc.split("<br />").map((line, i) => (
                          <span key={i}>
                            {i > 0 && <br />}
                            {line}
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                )}
                {isThreadConnecting && (
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center">
                    <div className="mx-auto flex flex-col items-center justify-center gap-3 rounded-3xl p-8 text-center animate-in fade-in duration-300">
                      <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t.chatHeader.loadingThread}</p>
                    </div>
                  </div>
                )}
                {sourceIncident && !incidentCardDismissed && (
                  <div className="shrink-0 rounded-xl border border-indigo-200/80 dark:border-indigo-800/80 bg-indigo-50/30 dark:bg-indigo-950/10 px-4 py-3 mx-auto w-full max-w-5xl sticky top-16 z-10 mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold text-zinc-500">
                        {sourceIncident.incident_key}
                      </span>
                      <Badge variant="outline" className={`${getSeverityBadgeStyles(sourceIncident.severity)} border font-medium px-2 py-0.5 rounded text-[10px] uppercase`}>
                        {sourceIncident.severity}
                      </Badge>
                      {sourceIncident.status === "firing" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/20 dark:text-rose-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                          Firing
                        </span>
                      )}
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                        {sourceIncident.title ?? "未命名告警"}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        Service: {sourceIncident.service ?? "—"} · Env: {sourceIncident.environment ?? "—"}
                      </span>
                      <Link
                        href={`/workspace/incidents/${encodeURIComponent(sourceIncident.id)}`}
                        className="ml-auto text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium whitespace-nowrap"
                      >
                        ← 告警详情
                      </Link>
                      <button
                        type="button"
                        onClick={() => setIncidentCardDismissed(true)}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                        title="关闭"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <MessageList
                  className={cn("size-full min-h-0 flex-1 bg-transparent")}
                  threadId={effectiveThreadId}
                  thread={filteredThread}
                  paddingBottom={180}
                  availableAttachmentKeys={availableAttachmentKeys}
                  onRetryHumanMessage={handleRetryHumanMessage}
                  onSubmitClarification={(text) => handleSubmit({ text, files: [] })}
                />
              </div>

              <div className="sticky bottom-0 z-20 flex justify-center pb-2 pt-3">
                <div className="relative w-full max-w-5xl">
                  <div className="pointer-events-none absolute inset-x-0 -top-6 h-8 bg-linear-to-t from-background via-background/70 to-transparent" />
                  <div
                    className={cn(
                      "relative z-10 transition-all duration-300",
                      (todosHidden || !thread.values.todos || thread.values.todos.length === 0)
                        ? "hidden"
                        : "mb-4",
                    )}
                  >
                    <TodoList
                      className="rounded-2xl"
                      todos={thread.values.todos ?? []}
                      hidden={
                        todosHidden ||
                        !thread.values.todos ||
                        thread.values.todos.length === 0
                      }
                      onClose={() => setTodosHidden(true)}
                    />
                  </div>
                  <ThreadAttachmentsPanel
                    attachments={threadAttachments}
                    selectedAttachmentIds={selectedAttachmentIds}
                    newlyUploadedPreferredIds={newlyUploadedPreferredIds}
                    onToggleAttachment={handleToggleAttachment}
                    onDeleteAttachment={handleDeleteAttachment}
                    onClearSelection={handleClearAttachmentSelection}
                    onSelectOnlyNewUploads={handleSelectOnlyNewUploads}
                  />
                  <InputBox
                    className={cn("w-full")}
                    isNewThread={isNewThread}
                    threadId={effectiveThreadId}
                    autoFocus={false}
                    status={
                      thread.error && !isRateLimited
                        ? "error"
                        : thread.isLoading
                          ? "streaming"
                          : "ready"
                    }
                    context={context}
                    disabled={env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" || isUploading}
                    onContextChange={onContextChange}
                    onSubmit={handleSubmit}
                    onStop={handleStop}
                    onNewChat={() => {
                      void handleStop();
                      openThread("new");
                    }}
                  />
                  {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" && (
                    <div className="text-muted-foreground/67 pt-3 text-center text-xs">
                      {t.common.notAvailableInDemoMode}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </ChatBox>
    </ThreadContext.Provider>
    </PromptInputProvider>
    </ArtifactsProvider>
    </SubtasksProvider>
  );
}
