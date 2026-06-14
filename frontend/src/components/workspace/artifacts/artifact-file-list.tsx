import {
  ChevronRightIcon,
  DownloadIcon,
  FolderIcon,
  FolderOpenIcon,
  LoaderIcon,
  PackageIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useThread } from "@/components/workspace/messages/context";
import { fetchAuthApi } from "@/core/api/auth-client";
import { loadArtifactContentFromToolCall } from "@/core/artifacts/loader";
import { ensureLeadingSlash, urlOfArtifact } from "@/core/artifacts/utils";
import { useI18n } from "@/core/i18n/hooks";
import { installSkill } from "@/core/skills/api";
import { useCurrentTenant } from "@/core/tenants/hooks";
import {
  getFileIcon,
  getFileName,
} from "@/core/utils/files";
import { cn } from "@/lib/utils";

import { useArtifacts } from "./context";

type TreeNode = {
  id: string;
  name: string;
  children: TreeNode[];
  file?: string;
  fullPath?: string;
};

function normalizeArtifactPath(file: string) {
  let rawPath = file;

  if (file.startsWith("write-file:") || file.startsWith("mcp-result:")) {
    try {
      rawPath = decodeURIComponent(new URL(file).pathname);
    } catch {
      rawPath = file;
    }
  } else {
    rawPath = file.split("?")[0] ?? file;
  }

  const normalizedPath = rawPath
    .replace(/^\/?mnt\/user-data\/(outputs|workspace)\//, "")
    .replace(/^\/+/, "");

  return {
    fullPath: rawPath,
    displayPath: normalizedPath || rawPath,
  };
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    const aIsFolder = !a.file;
    const bIsFolder = !b.file;
    if (aIsFolder !== bIsFolder) {
      return aIsFolder ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const child of node.children) {
    if (!child.file) {
      sortTree(child);
    }
  }
}

function buildArtifactTree(files: string[]) {
  const root: TreeNode = { id: "root", name: "", children: [] };
  const folderIds = new Set<string>();

  for (const file of files) {
    const { fullPath, displayPath } = normalizeArtifactPath(file);
    const parts = displayPath.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    let cursor = root;
    let currentPath = "";

    for (const [index, part] of parts.entries()) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;

      if (isLeaf) {
        cursor.children.push({
          id: `${file}#${currentPath}`,
          name: part,
          children: [],
          file,
          fullPath,
        });
        break;
      }

      const folderId = `folder:${currentPath}`;
      folderIds.add(folderId);
      let child = cursor.children.find((node) => node.id === folderId && !node.file);
      if (!child) {
        child = {
          id: folderId,
          name: part,
          children: [],
        };
        cursor.children.push(child);
      }
      cursor = child;
    }
  }

  sortTree(root);

  return { root, folderIds };
}

