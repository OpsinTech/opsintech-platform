import { FilesIcon, XIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { GroupImperativeHandle } from "react-resizable-panels";

import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { extractToolResultArtifacts } from "@/core/messages/utils";
import { env } from "@/env";
import { cn } from "@/lib/utils";

import {
  ArtifactFileDetail,
  useArtifacts,
} from "../artifacts";
import { useThread, ThreadContext } from "../messages/context";

const CLOSE_MODE = { chat: 100, artifacts: 0 };
const OPEN_MODE = { chat: 60, artifacts: 40 };

function normalizeArtifactIdentity(file: string): string {
  if (file.startsWith("write-file:") || file.startsWith("mcp-result:")) {
    try {
      return decodeURIComponent(new URL(file).pathname);
    } catch {
      return file;
    }
  }
  return file.split("?")[0] ?? file;
}

const ChatBox: React.FC<{ children: React.ReactNode; threadId: string }> = ({
  children,
  threadId,
}) => {
  const threadContextVal = useContext(ThreadContext);
  if (!threadContextVal) {
    return <div className="flex size-full min-h-0 flex-col bg-background" />;
  }
  const { thread } = threadContextVal;
  const pathname = usePathname();
  const threadIdRef = useRef(threadId);
  const layoutRef = useRef<GroupImperativeHandle>(null);

  const {
    artifacts,
    open: artifactsOpen,
    setOpen: setArtifactsOpen,
    setArtifacts,
    select: selectArtifact,
    deselect,
    selectedArtifact,
  } = useArtifacts();

  const [autoSelectFirstArtifact, setAutoSelectFirstArtifact] = useState(true);
  
  const mergedArtifacts = useMemo(() => {
    const virtualArtifacts = extractToolResultArtifacts(thread.messages).map(
      (item) => item.filepath,
    );
    const combined = [...virtualArtifacts, ...(thread.values.artifacts ?? [])];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const file of combined) {
      const key = normalizeArtifactIdentity(file);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(file);
      }
    }
    return unique;
  }, [thread.messages, thread.values.artifacts]);

  const hasSameArtifacts = useMemo(() => {
    if (artifacts.length !== mergedArtifacts.length) {
      return false;
    }
    for (let i = 0; i < artifacts.length; i++) {
      if (artifacts[i] !== mergedArtifacts[i]) {
        return false;
      }
    }
    return true;
  }, [artifacts, mergedArtifacts]);

  useEffect(() => {
    if (threadIdRef.current !== threadId) {
      threadIdRef.current = threadId;
      deselect();
    }

    // Keep a cumulative artifact list for this thread (persisted + virtual tool results).
    if (!hasSameArtifacts) {
      setArtifacts(mergedArtifacts);
    }

    // Clear selected artifact when switching threads if the artifact is no longer available.
    if (
      selectedArtifact &&
      !mergedArtifacts.includes(selectedArtifact)
    ) {
      deselect();
    }

    if (
      env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" &&
      autoSelectFirstArtifact
    ) {
      if (mergedArtifacts.length > 0) {
        setAutoSelectFirstArtifact(false);
        selectArtifact(mergedArtifacts[0]!);
      }
    }
  }, [
    threadId,
    autoSelectFirstArtifact,
    deselect,
    selectArtifact,
    selectedArtifact,
    hasSameArtifacts,
    setArtifacts,
    mergedArtifacts,
  ]);

  const artifactPanelOpen = useMemo(() => {
    if (env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true") {
      return artifactsOpen && artifacts?.length > 0;
    }
    return artifactsOpen;
  }, [artifactsOpen, artifacts]);

  const resizableIdBase = useMemo(() => {
    return pathname.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  }, [pathname]);

  useEffect(() => {
    if (layoutRef.current) {
      if (artifactPanelOpen) {
        layoutRef.current.setLayout(OPEN_MODE);
      } else {
        layoutRef.current.setLayout(CLOSE_MODE);
      }
    }
  }, [artifactPanelOpen]);

  return (
    <ResizablePanelGroup
      id={`${resizableIdBase}-panels`}
      orientation="horizontal"
      defaultLayout={{ chat: 100, artifacts: 0 }}
      groupRef={layoutRef}
    >
      <ResizablePanel className="relative" defaultSize={100} id="chat">
        {children}
      </ResizablePanel>
      <ResizableHandle
        id={`${resizableIdBase}-separator`}
        className={cn(
          "opacity-33 hover:opacity-100",
          !artifactPanelOpen && "pointer-events-none opacity-0",
        )}
      />
      <ResizablePanel
        className={cn(
          "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
          !artifactsOpen && "opacity-0",
        )}
        id="artifacts"
      >
        <div
          className={cn(
            "h-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
            artifactPanelOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex size-full min-h-0 flex-col border-l border-border bg-background">
            {mergedArtifacts.length === 0 ? (
              <div className="flex size-full min-h-0 flex-col">
                <div className="flex h-14 shrink-0 items-center justify-end border-b border-border px-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setArtifactsOpen(false)}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
                <ConversationEmptyState
                  icon={<FilesIcon />}
                  title="No artifact selected"
                  description="Select an artifact to view its details"
                />
              </div>
            ) : (
              <div className="flex size-full min-h-0 flex-col overflow-hidden">
                <section className="min-h-0 flex flex-1 flex-col overflow-hidden bg-background">
                  {selectedArtifact ? (
                    <ArtifactFileDetail
                      className="size-full rounded-none border-none shadow-none"
                      filepath={selectedArtifact}
                      threadId={threadId}
                    />
                  ) : (
                    <div className="flex size-full min-h-0 flex-col">
                      <div className="flex h-14 shrink-0 items-center justify-end border-b border-border px-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setArtifactsOpen(false)}
                        >
                          <XIcon className="size-4" />
                        </Button>
                      </div>
                      <ConversationEmptyState
                        icon={<FilesIcon />}
                        title="No artifact selected"
                      />
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export { ChatBox };
