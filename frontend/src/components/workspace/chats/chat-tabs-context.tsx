"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useRef, useState } from "react";

import { pathOfThread } from "@/core/threads/utils";

const MAX_OPENED_THREADS = 10;

export interface ChatTabsContextType {
  openedThreadIds: string[];
  activeThreadId: string | null;
  openThread: (threadId: string) => void;
  closeThread: (threadId: string) => void;
  isThreadOpened: (threadId: string) => boolean;
}

const ChatTabsContext = createContext<ChatTabsContextType | undefined>(
  undefined,
);

export function useChatTabs() {
  const context = useContext(ChatTabsContext);
  if (context === undefined) {
    throw new Error("useChatTabs must be used within a ChatTabsProvider");
  }
  return context;
}

export function ChatTabsProvider({ children }: { children: ReactNode }) {
  const [openedThreadIds, setOpenedThreadIds] = useState<string[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const openedThreadIdsRef = useRef<string[]>([]);
  const activeThreadIdRef = useRef<string | null>(null);

  openedThreadIdsRef.current = openedThreadIds;
  activeThreadIdRef.current = activeThreadId;

  const openThread = useCallback((threadId: string) => {
    setOpenedThreadIds((prev) => {
      if (prev.includes(threadId)) {
        return prev;
      }
      const next = [...prev, threadId];
      if (next.length > MAX_OPENED_THREADS) {
        const oldestInactiveIdx = next.findIndex(
          (id) => id !== threadId && id !== activeThreadIdRef.current && id !== "new",
        );
        if (oldestInactiveIdx !== -1) {
          next.splice(oldestInactiveIdx, 1);
          return [...next];
        }
      }
      return next;
    });
    setActiveThreadId(threadId);
    history.replaceState(null, "", pathOfThread(threadId));
  }, []);

  const closeThread = useCallback((threadId: string) => {
    const currentOpened = openedThreadIdsRef.current;
    const next = currentOpened.filter((id) => id !== threadId);
    setOpenedThreadIds(next);

    if (threadId === activeThreadIdRef.current) {
      const remaining = next[next.length - 1] ?? null;
      setActiveThreadId(remaining);
      if (remaining) {
        history.replaceState(null, "", pathOfThread(remaining));
      }
    }
  }, []);

  const isThreadOpened = useCallback(
    (threadId: string) => openedThreadIds.includes(threadId),
    [openedThreadIds],
  );

  return (
    <ChatTabsContext.Provider
      value={{
        openedThreadIds,
        activeThreadId,
        openThread,
        closeThread,
        isThreadOpened,
      }}
    >
      {children}
    </ChatTabsContext.Provider>
  );
}
