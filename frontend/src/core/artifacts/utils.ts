import { getBackendBaseURL } from "../config";
import type { AgentThread } from "../threads";

function withToken(url: string, token?: string) {
  if (!token) {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

export function ensureLeadingSlash(path: string): string {
  if (!path) return "/";
  if (path.includes("://") || path.startsWith("write-file:") || path.startsWith("mcp-result:") || path.startsWith("file:")) {
    return path;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

export function urlOfArtifact({
  filepath,
  threadId,
  download = false,
  isMock = false,
  token,
}: {
  filepath: string;
  threadId: string;
  download?: boolean;
  isMock?: boolean;
  token?: string;
}) {
  const cleanPath = ensureLeadingSlash(filepath);
  if (isMock) {
    return withToken(
      `${getBackendBaseURL()}/mock/api/threads/${threadId}/artifacts${cleanPath}${download ? "?download=true" : ""}`,
      token,
    );
  }
  return withToken(
    `${getBackendBaseURL()}/api/threads/${threadId}/artifacts${cleanPath}${download ? "?download=true" : ""}`,
    token,
  );
}

export function extractArtifactsFromThread(thread: AgentThread) {
  return thread.values.artifacts ?? [];
}

export function resolveArtifactURL(
  absolutePath: string,
  threadId: string,
  token?: string,
) {
  const cleanPath = ensureLeadingSlash(absolutePath);
  return withToken(
    `${getBackendBaseURL()}/api/threads/${threadId}/artifacts${cleanPath}`,
    token,
  );
}
