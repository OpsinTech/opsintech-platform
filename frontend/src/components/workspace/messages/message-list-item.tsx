
import type { Message } from "@langchain/langgraph-sdk";
import { FileIcon, Loader2Icon, RotateCcwIcon, SparklesIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { memo, useMemo, type ImgHTMLAttributes } from "react";
import rehypeKatex from "rehype-katex";

import { Loader } from "@/components/ai-elements/loader";
import {
  Message as AIElementMessage,
  MessageContent as AIElementMessageContent,
  MessageResponse as AIElementMessageResponse,
  MessageToolbar,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Task, TaskTrigger } from "@/components/ai-elements/task";
import { Button } from "@/components/ui/button";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useArtifactAccessToken } from "@/core/artifacts/hooks";
import { resolveArtifactURL } from "@/core/artifacts/utils";
import { useI18n } from "@/core/i18n/hooks";
import {
  extractContentFromMessage,
  extractReasoningContentFromMessage,
  buildRetrySubmissionFromMessage,
  stripUploadedFilesTag,
  stripSystemContext,
  type FileInMessage,
} from "@/core/messages/utils";
import { useRehypeSplitWordsIntoSpans } from "@/core/rehype";
import { humanMessagePlugins } from "@/core/streamdown";
import { cn } from "@/lib/utils";

import { CopyButton } from "../copy-button";

import { filesFromAdditionalKwargs } from "./attachment-status";
import { MarkdownContent } from "./markdown-content";

export function MessageListItem({
  className,
  message,
  isLoading,
  availableAttachmentKeys,
  onRetry,
  defaultOpenReasoning = false,
}: {
  className?: string;
  message: Message;
  isLoading?: boolean;
  availableAttachmentKeys?: Set<string>;
  onRetry?: (message: Message) => void;
  defaultOpenReasoning?: boolean;
}) {
  const { t } = useI18n();
  const isHuman = message.type === "human";
  
  return (
    <AIElementMessage
      className={cn(
        "group/conversation-message relative w-full mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out",
        isHuman ? "items-end" : "items-start",
        className
      )}
      from={isHuman ? "user" : "assistant"}
    >
      <div className={cn("flex w-full relative", isHuman ? "justify-end" : "justify-start")}>
        {!isHuman && (
          <div className="flex-shrink-0 mt-[2px] mr-3 flex size-[24px] items-center justify-center">
            <SparklesIcon className="size-5 text-blue-500 fill-blue-500" />
          </div>
        )}
        
        <div className={cn(
          "relative flex max-w-[85%] flex-col gap-2",
          isHuman ? "items-end" : "items-start",
          !isHuman && "w-full min-w-0"
        )}>
          {isHuman ? (
            <div className="bg-muted/70 text-foreground px-5 py-3 rounded-[24px] rounded-tr-[4px] text-[13px] leading-relaxed shadow-sm">
              <MessageContent
                className="w-full break-words"
                message={message}
                isLoading={isLoading}
                availableAttachmentKeys={availableAttachmentKeys}
              />
            </div>
          ) : (
            <MessageContent
              className="w-full break-words text-[13px] leading-loose text-foreground/90"
              message={message}
              isLoading={isLoading}
              availableAttachmentKeys={availableAttachmentKeys}
              defaultOpenReasoning={defaultOpenReasoning}
            />
          )}

          {!isLoading && (
            <MessageToolbar
              className={cn(
                "absolute -bottom-10 z-20 opacity-0 transition-opacity delay-100 duration-200 group-hover/conversation-message:opacity-100",
                isHuman ? "right-2" : "left-0"
              )}
            >
              <div className="flex gap-1.5 rounded-[8px] border bg-background/60 p-1 shadow-sm backdrop-blur-md border-black/5 dark:border-white/10">
                {isHuman && onRetry && (
                   <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            const retrySubmission = buildRetrySubmissionFromMessage(message);
                            if (!retrySubmission.text && retrySubmission.attachments.length === 0) {
                              return;
                            }
                            onRetry(message);
                          }}
                          size="icon-sm"
                          className="rounded-[6px] size-6 hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground"
                        >
                          <RotateCcwIcon size={12} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t.messageGroup.retryInstruction}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <CopyButton
                  className="rounded-[6px] size-6 hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground"
                  clipboardData={
                    isHuman
                      ? stripSystemContext(stripUploadedFilesTag(extractContentFromMessage(message) || ""))
                      : (extractContentFromMessage(message) ??
                        extractReasoningContentFromMessage(message) ??
                        "")
                  }
                />
              </div>
            </MessageToolbar>
          )}
        </div>
      </div>
    </AIElementMessage>
  );
}

function MessageImage({
  src,
  alt,
  threadId,
  maxWidth = "90%",
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  threadId: string;
  maxWidth?: string;
}) {
  const artifactToken = useArtifactAccessToken();
  if (!src) return null;

  const imgClassName = cn("overflow-hidden rounded-lg", `max-w-[${maxWidth}]`);

  if (typeof src !== "string") {
    return <img className={imgClassName} src={src} alt={alt} {...props} />;
  }

  const url = src.startsWith("/mnt/")
    ? resolveArtifactURL(src, threadId, artifactToken)
    : src;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img className={imgClassName} src={url} alt={alt} {...props} />
    </a>
  );
}

