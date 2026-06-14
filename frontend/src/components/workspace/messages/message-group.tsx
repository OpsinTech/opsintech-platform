import type { Message } from "@langchain/langgraph-sdk";
import {
  BookOpenTextIcon,
  BrainIcon,
  ChevronDownIcon,
  ChevronUp,
  FolderOpenIcon,
  GlobeIcon,
  ListTodoIcon,
  MessageCircleQuestionMarkIcon,
  NotebookPenIcon,
  SearchIcon,
  SquareTerminalIcon,
  WrenchIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/core/i18n/hooks";
import {
  buildToolResultArtifactPath,
  extractReasoningContentFromMessage,
  findToolCallResult,
  shouldRenderToolResultAsArtifact,
} from "@/core/messages/utils";
import { useRehypeSplitWordsIntoSpans } from "@/core/rehype";
import { extractTitleFromMarkdown } from "@/core/utils/markdown";
import { env } from "@/env";
import { cn } from "@/lib/utils";

import { useArtifacts } from "../artifacts";
import { FlipDisplay } from "../flip-display";
import { Tooltip } from "../tooltip";

import { MarkdownContent } from "./markdown-content";

export function MessageGroup({
  className,
  messages,
  isLoading = false,
  variant = "primary",
}: {
  className?: string;
  messages: Message[];
  isLoading?: boolean;
  variant?: "primary" | "secondary";
}) {
  const { t } = useI18n();
  const [showAbove, setShowAbove] = useState(
    env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true",
  );
  const steps = useMemo(() => convertToSteps(messages), [messages]);

  // First reasoning step (initial thinking, appears before tool calls)
  const firstReasoningStep = useMemo(() => {
    return steps.find((step) => step.type === "reasoning") as CoTReasoningStep | undefined;
  }, [steps]);

  const lastToolCallStep = useMemo(() => {
    const filteredSteps = steps.filter((step) => step.type === "toolCall");
    return filteredSteps[filteredSteps.length - 1];
  }, [steps]);

  const aboveLastToolCallSteps = useMemo(() => {
    if (lastToolCallStep) {
      const index = steps.indexOf(lastToolCallStep);
      return steps.slice(0, index).filter((step) => step !== firstReasoningStep);
    }
    return [];
  }, [lastToolCallStep, steps, firstReasoningStep]);

  // Last reasoning step (final thinking, appears after tool calls).
  // Only show it when it's different from the first one (i.e. there are
  // tool calls between multiple rounds of thinking).
  const lastReasoningStep = useMemo(() => {
    if (!lastToolCallStep) return undefined;
    const index = steps.indexOf(lastToolCallStep);
    const after = steps.slice(index + 1).find((step) => step.type === "reasoning") as CoTReasoningStep | undefined;
    if (after && after !== firstReasoningStep) return after;
    return undefined;
  }, [lastToolCallStep, steps, firstReasoningStep]);

  const rehypePlugins = useRehypeSplitWordsIntoSpans(isLoading);

  const [showLastThinking, setShowLastThinking] = useState(false);
  const [thinkDuration, setThinkDuration] = useState<number | null>(null);
  const thinkStartTime = useRef<number | null>(null);
  const wasStreaming = useRef(false);

  useEffect(() => {
    if (isLoading) {
      wasStreaming.current = true;
      if (thinkStartTime.current === null) {
        thinkStartTime.current = Date.now();
      }
    } else if (wasStreaming.current) {
      wasStreaming.current = false;
      if (thinkStartTime.current !== null) {
        setThinkDuration(Math.round((Date.now() - thinkStartTime.current) / 1000));
        thinkStartTime.current = null;
      }
      if (firstReasoningStep?.reasoning?.trim() || lastReasoningStep?.reasoning?.trim()) {
        setShowLastThinking(true);
      }
    }
  }, [isLoading, firstReasoningStep, lastReasoningStep]);

  return (
    <ChainOfThought
      className={cn(
        "w-full flex-col gap-1 pl-9",
        className,
      )}
      open={true}
    >
      {/* Initial thinking — appears first, before tool calls */}
      {firstReasoningStep && firstReasoningStep.reasoning?.trim() && (
        <div className="-ml-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-muted-foreground text-xs transition-colors hover:text-foreground py-1"
            onClick={() => setShowLastThinking(!showLastThinking)}
          >
            <BrainIcon className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">
              {isLoading
                ? t.common.thinking + "..."
                : thinkDuration != null
                  ? t.common.thoughtFor.replace("{seconds}", String(thinkDuration))
                  : t.common.thinking}
            </span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform duration-200",
                showLastThinking ? "rotate-180" : "rotate-0",
              )}
            />
          </button>
          {showLastThinking && (
            <div className="mt-2 pl-5 border-l-2 border-muted-foreground/20 text-muted-foreground text-xs leading-relaxed">
              <MarkdownContent
                content={firstReasoningStep.reasoning ?? ""}
                isLoading={isLoading}
                rehypePlugins={rehypePlugins}
              />
            </div>
          )}
        </div>
      )}

      {aboveLastToolCallSteps.length > 0 && (
        <Button
          key="above"
          className="w-fit flex items-center justify-start gap-2 h-auto py-1 px-2 -ml-2 rounded-[8px] text-left hover:bg-black/5 dark:hover:bg-white/5 opacity-80 hover:opacity-100"
          variant="ghost"
          onClick={() => setShowAbove(!showAbove)}
        >
          <ChevronUp
            className={cn(
              "size-4 opacity-60 transition-transform duration-200 shrink-0",
              showAbove ? "rotate-180" : "",
            )}
          />
          <span className="opacity-60 text-[10px] font-medium">
            {showAbove
              ? t.toolCalls.lessSteps
              : t.toolCalls.moreSteps(aboveLastToolCallSteps.length)}
          </span>
        </Button>
      )}
      {lastToolCallStep && (
        <ChainOfThoughtContent className="px-2 pb-1">
          {showAbove &&
            aboveLastToolCallSteps.map((step) =>
              step.type === "reasoning" ? (
                <ChainOfThoughtStep
                  key={step.id}
                  label={
                    <MarkdownContent
                      content={step.reasoning ?? ""}
                      isLoading={isLoading}
                      rehypePlugins={rehypePlugins}
                    />
                  }
                ></ChainOfThoughtStep>
              ) : (
                <ToolCall key={step.id} {...step} isLoading={isLoading} />
              ),
            )}
          {lastToolCallStep && (
            <FlipDisplay uniqueKey={lastToolCallStep.id ?? ""}>
              <ToolCall
                key={lastToolCallStep.id}
                {...lastToolCallStep}
                isLast={true}
                isLoading={isLoading}
              />
            </FlipDisplay>
          )}
        </ChainOfThoughtContent>
      )}

      {/* Final thinking — after the last tool call, only if different from initial */}
      {lastReasoningStep && lastReasoningStep.reasoning?.trim() && (
        <div className="mt-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-muted-foreground text-xs transition-colors hover:text-foreground py-1"
            onClick={() => setShowLastThinking(!showLastThinking)}
          >
            <BrainIcon className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">
              {isLoading
                ? t.common.thinking + "..."
                : thinkDuration != null
                  ? t.common.thoughtFor.replace("{seconds}", String(thinkDuration))
                  : t.common.thinking}
            </span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform duration-200",
                showLastThinking ? "rotate-180" : "rotate-0",
              )}
            />
          </button>
          {showLastThinking && (
            <div className="mt-2 pl-5 border-l-2 border-muted-foreground/20 text-muted-foreground text-xs leading-relaxed">
              <MarkdownContent
                content={lastReasoningStep.reasoning ?? ""}
                isLoading={isLoading}
                rehypePlugins={rehypePlugins}
              />
            </div>
          )}
        </div>
      )}
    </ChainOfThought>
  );
}

