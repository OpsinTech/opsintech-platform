import {
  CheckCircleIcon,
  ChevronUp,
  Loader2Icon,
  TimerOffIcon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/core/i18n/hooks";
import { useRehypeSplitWordsIntoSpans } from "@/core/rehype";
import { streamdownPluginsWithWordAnimation } from "@/core/streamdown";
import { useSubtask } from "@/core/tasks/context";
import { explainLastToolCall } from "@/core/tools/utils";
import { cn } from "@/lib/utils";

import { CitationLink } from "../citations/citation-link";
import { FlipDisplay } from "../flip-display";

import { MarkdownContent } from "./markdown-content";

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function elapsedBetween(startIso: string, endIso?: string): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diff = Math.max(0, Math.floor((end - start) / 1000));
  return formatDuration(diff);
}

export function SubtaskCard({
  className,
  taskId,
  isLoading,
}: {
  className?: string;
  taskId: string;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(true);
  const [now, setNow] = useState(Date.now());
  const rehypePlugins = useRehypeSplitWordsIntoSpans(isLoading);
  const task = useSubtask(taskId);

  // Live timer for running tasks
  useEffect(() => {
    if (!task || task.status !== "in_progress") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [task?.status]);

  const icon = useMemo(() => {
    if (!task) {
      return null;
    }

    if (task.status === "completed") {
      return <CheckCircleIcon className="size-3" />;
    } else if (task.status === "failed") {
      return <XCircleIcon className="size-3 text-red-500" />;
    } else if (task.status === "timed_out") {
      return <TimerOffIcon className="size-3 text-amber-500" />;
    } else if (task.status === "in_progress") {
      return <Loader2Icon className="size-3 animate-spin" />;
    }
  }, [task?.status]);

  const durationLabel = useMemo(() => {
    if (!task) return null;

    if (task.status === "in_progress" && task.startedAt) {
      return elapsedBetween(task.startedAt, undefined);
    }
    if (task.startedAt) {
      return elapsedBetween(task.startedAt, task.completedAt);
    }
    return null;
  }, [task?.startedAt, task?.completedAt, task?.status, now]);

  if (!task) {
    return null;
  }

  return (
    <ChainOfThought
      className={cn("flex w-full flex-col gap-0.5 pl-9 transition-all duration-300", className)}
      open={!collapsed}
    >
      <div className="flex w-full flex-col overflow-hidden">
        <div className="flex w-fit items-center justify-start">
          <Button
            className="w-fit flex items-center justify-start gap-3 h-auto py-1 px-2 -ml-2 rounded-[8px] text-left hover:bg-black/5 dark:hover:bg-white/5 opacity-80 hover:opacity-100"
            variant="ghost"
            onClick={() => setCollapsed(!collapsed)}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {icon}
              <span className="text-[10px] font-medium truncate max-w-[400px]">
                {task.status === "in_progress" ? (
                  <Shimmer duration={3} spread={3}>
                    {task.description}
                  </Shimmer>
                ) : (
                  task.description
                )}
              </span>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {durationLabel && (
                <span
                  className={cn(
                    "text-muted-foreground text-[10px] font-mono",
                    task.status === "failed" ? "text-red-500/70" : "",
                    task.status === "timed_out" ? "text-amber-500/70" : "",
                  )}
                >
                  {durationLabel}
                </span>
              )}
              {collapsed && (
                <div
                  className={cn(
                    "text-muted-foreground flex items-center gap-1.5 text-xs font-normal pl-2",
                    task.status === "failed" ? "text-red-500 opacity-80" : "",
                    task.status === "timed_out" ? "text-amber-500 opacity-80" : "",
                  )}
                >
                  <FlipDisplay
                    className="max-w-[12rem] md:max-w-[18rem] lg:max-w-[24rem] truncate"
                    uniqueKey={task.latestMessage?.id ?? ""}
                  >
                    {task.status === "in_progress" &&
                    task.latestMessage &&
                    task.latestMessage.tool_calls &&
                    task.latestMessage.tool_calls.length > 0
                      ? explainLastToolCall(task.latestMessage, t)
                      : t.subtasks[task.status]}
                  </FlipDisplay>
                </div>
              )}
              <ChevronUp
                className={cn(
                  "text-muted-foreground size-4 ml-1 transition-transform duration-200",
                  !collapsed ? "" : "rotate-180",
                )}
              />
            </div>
          </Button>
        </div>
        <ChainOfThoughtContent className="mt-0 pb-1">
          {task.prompt && (
            <ChainOfThoughtStep
              label={
                <Streamdown
                  {...streamdownPluginsWithWordAnimation}
                  components={{ a: CitationLink }}
                >
                  {task.prompt}
                </Streamdown>
              }
            ></ChainOfThoughtStep>
          )}
          {task.status === "in_progress" &&
            task.latestMessage &&
            task.latestMessage.tool_calls &&
            task.latestMessage.tool_calls.length > 0 && (
              <ChainOfThoughtStep
                label={t.subtasks.in_progress}
                icon={<Loader2Icon className="size-4 animate-spin" />}
              >
                {explainLastToolCall(task.latestMessage, t)}
              </ChainOfThoughtStep>
            )}
          {task.status === "completed" && (
            <>
              <ChainOfThoughtStep
                label={t.subtasks.completed}
                icon={<CheckCircleIcon className="size-4" />}
              ></ChainOfThoughtStep>
              <ChainOfThoughtStep
                label={
                  task.result ? (
                    <MarkdownContent
                      content={task.result}
                      isLoading={false}
                      rehypePlugins={rehypePlugins}
                    />
                  ) : null
                }
              ></ChainOfThoughtStep>
            </>
          )}
          {task.status === "timed_out" && (
            <ChainOfThoughtStep
              label={<div className="text-amber-500">{task.error || t.subtasks.timed_out}</div>}
              icon={<TimerOffIcon className="size-4 text-amber-500" />}
            ></ChainOfThoughtStep>
          )}
          {task.status === "failed" && (
            <ChainOfThoughtStep
              label={<div className="text-red-500">{task.error}</div>}
              icon={<XCircleIcon className="size-4 text-red-500" />}
            ></ChainOfThoughtStep>
          )}
        </ChainOfThoughtContent>
      </div>
    </ChainOfThought>
  );
}