function MessageContent_({
  className,
  message,
  isLoading = false,
  availableAttachmentKeys,
  defaultOpenReasoning = false,
}: {
  className?: string;
  message: Message;
  isLoading?: boolean;
  availableAttachmentKeys?: Set<string>;
  defaultOpenReasoning?: boolean;
}) {
  const rehypePlugins = useRehypeSplitWordsIntoSpans(isLoading);
  const isHuman = message.type === "human";
  const { thread_id } = useParams<{ thread_id: string }>();
  const components = useMemo(
    () => ({
      img: (props: ImgHTMLAttributes<HTMLImageElement>) => (
        <MessageImage {...props} threadId={thread_id} maxWidth="90%" />
      ),
    }),
    [thread_id],
  );

  const rawContent = extractContentFromMessage(message);
  const reasoningContent = extractReasoningContentFromMessage(message);

  const files = useMemo(
    () =>
      filesFromAdditionalKwargs(message.additional_kwargs, availableAttachmentKeys),
    [availableAttachmentKeys, message.additional_kwargs],
  );

  const contentToDisplay = useMemo(() => {
    if (isHuman) {
      return rawContent ? stripSystemContext(stripUploadedFilesTag(rawContent)) : "";
    }
    return rawContent ?? "";
  }, [rawContent, isHuman]);

  const filesList =
    files && files.length > 0 && thread_id ? (
      <RichFilesList files={files} threadId={thread_id} isHuman={isHuman} />
    ) : null;

  // Uploading state: mock AI message shown while files upload
  if (message.additional_kwargs?.element === "task") {
    return (
      <AIElementMessageContent className={className}>
        <Task defaultOpen={false}>
          <TaskTrigger title="">
            <div className="text-muted-foreground flex w-full cursor-default items-center gap-2 text-sm select-none">
              <Loader className="size-4" />
              <span>{contentToDisplay}</span>
            </div>
          </TaskTrigger>
        </Task>
      </AIElementMessageContent>
    );
  }

  // Reasoning-only AI message (no main response content yet)
  if (!isHuman && reasoningContent && !rawContent) {
    return (
      <AIElementMessageContent className={className}>
        <Reasoning isStreaming={isLoading} defaultOpen={defaultOpenReasoning}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningContent}</ReasoningContent>
        </Reasoning>
      </AIElementMessageContent>
    );
  }

  if (isHuman) {
    const messageResponse = contentToDisplay ? (
      <AIElementMessageResponse
        remarkPlugins={humanMessagePlugins.remarkPlugins}
        rehypePlugins={humanMessagePlugins.rehypePlugins}
        components={components}
      >
        {contentToDisplay}
      </AIElementMessageResponse>
    ) : null;
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        {filesList}
        {messageResponse && (
          <AIElementMessageContent className="w-fit">
            {messageResponse}
          </AIElementMessageContent>
        )}
      </div>
    );
  }

  return (
    <AIElementMessageContent className={className}>
      {filesList}
      <MarkdownContent
        content={contentToDisplay}
        isLoading={isLoading}
        rehypePlugins={[...rehypePlugins, [rehypeKatex, { output: "html" }]]}
        className="my-1.5"
        components={components}
      />
    </AIElementMessageContent>
  );
}

/**
 * List of files from additional_kwargs.attachments/files (with optional upload status)
 */
function RichFilesList({
  files,
  threadId,
  isHuman,
}: {
  files: FileInMessage[];
  threadId: string;
  isHuman?: boolean;
}) {
  if (files.length === 0) return null;
  return (
    <div className={cn("mb-1 flex flex-wrap gap-1.5", isHuman ? "justify-end" : "justify-start")}>
      {files.map((file, index) => (
        <RichFileCard
          key={`${file.filename}-${index}`}
          file={file}
          threadId={threadId}
        />
      ))}
    </div>
  );
}

/**
 * Single file card that handles FileInMessage (supports uploading state)
 * Displayed as a compact pill
 */
function RichFileCard({
  file,
  threadId,
}: {
  file: FileInMessage;
  threadId: string;
}) {
  const { t } = useI18n();
  const artifactToken = useArtifactAccessToken();
  const isUploading = file.status === "uploading";

  if (isUploading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 opacity-60 text-[12px] font-medium w-fit transition-colors group relative cursor-wait">
        <Loader2Icon className="size-3.5 animate-spin text-muted-foreground shrink-0" />
        <span className="truncate max-w-[120px] text-foreground/80">{file.filename}</span>
        <span className="text-[10px] text-muted-foreground ml-1">{t.uploads.uploading}</span>
      </div>
    );
  }

  if (!file.path) return null;
  const fileUrl = resolveArtifactURL(file.path, threadId, artifactToken);

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border border-black/10 dark:border-white/10 bg-background hover:bg-black/5 dark:hover:bg-white/10 text-[12px] font-medium w-fit transition-all duration-200 group relative shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
      title={file.filename}
    >
      <FileIcon className="size-3.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
      <span className="truncate max-w-[160px] text-foreground/80 group-hover:text-foreground">{file.filename}</span>
    </a>
  );
}

const MessageContent = memo(MessageContent_);
