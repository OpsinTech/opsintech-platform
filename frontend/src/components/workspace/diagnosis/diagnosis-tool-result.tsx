import { FileIcon, EyeIcon, FileJsonIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";


import { CodeBlock } from "@/components/ai-elements/code-block";
import { Button } from "@/components/ui/button";
import { useArtifacts } from "@/components/workspace/artifacts/context";
import { isMCPTool, buildToolResultArtifactPath } from "@/core/messages/utils";
import { cn } from "@/lib/utils";

interface DiagnosisToolResultProps {
  toolName: string;
  result: string;
  isError?: boolean;
  args?: Record<string, unknown>;
  toolCallId?: string;
  parentMessageId?: string;
  threadId?: string;
}

const getFileLanguage = (path?: string) => {
  if (!path) return "plaintext";
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "py":
      return "python";
    case "json":
      return "json";
    case "yml":
    case "yaml":
      return "yaml";
    case "md":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "html";
    case "sh":
    case "bash":
      return "bash";
    default:
      return "plaintext";
  }
};

export function DiagnosisToolResult({
  toolName,
  result,
  isError,
  args,
  toolCallId,
  parentMessageId,
  threadId,
}: DiagnosisToolResultProps) {
  const [expanded, setExpanded] = useState(false);
  const { setOpen, select } = useArtifacts();

  if (!result) {
    return null;
  }

  if (isError) {
    return (
      <div className="pt-2 border-t border-rose-200/40 dark:border-rose-900/40">
        <p className="text-[9px] font-bold text-rose-500 uppercase tracking-wider mb-1">执行失败</p>
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20 p-2.5">
          <pre className="text-[10px] font-mono text-rose-600 dark:text-rose-400 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
            {result}
          </pre>
        </div>
      </div>
    );
  }

  // 0. present_files -> Generated files with clickable links
  if (toolName === "present_files") {
    const filepaths: string[] = Array.isArray(args?.filepaths)
      ? (args.filepaths as string[])
      : [];

    if (filepaths.length === 0) {
      return null;
    }

    return (
      <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40">
        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">生成的文件</p>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-2.5">
          <ul className="space-y-1.5">
            {filepaths.map((filepath) => {
              const filename = filepath.split("/").filter(Boolean).pop() ?? filepath;
              return (
                <li key={filepath}>
                  <button
                    type="button"
                    onClick={() => {
                      select(filepath);
                      setOpen(true);
                    }}
                    className="flex items-center gap-2 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                  >
                    <FileTextIcon className="h-3 w-3 shrink-0" />
                    {filename}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  // 1. write_file / str_replace -> Artifact File Card + View Button
  if (toolName === "write_file" || toolName === "str_replace") {
    const displayPath = typeof args?.path === "string" 
      ? args.path.replace(/^\/?mnt\/user-data\/outputs\//, "") 
      : "文件";

    return (
      <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40">
        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">生成的文件</p>
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shrink-0">
              <FileIcon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                {displayPath}
              </p>
              <p className="text-[9px] text-zinc-400 dark:text-zinc-500">
                {toolName === "write_file" ? "新建文件" : "修改文件"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] shrink-0 gap-1 h-7 px-2.5"
            disabled={!threadId || typeof args?.path !== "string"}
            onClick={() => {
              if (threadId && typeof args?.path === "string") {
                const artifactPath = buildToolResultArtifactPath({
                  toolName,
                  args: args ?? {},
                  messageId: parentMessageId ?? "diagnosis",
                  toolCallId: toolCallId ?? "",
                });
                if (artifactPath) {
                  select(artifactPath);
                  setOpen(true);
                }
              }
            }}
          >
            <EyeIcon className="h-3 w-3" />
            查看文件
          </Button>
        </div>
      </div>
    );
  }

  // 2. isMCPTool -> MCP Result Card + View Button
  if (isMCPTool(toolName)) {
    return (
      <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40">
        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">工具执行报告</p>
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
              <FileJsonIcon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                {toolName} 诊断结果
              </p>
              <p className="text-[9px] text-zinc-400 dark:text-zinc-500">
                已生成结构化运行数据
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-[10px] shrink-0 gap-1 h-7 px-2.5"
            disabled={!threadId || !toolCallId}
            onClick={() => {
              const artifactPath = buildToolResultArtifactPath({
                toolName,
                args: args ?? {},
                messageId: parentMessageId ?? "diagnosis",
                toolCallId: toolCallId ?? "",
              });
              if (artifactPath) {
                select(artifactPath);
                setOpen(true);
              }
            }}
          >
            <EyeIcon className="h-3 w-3" />
            查看结果
          </Button>
        </div>
      </div>
    );
  }

  // 3. bash tool -> CodeBlock with 3 lines collapse
  if (toolName === "bash") {
    const lines = result.split("\n");
    const hasMore = lines.length > 3;
    const displayCode = expanded || !hasMore ? result : lines.slice(0, 3).join("\n");

    return (
      <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40 space-y-1">
        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">执行输出</p>
        <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <CodeBlock
            code={displayCode}
            language="bash"
            className="text-[10px]"
          />
        </div>
        {hasMore && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[9px] px-2 py-0 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "收起输出" : `展开完整输出 (+${lines.length - 3} 行)`}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // 4. read_file -> CodeBlock with 5 lines collapse
  if (toolName === "read_file") {
    const fileLang = getFileLanguage(args?.path as string);
    const lines = result.split("\n");
    const hasMore = lines.length > 5;
    const displayCode = expanded || !hasMore ? result : lines.slice(0, 5).join("\n");

    return (
      <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40 space-y-1">
        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">文件内容</p>
        <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <CodeBlock
            code={displayCode}
            language={fileLang}
            className="text-[10px]"
          />
        </div>
        {hasMore && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[9px] px-2 py-0 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "收起内容" : `展开完整内容 (+${lines.length - 5} 行)`}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // 5. Check if output is JSON
  let isJson = false;
  let parsedJson: unknown = null;
  try {
    const trimmed = result.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      parsedJson = JSON.parse(trimmed);
      isJson = true;
    }
  } catch {
    // ignore
  }

  if (isJson) {
    return (
      <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40 space-y-1">
        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">结构化结果 (JSON)</p>
        <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <CodeBlock
            code={JSON.stringify(parsedJson, null, 2)}
            language="json"
            className="text-[10px]"
          />
        </div>
      </div>
    );
  }

  // 6. Generic Text Output with gradient-based truncation
  const lines = result.split("\n");
  const hasMore = lines.length > 5 || result.length > 300;

  return (
    <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40 space-y-1">
      <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">执行结果</p>
      <div className="relative">
        <pre
          className={cn(
            "text-[10px] font-mono text-zinc-600 dark:text-zinc-400 overflow-x-auto bg-zinc-100/50 dark:bg-zinc-900/50 rounded p-2 transition-all",
            !expanded && hasMore && "max-h-32 overflow-hidden",
          )}
        >
          {result}
        </pre>
        {!expanded && hasMore && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-zinc-50 dark:from-zinc-900/30 to-transparent flex items-end justify-center pb-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-5 text-[8px] px-2 py-0 shadow-sm"
              onClick={() => setExpanded(true)}
            >
              展开完整结果
            </Button>
          </div>
        )}
        {expanded && hasMore && (
          <div className="flex justify-end mt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-5 text-[9px] px-2 py-0 text-zinc-400 hover:text-zinc-600"
              onClick={() => setExpanded(false)}
            >
              收起
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