export function ArtifactFileList({
  className,
  files,
  threadId,
}: {
  className?: string;
  files: string[];
  threadId: string;
}) {
  const { t } = useI18n();
  const { select: selectArtifact, setOpen } = useArtifacts();
  const { data: currentTenant } = useCurrentTenant();
  const [installingFile, setInstallingFile] = useState<string | null>(null);
  const canInstallSkill = currentTenant?.role === "tenant_admin";

  const { root, folderIds } = useMemo(() => buildArtifactTree(files), [files]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Expand all folders by default to keep file discovery fast.
    setExpandedFolders(new Set(folderIds));
  }, [folderIds]);

  const handleClick = useCallback(
    (filepath: string) => {
      selectArtifact(filepath);
      setOpen(true);
    },
    [selectArtifact, setOpen],
  );

  const handleInstallSkill = useCallback(
    async (e: React.MouseEvent, filepath: string) => {
      e.stopPropagation();
      e.preventDefault();

      if (installingFile) return;

      setInstallingFile(filepath);
      try {
        const result = await installSkill({
          thread_id: threadId,
          path: filepath,
        });
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(result.message ?? "Failed to install skill");
        }
      } catch (error) {
        console.error("Failed to install skill:", error);
        toast.error("Failed to install skill");
      } finally {
        setInstallingFile(null);
      }
    },
    [threadId, installingFile],
  );

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const isFolder = !node.file;
    const leftPadding = 8 + depth * 14;

    if (isFolder) {
      const isExpanded = expandedFolders.has(node.id);
      return (
        <li key={node.id}>
          <button
            type="button"
            className="hover:bg-muted/50 flex w-full items-center gap-2 rounded px-2 py-1 text-left"
            style={{ paddingLeft: leftPadding }}
            onClick={() => toggleFolder(node.id)}
          >
            <ChevronRightIcon
              className={cn("text-muted-foreground size-4 transition-transform", isExpanded && "rotate-90")}
            />
            {isExpanded ? (
              <FolderOpenIcon className="text-muted-foreground size-4" />
            ) : (
              <FolderIcon className="text-muted-foreground size-4" />
            )}
            <span className="text-sm font-medium">{node.name}</span>
          </button>
          {isExpanded && node.children.length > 0 && (
            <ul className="mt-1 space-y-1">{node.children.map((child) => renderNode(child, depth + 1))}</ul>
          )}
        </li>
      );
    }

    const file = node.file!;
    const isSkill = file.endsWith(".skill") || file.endsWith(".zip");

    return (
      <li key={node.id}>
        <div
          className="hover:bg-muted/50 flex w-full items-center gap-2 rounded px-2 py-1"
          style={{ paddingLeft: leftPadding }}
          onClick={() => handleClick(file)}
        >
          <div className="text-muted-foreground">{getFileIcon(node.name, "size-4")}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{node.name}</div>
          </div>
          <div className="flex items-center gap-1">
            {isSkill && canInstallSkill && (
              <Button
                variant="ghost"
                size="sm"
                disabled={installingFile === file}
                onClick={(e) => handleInstallSkill(e, file)}
              >
                {installingFile === file ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <PackageIcon className="size-4" />
                )}
                {t.common.install}
              </Button>
            )}
            <ArtifactDownloadButton file={file} threadId={threadId} />
          </div>
        </div>
      </li>
    );
  };

  return (
    <ul className={cn("w-full space-y-1", className)}>
      {root.children.map((node) => renderNode(node, 0))}
    </ul>
  );
}


function ArtifactDownloadButton({ file, threadId }: { file: string; threadId: string }) {
  const { t } = useI18n();
  const { thread, isMock } = useThread();
  const downloadName = useMemo(() => {
    if (file.startsWith("mcp-result:") || file.startsWith("write-file:")) {
      try {
        const pathname = decodeURIComponent(new URL(file).pathname);
        const parts = pathname.split("/").filter(Boolean);
        return parts[parts.length - 1] ?? "artifact.txt";
      } catch {
        return getFileName(file);
      }
    }
    return getFileName(file);
  }, [file]);

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (file.startsWith("mcp-result:") || file.startsWith("write-file:")) {
      e.preventDefault();
      const content = loadArtifactContentFromToolCall({ url: file, thread });
      if (content) {
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
  }, [downloadName, file, thread]);

  const handleDownloadArtifact = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    try {
      if (isMock) {
        const a = document.createElement("a");
        a.href = urlOfArtifact({
          filepath: file,
          threadId,
          isMock,
          download: true,
        });
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const response = await fetchAuthApi(
        `/api/threads/${threadId}/artifacts${ensureLeadingSlash(file)}?download=true`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download artifact:", error);
      toast.error(t.common.downloadFailed);
    }
  }, [downloadName, file, isMock, threadId]);

  if (file.startsWith("mcp-result:") || file.startsWith("write-file:")) {
    return (
      <Button variant="ghost" onClick={handleDownload}>
        <DownloadIcon className="size-4" />
        {t.common.download}
      </Button>
    );
  }

  return (
    <Button variant="ghost" onClick={handleDownloadArtifact}>
      <DownloadIcon className="size-4" />
      {t.common.download}
    </Button>
  );
}