function BashStep({
  label,
  command,
}: {
  label: string;
  command?: string;
}) {
  const { t } = useI18n();
  const MAX_VISIBLE_LINES = 3;
  const [expanded, setExpanded] = useState(false);

  if (!command) {
    return <ChainOfThoughtStep label={label} icon={SquareTerminalIcon} />;
  }

  const lines = command.split("\n");
  const isLong = lines.length > MAX_VISIBLE_LINES;

  return (
    <ChainOfThoughtStep label={label} icon={SquareTerminalIcon}>
      <CodeBlock
        className="mx-0 cursor-pointer border-none px-0"
        showLineNumbers={false}
        language="bash"
        code={isLong && !expanded ? lines.slice(0, MAX_VISIBLE_LINES).join("\n") + "\n…" : command}
      />
      {isLong && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-[10px] mt-1 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? `▲ ${t.messageGroup.collapseAll}` : `▼ ${t.messageGroup.expandAll}`}
        </button>
      )}
    </ChainOfThoughtStep>
  );
}

function ToolCall({
  id,
  messageId,
  name,
  args,
  result,
  artifactPath,
  artifactReady,
  isLast = false,
  isLoading = false,
}: {
  id?: string;
  messageId?: string;
  name: string;
  args: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  artifactPath?: string;
  artifactReady?: boolean;
  isLast?: boolean;
  isLoading?: boolean;
}) {
  const { t } = useI18n();
  const { setOpen, select } = useArtifacts();

  if (name === "web_search") {
    let label: React.ReactNode = t.toolCalls.searchForRelatedInfo;
    if (typeof args.query === "string") {
      label = t.toolCalls.searchOnWebFor(args.query);
    }
    return (
      <ChainOfThoughtStep key={id} label={label} icon={SearchIcon}>
        {Array.isArray(result) && (
          <ChainOfThoughtSearchResults>
            {result.map((item) => (
              <ChainOfThoughtSearchResult key={item.url}>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              </ChainOfThoughtSearchResult>
            ))}
          </ChainOfThoughtSearchResults>
        )}
      </ChainOfThoughtStep>
    );
  } else if (name === "image_search") {
    let label: React.ReactNode = t.toolCalls.searchForRelatedImages;
    if (typeof args.query === "string") {
      label = t.toolCalls.searchForRelatedImagesFor(args.query);
    }
    const results = (
      result as {
        results: {
          source_url: string;
          thumbnail_url: string;
          image_url: string;
          title: string;
        }[];
      }
    )?.results;
    return (
      <ChainOfThoughtStep key={id} label={label} icon={SearchIcon}>
        {Array.isArray(results) && (
          <ChainOfThoughtSearchResults>
            {Array.isArray(results) &&
              results.map((item) => (
                <Tooltip key={item.image_url} content={item.title}>
                  <a
                    className="size-24 overflow-hidden rounded-lg object-cover"
                    href={item.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="bg-accent size-24">
                      <img
                        className="size-full object-cover"
                        src={item.thumbnail_url}
                        alt={item.title}
                        width={100}
                        height={100}
                      />
                    </div>
                  </a>
                </Tooltip>
              ))}
          </ChainOfThoughtSearchResults>
        )}
      </ChainOfThoughtStep>
    );
  } else if (name === "web_fetch") {
    const url = (args as { url: string })?.url;
    let title = url;
    if (typeof result === "string") {
      const potentialTitle = extractTitleFromMarkdown(result);
      if (potentialTitle && potentialTitle.toLowerCase() !== "untitled") {
        title = potentialTitle;
      }
    }
    return (
      <ChainOfThoughtStep
        key={id}
        className="cursor-pointer"
        label={t.toolCalls.viewWebPage}
        icon={GlobeIcon}
        onClick={() => {
          window.open(url, "_blank");
        }}
      >
        <ChainOfThoughtSearchResult>
          {url && (
            <a href={url} target="_blank" rel="noreferrer">
              {title}
            </a>
          )}
        </ChainOfThoughtSearchResult>
      </ChainOfThoughtStep>
    );
  } else if (name === "ls") {
    let description: string | undefined = (args as { description: string })
      ?.description;
    if (!description) {
      description = t.toolCalls.listFolder;
    }
    const path: string | undefined = (args as { path: string })?.path;
    return (
      <ChainOfThoughtStep key={id} label={description} icon={FolderOpenIcon}>
        {path && (
          <ChainOfThoughtSearchResult className="cursor-pointer">
            {path.replace(/^\/?mnt\/user-data\/outputs\//, "")}
            </ChainOfThoughtSearchResult>
        )}
      </ChainOfThoughtStep>
    );
  } else if (name === "read_file") {
    let description: string | undefined = (args as { description: string })
      ?.description;
    if (!description) {
      description = t.toolCalls.readFile;
    }
    const { path } = args as { path: string; content: string };
    const isSkillFile = path?.includes("/skills/") || path?.endsWith("SKILL.md");
    return (
      <ChainOfThoughtStep key={id} label={description} icon={BookOpenTextIcon}>
        {path && !isSkillFile && (
          <ChainOfThoughtSearchResult className="cursor-pointer">
            {path.replace(/^\/?mnt\/user-data\/outputs\//, "")}
            </ChainOfThoughtSearchResult>
        )}
      </ChainOfThoughtStep>
    );
  } else if (name === "write_file" || name === "str_replace") {
    let description: string | undefined = (args as { description: string })
      ?.description;
    if (!description) {
      description = t.toolCalls.writeFile;
    }
    const path: string | undefined = (args as { path: string })?.path;
    const canOpenArtifact = shouldRenderToolResultAsArtifact(name, args);

    return (
      <ChainOfThoughtStep
        key={id}
        className={cn(canOpenArtifact && path && "cursor-pointer")}
        label={description}
        icon={NotebookPenIcon}
        onClick={() => {
          if (!canOpenArtifact || !path) {
            return;
          }
          select(
            new URL(
              `write-file:${path}?message_id=${messageId}&tool_call_id=${id}`,
            ).toString(),
          );
          setOpen(true);
        }}
      >
        {path && (
          <ChainOfThoughtSearchResult className="cursor-pointer">
            {path.replace(/^\/?mnt\/user-data\/outputs\//, "")}
            </ChainOfThoughtSearchResult>
        )}
      </ChainOfThoughtStep>
    );
  } else if (name === "bash") {
    const description: string | undefined = (args as { description: string })
      ?.description;
    const command: string | undefined = (args as { command: string })?.command;
    return (
      <BashStep
        key={id}
        label={description || t.toolCalls.executeCommand}
        command={command}
      />
    );
  } else if (name === "ask_clarification") {
    return (
      <ChainOfThoughtStep
        key={id}
        label={t.toolCalls.needYourHelp}
        icon={MessageCircleQuestionMarkIcon}
      ></ChainOfThoughtStep>
    );
  } else if (name === "write_todos") {
    return (
      <ChainOfThoughtStep
        key={id}
        label={t.toolCalls.writeTodos}
        icon={ListTodoIcon}
      ></ChainOfThoughtStep>
    );
  } else {
    const description: string | undefined = (args as { description: string })
      ?.description;
      
    if (shouldRenderToolResultAsArtifact(name, args)) {
      return (
        <ChainOfThoughtStep
          key={id}
          label={
            <span className="inline-flex w-full items-center gap-2">
              <span>{description ?? t.toolCalls.useTool(name)}</span>
              {artifactPath && (
                <button
                  type="button"
                  className={cn(
                    "ml-auto text-xs",
                    artifactReady
                      ? "text-primary cursor-pointer hover:underline"
                      : "text-muted-foreground cursor-not-allowed",
                  )}
                  disabled={!artifactReady}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!artifactReady) {
                      return;
                    }
                    select(artifactPath);
                    setOpen(true);
                  }}
                >
                  {artifactReady ? t.messageGroup.view : t.messageGroup.generating}
                </button>
              )}
            </span>
          }
          icon={WrenchIcon}
        ></ChainOfThoughtStep>
      );
    }
  
    return (
      <ChainOfThoughtStep
        key={id}
        label={description ?? t.toolCalls.useTool(name)}
        icon={WrenchIcon}
      ></ChainOfThoughtStep>
    );
  }
}

interface GenericCoTStep<T extends string = string> {
  id?: string;
  messageId?: string;
  type: T;
}

interface CoTReasoningStep extends GenericCoTStep<"reasoning"> {
  reasoning: string | null;
}

interface CoTToolCallStep extends GenericCoTStep<"toolCall"> {
  name: string;
  args: Record<string, unknown>;
  result?: string;
  artifactPath?: string;
  artifactReady?: boolean;
}

type CoTStep = CoTReasoningStep | CoTToolCallStep;

function convertToSteps(messages: Message[]): CoTStep[] {
  const steps: CoTStep[] = [];
  for (const message of messages) {
    if (message.type === "ai") {
      const reasoning = extractReasoningContentFromMessage(message);
      if (reasoning) {
        const step: CoTReasoningStep = {
          id: message.id,
          messageId: message.id,
          type: "reasoning",
          reasoning: extractReasoningContentFromMessage(message),
        };
        steps.push(step);
      }
      for (const tool_call of message.tool_calls ?? []) {
        if (tool_call.name === "task") {
          continue;
        }
        const step: CoTToolCallStep = {
          id: tool_call.id,
          messageId: message.id,
          type: "toolCall",
          name: tool_call.name,
          args: tool_call.args,
        };
        const toolCallId = tool_call.id;
        if (toolCallId) {
          const toolCallResult = findToolCallResult(toolCallId, messages);
          if (shouldRenderToolResultAsArtifact(tool_call.name, tool_call.args) && message.id) {
            step.artifactPath = buildToolResultArtifactPath({
              toolName: tool_call.name,
              args: tool_call.args,
              messageId: message.id,
              toolCallId,
            });
            step.artifactReady = Boolean(toolCallResult && step.artifactPath);
          } else if (toolCallResult) {
            try {
              const json = JSON.parse(toolCallResult);
              step.result = json;
            } catch {
              step.result = toolCallResult;
            }
          }
        }
        steps.push(step);
      }
    }
  }
  return steps;
}
