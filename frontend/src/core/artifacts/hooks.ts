import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { useThread } from "@/components/workspace/messages/context";
import { getAuthToken } from "@/core/auth/auth-api";

import { loadArtifactContent, loadArtifactContentFromToolCall } from "./loader";

export function useArtifactAccessToken() {
  const [token, setToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const loadToken = async () => {
      try {
        const token = getAuthToken();
        if (!cancelled) {
          setToken(token ?? undefined);
        }
      } catch {
        if (!cancelled) {
          setToken(undefined);
        }
      }
    };

    void loadToken();

    return () => {
      cancelled = true;
    };
  }, []);

  return token;
}

export function useArtifactContent({
  filepath,
  threadId,
  enabled = true,
}: {
  filepath: string;
  threadId: string;
  enabled?: boolean;
}) {
  const isWriteFile = useMemo(() => {
    return filepath.startsWith("write-file:");
  }, [filepath]);
  const isMCPResult = useMemo(() => {
    return filepath.startsWith("mcp-result:");
  }, [filepath]);
  const { thread, isMock } = useThread();
  const content = useMemo(() => {
    if (isWriteFile || isMCPResult) {
      return loadArtifactContentFromToolCall({ url: filepath, thread }) ?? null;
    }
    return null;
  }, [filepath, isWriteFile, isMCPResult, thread]);

  const cleanPath = useMemo(() => {
    if (isWriteFile || isMCPResult) {
      try {
        const url = new URL(filepath);
        return decodeURIComponent(url.pathname);
      } catch {
        return filepath;
      }
    }
    return filepath;
  }, [filepath, isWriteFile, isMCPResult]);

  // Only fetch from API for real filesystem artifacts, not virtual ones (write-file/mcp-result).
  // Virtual artifacts are extracted from messages — if content is null, the messages may
  // have been summarised away, but there is no filesystem counterpart to fallback to.
  const isQueryEnabled = enabled && (!isWriteFile && !isMCPResult);

  const { data, isLoading, error } = useQuery({
    queryKey: ["artifact", cleanPath, threadId, isMock],
    queryFn: () => {
      return loadArtifactContent({ filepath: cleanPath, threadId, isMock });
    },
    enabled: isQueryEnabled,
    // Cache artifact content for 5 minutes to avoid repeated fetches (especially for .skill ZIP extraction)
    staleTime: 5 * 60 * 1000,
  });
  return {
    content: (isWriteFile || isMCPResult) && content ? content : data,
    isLoading: isQueryEnabled ? isLoading : false,
    error: (isWriteFile || isMCPResult) && !isQueryEnabled && !content
      ? new Error("文件内容已被摘要压缩，请从 sandbox 文件系统重新读取")
      : error,
  };
}
