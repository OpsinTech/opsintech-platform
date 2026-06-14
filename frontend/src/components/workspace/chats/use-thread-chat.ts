"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { uuid } from "@/core/utils/uuid";

const NEW_THREAD_PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";

export function useThreadChat(overrideThreadId?: string | null) {
  const { thread_id: threadIdFromPath } = useParams<{ thread_id: string }>();
  const effectiveThreadId = overrideThreadId ?? threadIdFromPath;

  const searchParams = useSearchParams();

  const isNewRef = useRef(effectiveThreadId === "new");

  const [threadId, setThreadId] = useState(() => {
    return effectiveThreadId === "new"
      ? NEW_THREAD_PLACEHOLDER_ID
      : effectiveThreadId;
  });

  const [isNewThread, setIsNewThread] = useState(
    () => effectiveThreadId === "new",
  );

  useEffect(() => {
    if (effectiveThreadId === "new") {
      isNewRef.current = true;
      setIsNewThread(true);
      setThreadId(uuid());
      return;
    }

    if (effectiveThreadId) {
      isNewRef.current = false;
      setIsNewThread(false);
      setThreadId(effectiveThreadId);
    }
  }, [effectiveThreadId]);

  const isMock = searchParams.get("mock") === "true";
  return { threadId, setThreadId, isNewThread, setIsNewThread, isMock };
}
