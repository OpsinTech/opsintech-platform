"use client";

import {
  FolderIcon,
  FolderPlus,
  Upload,
  Search,
  Trash2,
  Download,
  ArrowLeft,
  Loader2,
  FileIcon,
  MoreHorizontal,
  Grid3X3,
  List,
  Filter,
  ChevronRight,
  Home,
  HardDrive,
  X,
} from "lucide-react";
import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/core/i18n/hooks";
import {
  useFolders,
  useFiles,
  useCreateFolder,
  useDeleteFolder,
  useUploadFile,
  useDeleteFile,
} from "@/core/files/hooks";
import { getDownloadUrl } from "@/core/files/api";
import { FilePreviewSheet } from "@/components/workspace/files/file-preview-sheet";
import {
  formatFileSize,
  getFileTypeIcon,
  getSourceTypeColor,
  getSourceTypeLabel,
} from "@/core/files/types";
import type { FileFolder, FileObject } from "@/core/files/types";
import { cn } from "@/lib/utils";

export default function FileCenterPage() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);

  // UI state
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<FileObject | null>(null);

  // Data
  const { data: folders = [], isLoading: foldersLoading } = useFolders(currentFolderId);
  const {
    data: files = [],
    isLoading: filesLoading,
  } = useFiles({
    parent_folder_id: currentFolderId ?? undefined,
    source_type: sourceFilter !== "all" ? sourceFilter : undefined,
  });

  // Mutations
  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const uploadFile = useUploadFile();
  const deleteFile = useDeleteFile();

  // Navigation
  const navigateToFolder = (folder: FileFolder) => {
    setFolderStack((prev) => [...prev, { id: folder.id, name: folder.display_name }]);
    setCurrentFolderId(folder.id);
  };

  const navigateUp = () => {
    if (folderStack.length <= 1) {
      setFolderStack([]);
      setCurrentFolderId(null);
      return;
    }
    const newStack = folderStack.slice(0, -1);
    setFolderStack(newStack);
    setCurrentFolderId(newStack[newStack.length - 1].id);
  };

  const navigateToRoot = () => {
    setFolderStack([]);
    setCurrentFolderId(null);
  };

  // Handlers
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder.mutateAsync({
        display_name: newFolderName.trim(),
        parent_id: currentFolderId,
        visibility: "private",
      });
      toast.success(t.fileCenter.messages.folderCreated(newFolderName.trim()));
      setNewFolderName("");
      setShowCreateFolder(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.fileCenter.messages.createFolderFailed);
    }
  };

  const handleFileUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      for (const file of Array.from(fileList)) {
        setUploadingFiles((prev) => [...prev, file.name]);
        try {
          await uploadFile.mutateAsync({
            file,
            options: {
              parent_folder_id: currentFolderId ?? undefined,
              visibility: "private",
            },
          });
          toast.success(t.fileCenter.messages.fileUploaded(file.name));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t.fileCenter.messages.uploadFailed(file.name));
        } finally {
          setUploadingFiles((prev) => prev.filter((n) => n !== file.name));
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [currentFolderId, uploadFile, t.fileCenter.messages],
  );

  const handleDeleteFile = async (file: FileObject) => {
    if (!confirm(t.fileCenter.deleteConfirm.file(file.display_name))) return;
    try {
      await deleteFile.mutateAsync(file.id);
      toast.success(t.fileCenter.messages.fileDeleted(file.display_name));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.fileCenter.messages.deleteFileFailed);
    }
  };

  const handleDeleteFolder = async (folder: FileFolder) => {
    if (!confirm(t.fileCenter.deleteConfirm.folder(folder.display_name))) return;
    try {
      await deleteFolder.mutateAsync(folder.id);
      toast.success(t.fileCenter.messages.folderDeleted(folder.display_name));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.fileCenter.messages.deleteFolderFailed);
    }
  };

  const handleDownload = (file: FileObject) => {
    const url = getDownloadUrl(file.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.original_filename || file.display_name;
    a.click();
  };

  // Filter by search
  const filteredFolders = folders.filter((f) =>
    f.display_name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const filteredFiles = files.filter((f) =>
    f.display_name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const isLoading = foldersLoading || filesLoading;
  const isEmpty = filteredFolders.length === 0 && filteredFiles.length === 0 && !isLoading;

  const currentFolderName =
    folderStack.length > 0 ? (folderStack[folderStack.length - 1]?.name ?? t.fileCenter.rootFolder) : t.fileCenter.rootFolder;

  return (
    <div className="flex size-full flex-col bg-zinc-50/50 dark:bg-zinc-950/20 overflow-hidden animate-in fade-in duration-300">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-900/30 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            {folderStack.length > 0 && (
              <button
                onClick={navigateUp}
                className="p-1.5 mr-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                title="Go up"
              >
                <ArrowLeft className="size-4.5" />
              </button>
            )}

            <div className="flex items-center text-sm font-medium min-w-0">
              <button
                onClick={navigateToRoot}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors shrink-0",
                  currentFolderId === null
                    ? "text-foreground font-semibold cursor-default"
                    : "text-muted-foreground hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800"
                )}
              >
                <HardDrive className="size-4" />
                <span className="hidden sm:inline">{t.fileCenter.rootFolder}</span>
              </button>

              {folderStack.map((item, i) => {
                const isLast = i === folderStack.length - 1;
                return (
                  <div key={item.id} className="flex items-center min-w-0 shrink-0">
                    <ChevronRight className="size-4 text-muted-foreground/40 mx-0.5 shrink-0" />
                    <button
                      onClick={() => {
                        if (isLast) return;
                        const newStack = folderStack.slice(0, i + 1);
                        setFolderStack(newStack);
                        setCurrentFolderId(item.id);
                      }}
                      className={cn(
                        "px-2.5 py-1.5 rounded-md truncate max-w-[120px] sm:max-w-[200px] transition-colors",
                        isLast
                          ? "text-foreground font-semibold cursor-default"
                          : "text-muted-foreground hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800"
                      )}
                      title={item.name}
                    >
                      {item.name}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateFolder(true)}
              className="gap-1.5"
            >
              <FolderPlus className="size-4" />
              <span className="hidden sm:inline">{t.fileCenter.newFolder}</span>
            </Button>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              <Upload className="size-4" />
              <span className="hidden sm:inline">{t.fileCenter.upload}</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </div>
        </div>

        {/* Search & Filter bar */}
        <div className="flex items-center gap-3 mt-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder={t.fileCenter.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-9">
                <Filter className="size-3.5" />
                {sourceFilter === "all" ? t.fileCenter.allTypes : (t.fileCenter.sourceTypes[sourceFilter] || getSourceTypeLabel(sourceFilter))}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSourceFilter("all")}>
                {t.fileCenter.allTypes}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSourceFilter("upload")}>
                {t.fileCenter.sourceTypes.upload}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSourceFilter("ai_generated")}>
                {t.fileCenter.sourceTypes.aiGenerated}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSourceFilter("business_attachment")}>
                {t.fileCenter.sourceTypes.business}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center rounded-lg border bg-background p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewMode === "grid"
                  ? "bg-zinc-200 dark:bg-zinc-700 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Grid3X3 className="size-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                viewMode === "list"
                  ? "bg-zinc-200 dark:bg-zinc-700 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="size-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : isEmpty ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-muted-foreground">
            <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-6">
              <HardDrive className="size-10 opacity-30" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{t.fileCenter.messages.emptyState}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreateFolder(true)}>
                <FolderPlus className="mr-1.5 size-3.5" />
                {t.fileCenter.newFolder}
              </Button>
              <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-1.5 size-3.5" />
                {t.fileCenter.upload}
              </Button>
            </div>
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredFolders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onClick={() => navigateToFolder(folder)}
                onDelete={() => handleDeleteFolder(folder)}
              />
            ))}
            {filteredFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onClick={() => setPreviewFile(file)}
                onDownload={() => handleDownload(file)}
                onDelete={() => handleDeleteFile(file)}
              />
            ))}
          </div>
        ) : (
          /* List View */
          <div className="flex flex-col gap-1">
            {filteredFolders.map((folder) => (
              <FolderRow
                key={folder.id}
                folder={folder}
                onClick={() => navigateToFolder(folder)}
                onDelete={() => handleDeleteFolder(folder)}
              />
            ))}
            {filteredFiles.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                onClick={() => setPreviewFile(file)}
                onDownload={() => handleDownload(file)}
                onDelete={() => handleDeleteFile(file)}
              />
            ))}
          </div>
        ) }

        {/* Upload progress */}
        {uploadingFiles.length > 0 && (
          <div className="fixed bottom-6 right-6 z-50 w-72 rounded-xl border bg-card p-4 shadow-lg animate-in slide-in-from-bottom-4 duration-300">
            <p className="text-sm font-medium mb-2">{t.common.uploadingFiles}</p>
            {uploadingFiles.map((name) => (
              <div key={name} className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="size-3 animate-spin" />
                <span className="truncate">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Folder Dialog ──────────────────────────────────────── */}
      <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t.fileCenter.newFolder}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder={t.fileCenter.newFolder}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFolder(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={createFolder.isPending || !newFolderName.trim()}
            >
              {createFolder.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t.common.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FilePreviewSheet
        file={previewFile}
        open={previewFile !== null}
        onOpenChange={(open) => !open && setPreviewFile(null)}
      />
    </div>
  );
}

// ── Card Components ────────────────────────────────────────────────────────

function FolderCard({
  folder,
  onClick,
  onDelete,
}: {
  folder: FileFolder;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group relative flex flex-col items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/30 cursor-pointer"
      onClick={onClick}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
        title="Delete folder"
      >
        <Trash2 className="size-3.5" />
      </button>
      <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-4 transition-transform group-hover:scale-110 duration-200">
        <FolderIcon className="size-8 text-amber-600 dark:text-amber-400" />
      </div>
      <span className="text-sm font-medium text-center truncate w-full">{folder.display_name}</span>
    </div>
  );
}

function FileCard({
  file,
  onClick,
  onDownload,
  onDelete,
}: {
  file: FileObject;
  onClick: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const icon = getFileTypeIcon(file.mime_type);
  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md cursor-pointer hover:border-primary/30"
    >
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          className="p-1 rounded-md text-zinc-400 hover:text-primary hover:bg-primary/10 transition-colors"
          title="Download"
        >
          <Download className="size-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
          title="Delete"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-4 text-2xl transition-transform group-hover:scale-110 duration-200">
        {icon}
      </div>
      <div className="w-full min-w-0 text-center">
        <p className="text-sm font-medium truncate">{file.display_name}</p>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="text-[10px] text-muted-foreground">{formatFileSize(file.size_bytes)}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
              getSourceTypeColor(file.source_type),
            )}
          >
            {getSourceTypeLabel(file.source_type)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Row Components ─────────────────────────────────────────────────────────

function FolderRow({
  folder,
  onClick,
  onDelete,
}: {
  folder: FileFolder;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <FolderIcon className="size-5 text-amber-500 shrink-0" />
      <span className="flex-1 text-sm font-medium truncate">{folder.display_name}</span>
      <span className="text-xs text-muted-foreground">Folder</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1 rounded-md opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-500 transition-all"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function FileRow({
  file,
  onClick,
  onDownload,
  onDelete,
}: {
  file: FileObject;
  onClick: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const icon = getFileTypeIcon(file.mime_type);
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      <span className="text-lg shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.display_name}</p>
        <p className="text-[10px] text-muted-foreground">
          {file.extension} · {formatFileSize(file.size_bytes)}
        </p>
      </div>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
          getSourceTypeColor(file.source_type),
        )}
      >
        {getSourceTypeLabel(file.source_type)}
      </span>
      <span className="text-[10px] text-muted-foreground shrink-0">
        {new Date(file.created_at).toLocaleDateString()}
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          className="p-1 rounded-md text-zinc-400 hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <Download className="size-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
