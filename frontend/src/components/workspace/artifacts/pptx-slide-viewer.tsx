import { DownloadIcon, LoaderIcon } from "lucide-react";
import React, { useEffect, useRef } from "react";

import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from "@aiden0z/pptx-renderer";
import { Button } from "@/components/ui/button";

interface PptxSlideViewerProps {
  pptxBuffer: ArrayBuffer | null;
  loading: boolean;
  onDownload: (e: React.MouseEvent) => void;
  fileName: string;
}

export function PptxSlideViewer({
  pptxBuffer,
  loading,
  onDownload,
  fileName,
}: PptxSlideViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PptxViewer | null>(null);

  useEffect(() => {
    if (!pptxBuffer || !containerRef.current) return;

    let cancelled = false;
    let viewer: PptxViewer | null = null;

    const load = async () => {
      try {
        viewer = await PptxViewer.open(pptxBuffer, containerRef.current!, {
          zipLimits: RECOMMENDED_ZIP_LIMITS,
          listOptions: { windowed: true, batchSize: 8, initialSlides: 4 },
        });
        if (!cancelled) {
          viewerRef.current = viewer;
        }
      } catch (err) {
        console.error("Failed to render PPTX:", err);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (viewer) {
        viewer.destroy();
        viewerRef.current = null;
      }
    };
  }, [pptxBuffer]);

  if (loading) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-4 bg-background">
        <LoaderIcon className="size-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">正在加载... &nbsp;{fileName}</p>
      </div>
    );
  }

  if (!pptxBuffer) {
    return (
      <div className="flex size-full flex-col items-center justify-center p-8 text-center bg-background">
        <div className="flex flex-col items-center gap-4 max-w-sm">
          <p className="text-sm font-medium text-foreground">无法加载 PPTX</p>
          <p className="text-xs text-muted-foreground">文件可能已损坏或无法读取。</p>
          <Button variant="default" size="sm" onClick={onDownload}>
            <DownloadIcon className="mr-2 size-4" />
            下载源文件
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col overflow-hidden bg-zinc-950">
      <div ref={containerRef} className="flex-1 overflow-auto" />
    </div>
  );
}
