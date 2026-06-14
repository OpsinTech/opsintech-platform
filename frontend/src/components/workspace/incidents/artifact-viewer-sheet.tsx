"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArtifactFileDetail } from "@/components/workspace/artifacts/artifact-file-detail";
import { useArtifacts } from "@/components/workspace/artifacts/context";
import { ThreadContext } from "@/components/workspace/messages/context";

interface ArtifactViewerSheetProps {
  threadId: string | null;
}

export function ArtifactViewerSheet({ threadId }: ArtifactViewerSheetProps) {
  const { open, setOpen, selectedArtifact } = useArtifacts();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="left"
        className="w-[80vw] sm:max-w-xl p-0 flex flex-col h-full bg-background border-r border-zinc-200 dark:border-zinc-800"
      >
        <SheetHeader className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <SheetTitle className="text-sm font-semibold">文件查看</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          {selectedArtifact && threadId ? (
            <ThreadContext.Provider value={{ thread: null as unknown as never, isMock: false }}>
              <ArtifactFileDetail filepath={selectedArtifact} threadId={threadId} />
            </ThreadContext.Provider>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              未选择文件
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
