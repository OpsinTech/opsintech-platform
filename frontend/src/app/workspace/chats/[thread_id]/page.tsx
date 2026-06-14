"use client";

import { Loader2Icon } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChatTabs } from "@/components/workspace/chats/chat-tabs-context";
import { ChatHeaderProvider } from "@/components/workspace/chats/chat-header-context";
import { useI18n } from "@/core/i18n/hooks";
import { useAvailableModels } from "@/core/models/hooks";
import { useLocalSettings } from "@/core/settings";
import {
  useDeleteThread,
  useThreads,
} from "@/core/threads/hooks";
import { pathOfThread } from "@/core/threads/utils";

import { ChatThreadContent } from "./chat-thread-content";

export default function ChatPage() {
  const { t } = useI18n();
  const { thread_id: urlThreadId } = useParams<{ thread_id: string }>();
  const searchParams = useSearchParams();
  const incidentId = searchParams.get("incident");
  const {
    openedThreadIds,
    activeThreadId,
    openThread,
  } = useChatTabs();

  const [settings, setSettings] = useLocalSettings();

  // Register URL thread on mount.
  // If navigating back to /chats/new from another workspace menu and we already
  // have opened threads, restore the last active one instead of creating a new chat.
  useEffect(() => {
    if (urlThreadId === "new" && openedThreadIds.length > 0 && activeThreadId) {
      history.replaceState(null, "", pathOfThread(activeThreadId));
    } else if (urlThreadId === "new") {
      openThread("new");
    } else if (urlThreadId) {
      openThread(urlThreadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlThreadId]);

  // Clear skill selection when activeThreadId transitions to "new"
  const prevActiveThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevActiveThreadIdRef.current;
    prevActiveThreadIdRef.current = activeThreadId;
    if (activeThreadId === "new" && prev !== "new" && settings.context.skill_name) {
      setSettings("context", {
        ...settings.context,
        skill_name: undefined,
      });
    }
  }, [activeThreadId, settings.context, setSettings]);

  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: threads = [] } = useThreads();
  const { mutate: deleteThread } = useDeleteThread();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetThreadId, setDeleteTargetThreadId] = useState<string | null>(null);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);

  const selectedCount = selectedIds.size;

  const recentThreads = useMemo(() => threads.slice(0, 50), [threads]);
  const isAllSelected = selectedCount === recentThreads.length && recentThreads.length > 0;

  const handleDelete = useCallback(
    (targetThreadId: string) => {
      deleteThread({ threadId: targetThreadId });
      if (targetThreadId === activeThreadId) {
        setHistoryOpen(false);
      }
    },
    [deleteThread, activeThreadId],
  );

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const toggleSelectOne = useCallback((tid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) {
        next.delete(tid);
      } else {
        next.add(tid);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recentThreads.map((t) => t.thread_id)));
    }
  }, [isAllSelected, recentThreads]);

  const confirmBatchDelete = useCallback(() => {
    for (const tid of selectedIds) {
      deleteThread({ threadId: tid });
    }
    if (selectedIds.has(activeThreadId ?? "")) {
      setHistoryOpen(false);
    }
    setSelectedIds(new Set());
    setIsSelectMode(false);
    setBatchDeleteDialogOpen(false);
  }, [deleteThread, selectedIds, activeThreadId]);

  const handleNewChat = useCallback(() => {
    openThread("new");
  }, [openThread]);

  const handleOpenThread = useCallback((tid: string) => {
    setHistoryOpen(false);
    openThread(tid);
  }, [openThread]);

  const { models: availableModels } = useAvailableModels();
  const models = useMemo(() => {
    const seen = new Set<string>();
    return availableModels.filter((model) => {
      if (
        !model?.name
        || model.scope !== "tenant"
        || seen.has(model.name)
        || model.enabled === false
      ) {
        return false;
      }
      seen.add(model.name);
      return true;
    });
  }, [availableModels]);

  const resolveModelLabel = useCallback(
    (model?: { display_name?: string | null; name?: string | null }) => {
      const displayName = model?.display_name?.trim();
      if (displayName) return displayName;
      const name = model?.name?.trim();
      if (name) return name;
      return undefined;
    },
    [],
  );

  const selectedModel = useMemo(() => {
    if (models.length === 0) return undefined;
    return models.find((m) => m.name === settings.context.model_name) ?? models[0];
  }, [models, settings.context.model_name]);

  const selectedModelLabel = useMemo(() => {
    const label = resolveModelLabel(selectedModel);
    if (label) return label;
    if (typeof settings.context.model_name === "string") {
      const trimmed = settings.context.model_name.trim();
      if (trimmed) return trimmed;
    }
    return t.chatHeader.selectModel;
  }, [selectedModel, settings.context.model_name, resolveModelLabel]);

  const selectedModelName = useMemo(() => {
    if (selectedModel?.name) return selectedModel.name;
    if (typeof settings.context.model_name === "string" && settings.context.model_name.trim()) {
      return settings.context.model_name;
    }
    return undefined;
  }, [settings.context.model_name, selectedModel?.name]);

  const handleModelSelect = useCallback(
    (model_name: string) => {
      setSettings("context", {
        ...settings.context,
        model_name,
      });
    },
    [settings.context, setSettings],
  );

  const handleContextChange = useCallback(
    (newContext: typeof settings.context) => {
      setSettings("context", newContext);
    },
    [setSettings],
  );

  const headerContextValue = useMemo(() => ({
    t,
    incidentId,
    handleNewChat,
    models,
    selectedModelName,
    selectedModelLabel,
    resolveModelLabel,
    handleModelSelect,
    historyOpen,
    setHistoryOpen,
    recentThreads,
    activeThreadId,
    isSelectMode,
    selectedIds,
    selectedCount,
    isAllSelected,
    toggleSelectMode,
    toggleSelectOne,
    toggleSelectAll,
    handleOpenThread,
    setDeleteTargetThreadId,
    setDeleteDialogOpen,
    handleDelete,
    setBatchDeleteDialogOpen,
    confirmBatchDelete,
    deleteDialogOpen,
    deleteTargetThreadId,
    batchDeleteDialogOpen,
  }), [
    t, incidentId, handleNewChat, models, selectedModelName, selectedModelLabel,
    resolveModelLabel, handleModelSelect, historyOpen, recentThreads, activeThreadId,
    isSelectMode, selectedIds, selectedCount, isAllSelected, toggleSelectMode,
    toggleSelectOne, toggleSelectAll, handleOpenThread, handleDelete,
    deleteDialogOpen, deleteTargetThreadId, batchDeleteDialogOpen,
  ]);

  const tabContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative flex size-full min-h-0 flex-col bg-background">
      <ChatHeaderProvider value={headerContextValue}>

      {/* Tab container: all opened threads rendered, only active one visible */}
      <div ref={tabContainerRef} className="flex size-full min-h-0 flex-col">
        {openedThreadIds.map((tid) => (
          <div
            key={tid}
            className="size-full min-h-0"
            style={{ display: tid === activeThreadId ? undefined : "none" }}
            aria-hidden={tid !== activeThreadId}
          >
            <ChatThreadContent
              threadId={tid}
              context={settings.context}
              onContextChange={handleContextChange}
            />
          </div>
        ))}
        {openedThreadIds.length === 0 && (
          <div className="flex size-full min-h-0 items-center justify-center">
            <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      </ChatHeaderProvider>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t.common.deleteThreadConfirmTitle}</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">
            {t.common.deleteThreadConfirmDesc}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteTargetThreadId(null);
              }}
            >
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTargetThreadId) {
                  handleDelete(deleteTargetThreadId);
                }
                setDeleteDialogOpen(false);
                setDeleteTargetThreadId(null);
              }}
            >
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch delete dialog */}
      <Dialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t.common.batchDeleteConfirmTitle}</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">
            {t.common.batchDeleteConfirmDesc(selectedCount)}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBatchDeleteDialogOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmBatchDelete}
            >
              {t.common.batchDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
