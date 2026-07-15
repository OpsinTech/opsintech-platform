"use client";

import {
  Download,
  ExternalLink,
  Eye,
  FileIcon,
  Loader2,
  X,
  Share2,
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodeEditor } from "@/components/workspace/code-editor";
import { getAuthHeaders } from "@/core/api/auth-client";
import { getPreviewUrl, getDownloadUrl } from "@/core/files/api";
import { formatFileSize, getFileTypeIcon, getSourceTypeColor, getSourceTypeLabel } from "@/core/files/types";
import type { FileObject } from "@/core/files/types";
import { checkCodeFile, getFileExtensionDisplayName } from "@/core/utils/files";
import { MarkdownContent } from "@/components/workspace/messages/markdown-content";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

interface FilePreviewSheetProps {
  file: FileObject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilePreviewSheet({
  file,
  open,
  onOpenChange,
}: FilePreviewSheetProps) {
  const { t } = useI18n();
  const [content, setContent] = useState<string | null>(null);
  const [binaryUrl, setBinaryUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");

  const isSupportRawToggle = useMemo(() => {
    if (!file) return false;
    const ext = file.display_name.toLowerCase().split(".").pop() || "";
    return ext === "md" || ext === "markdown" || ext === "html" || ext === "htm";
  }, [file]);

  useEffect(() => {
    setViewMode("preview");
  }, [file?.id]);

  const fileType = useMemo(() => {
    if (!file) return { isCode: false, isMarkdown: false, isHtml: false, isBinary: false, extension: "" };
    const name = file.display_name.toLowerCase();
    const ext = name.split(".").pop() || "";
    
    const { isCodeFile } = checkCodeFile(file.display_name);
    const isMarkdown = ext === "md" || ext === "markdown";
    const isHtml = ext === "html" || ext === "htm";
    const isImage = file.mime_type.startsWith("image/");
    const isPdf = file.mime_type === "application/pdf" || ext === "pdf";
    
    return {
      isCode: isCodeFile && !isMarkdown && !isHtml,
      isMarkdown,
      isHtml,
      isImage,
      isPdf,
      isBinary: isImage || isPdf,
      extension: ext,
    };
  }, [file]);

  useEffect(() => {
    if (!file || !open) {
      setContent(null);
      if (binaryUrl) {
        URL.revokeObjectURL(binaryUrl);
        setBinaryUrl(null);
      }
      return;
    }

    let active = true;
    const loadContent = async () => {
      setLoading(true);
      try {
        const previewUrl = getPreviewUrl(file.id);
        const response = await fetch(previewUrl, { headers: await getAuthHeaders() });
        if (!response.ok) {
          throw new Error(`Failed to load file preview: ${response.status}`);
        }

        if (fileType.isBinary) {
          const blob = await response.blob();
          if (active) {
            const objectUrl = URL.createObjectURL(blob);
            setBinaryUrl(objectUrl);
          }
        } else {
          const text = await response.text();
          if (active) {
            setContent(text);
          }
        }
      } catch (err) {
        console.error("Failed to load file preview:", err);
        toast.error("Failed to load file preview");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadContent();

    return () => {
      active = false;
    };
  }, [file, open, fileType.isBinary]);

  // Clean up Object URL on unmount
  useEffect(() => {
    return () => {
      if (binaryUrl) {
        URL.revokeObjectURL(binaryUrl);
      }
    };
  }, [binaryUrl]);

  if (!file) return null;

  const downloadUrl = getDownloadUrl(file.id);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = file.original_filename || file.display_name;
    a.click();
  };

  const handleOpenNewTab = () => {
    if (binaryUrl) {
      window.open(binaryUrl, "_blank");
    } else {
      window.open(getPreviewUrl(file.id), "_blank");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        showCloseButton={false}
        className="w-[94vw] max-w-5xl sm:max-w-[94vw] md:max-w-4xl lg:max-w-5xl xl:max-w-6xl h-[88vh] flex flex-col p-0 overflow-hidden bg-background border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 outline-none"
      >
        {/* Premium Header with Blur */}
        <header className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800/60 px-6 py-4 shrink-0 bg-white/85 dark:bg-zinc-950/85 backdrop-blur-xl z-10 shadow-sm">
          <div className="flex items-center gap-4 flex-1 min-w-0 mr-4">
            <div className="flex items-center justify-center size-12 shrink-0 rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-100/80 dark:from-zinc-800/80 dark:to-zinc-900 border border-zinc-200/60 dark:border-zinc-700/50 shadow-sm text-2xl">
              {getFileTypeIcon(file.mime_type)}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-[17px] font-semibold tracking-tight truncate leading-snug text-zinc-900 dark:text-zinc-100">
                {file.display_name}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-hidden">
                <span className="font-medium text-zinc-700 dark:text-zinc-300 shrink-0">{getFileExtensionDisplayName(file.display_name)}</span>
                <span className="opacity-30 shrink-0">•</span>
                <span className="shrink-0">{formatFileSize(file.size_bytes)}</span>
                <span className="opacity-30 shrink-0">•</span>
                <span className="shrink-0">{new Date(file.created_at).toLocaleString()}</span>
                
                {/* Source & Visibility Badges */}
                <span className="opacity-30 shrink-0">•</span>
                <Badge 
                  variant="outline" 
                  className={cn("px-1.5 py-0 text-[10px] font-medium border-zinc-200 dark:border-zinc-800 shrink-0 shadow-xs", getSourceTypeColor(file.source_type))}
                >
                  {file.source_type === "upload" ? t.fileCenter.sourceTypes.upload : file.source_type === "ai_generated" ? t.fileCenter.sourceTypes.aiGenerated : file.source_type === "business_attachment" ? t.fileCenter.sourceTypes.business : getSourceTypeLabel(file.source_type)}
                </Badge>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "px-1.5 py-0 text-[10px] font-medium border-zinc-200 dark:border-zinc-800 shrink-0 shadow-xs",
                    file.visibility === "private" 
                      ? "bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                      : "bg-indigo-50/50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50"
                  )}
                >
                  {file.visibility === "private" ? t.fileCenter.visibility.private : t.fileCenter.visibility.tenantShared}
                </Badge>
              </div>
            </div>
          </div>

          {/* Integrated Actions Bar */}
          <div className="flex items-center gap-2 shrink-0">
            {isSupportRawToggle && (
              <div className="flex items-center rounded-lg border bg-zinc-100/80 dark:bg-zinc-800/40 p-0.5 mr-1 border-zinc-200/60 dark:border-zinc-800/60">
                <button
                  onClick={() => setViewMode("preview")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-semibold transition-all duration-200",
                    viewMode === "preview"
                      ? "bg-white dark:bg-zinc-800 text-foreground shadow-xs border border-zinc-200/30 dark:border-zinc-700/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.fileCenter.viewModes.preview}
                </button>
                <button
                  onClick={() => setViewMode("code")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-semibold transition-all duration-200",
                    viewMode === "code"
                      ? "bg-white dark:bg-zinc-800 text-foreground shadow-xs border border-zinc-200/30 dark:border-zinc-700/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.fileCenter.viewModes.source}
                </button>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenNewTab}
              className="gap-1.5 h-8.5 px-3.5 text-xs rounded-lg transition-colors border-zinc-200/80 hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-800/50"
            >
              <ExternalLink className="size-3.5" />
              <span>{t.fileCenter.actions.openInNewTab}</span>
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              className="gap-1.5 h-8.5 px-3.5 text-xs rounded-lg transition-colors shadow-xs"
            >
              <Download className="size-3.5" />
              <span>{t.fileCenter.actions.download}</span>
            </Button>
            
            {/* Elegant Custom Close Button */}
            <div className="w-px h-5 bg-zinc-200/60 dark:bg-zinc-800/60 mx-1 shrink-0" />
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
              title={t.common.close}
            >
              <X className="size-4.5" />
            </button>
          </div>
        </header>

        {/* Content Preview Container */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-zinc-50/30 dark:bg-zinc-950/20">
          {loading ? (
            <div className="flex size-full items-center justify-center py-20">
              <Loader2 className="size-7 animate-spin text-indigo-500" />
            </div>
          ) : fileType.isImage && binaryUrl ? (
            <div className="flex size-full items-center justify-center p-8 bg-zinc-100/30 dark:bg-zinc-900/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={binaryUrl}
                alt={file.display_name}
                className="max-w-full max-h-[62vh] object-contain rounded-2xl shadow-lg border border-zinc-200/50 dark:border-zinc-800/50 bg-white dark:bg-zinc-950 p-2 animate-in zoom-in-95 duration-300"
              />
            </div>
          ) : fileType.isPdf && binaryUrl ? (
            <iframe
              src={binaryUrl}
              className="size-full border-0 bg-white dark:bg-zinc-950"
              title={file.display_name}
            />
          ) : fileType.isHtml && content !== null ? (
            viewMode === "preview" ? (
              <div className="size-full bg-white dark:bg-zinc-950">
                <iframe
                  srcDoc={content}
                  sandbox="allow-scripts"
                  className="size-full border-0"
                  title={file.display_name}
                />
              </div>
            ) : (
              <div className="size-full bg-zinc-950/95 font-mono overflow-auto flex flex-col animate-in fade-in duration-200">
                <CodeEditor
                  value={content}
                  readonly
                  className="flex-1 min-h-full p-2"
                  settings={{ lineNumbers: true, foldGutter: true }}
                />
              </div>
            )
          ) : fileType.isMarkdown && content !== null ? (
            viewMode === "preview" ? (
              <div className="px-6 py-8 md:px-12 max-w-4xl mx-auto">
                <div className="p-8 md:p-12 bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-md min-h-full">
                  <MarkdownContent
                    content={content}
                    isLoading={false}
                    rehypePlugins={[]}
                  />
                </div>
              </div>
            ) : (
              <div className="size-full bg-zinc-950/95 font-mono overflow-auto flex flex-col animate-in fade-in duration-200">
                <CodeEditor
                  value={content}
                  readonly
                  className="flex-1 min-h-full p-2"
                  settings={{ lineNumbers: true, foldGutter: true }}
                />
              </div>
            )
          ) : fileType.isCode && content !== null ? (
            <div className="size-full bg-zinc-950/95 font-mono overflow-auto flex flex-col">
              <CodeEditor
                value={content}
                readonly
                className="flex-1 min-h-full p-2"
                settings={{ lineNumbers: true, foldGutter: true }}
              />
            </div>
          ) : content !== null ? (
            // Standard Text / Code Fallback
            <div className="size-full bg-zinc-950/95 font-mono overflow-auto flex flex-col">
              <CodeEditor
                value={content}
                readonly
                className="flex-1 min-h-full p-2"
                settings={{ lineNumbers: true, foldGutter: true }}
              />
            </div>
          ) : (
            // Non-previewable fallback
            <div className="flex h-64 flex-col items-center justify-center gap-4 text-muted-foreground">
              <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-6">
                <FileIcon className="size-10 opacity-30" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">{t.common.unsupportedPreview}</p>
                <p className="text-xs mt-1">{t.common.downloadHint}</p>
              </div>
              <Button size="sm" onClick={handleDownload} className="gap-1.5 mt-2 rounded-lg">
                <Download className="size-4" />
                {t.common.downloadFile}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
