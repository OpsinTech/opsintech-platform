"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { useAvailableModels } from "@/core/models/hooks";
import type { useI18n } from "@/core/i18n/hooks";
import type { AgentThread } from "@/core/threads";

export interface ChatHeaderContextType {
  t: ReturnType<typeof useI18n>["t"];
  incidentId: string | null;
  handleNewChat: () => void;
  models: ReturnType<typeof useAvailableModels>["models"];
  selectedModelName: string | undefined;
  selectedModelLabel: string;
  resolveModelLabel: (model?: { display_name?: string | null; name?: string | null }) => string | undefined;
  handleModelSelect: (model_name: string) => void;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  recentThreads: AgentThread[];
  activeThreadId: string | null;
  isSelectMode: boolean;
  selectedIds: Set<string>;
  selectedCount: number;
  isAllSelected: boolean;
  toggleSelectMode: () => void;
  toggleSelectOne: (tid: string) => void;
  toggleSelectAll: () => void;
  handleOpenThread: (tid: string) => void;
  setDeleteTargetThreadId: (tid: string) => void;
  setDeleteDialogOpen: (open: boolean) => void;
  handleDelete: (tid: string) => void;
  setBatchDeleteDialogOpen: (open: boolean) => void;
  confirmBatchDelete: () => void;
  deleteDialogOpen: boolean;
  deleteTargetThreadId: string | null;
  batchDeleteDialogOpen: boolean;
}

const ChatHeaderContext = createContext<ChatHeaderContextType | undefined>(undefined);

export function useChatHeader() {
  const ctx = useContext(ChatHeaderContext);
  if (!ctx) throw new Error("useChatHeader must be used within ChatHeaderProvider");
  return ctx;
}

export function ChatHeaderProvider({ value, children }: { value: ChatHeaderContextType; children: ReactNode }) {
  return <ChatHeaderContext.Provider value={value}>{children}</ChatHeaderContext.Provider>;
}
