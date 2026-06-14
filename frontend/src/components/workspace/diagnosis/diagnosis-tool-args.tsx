import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";


import { CodeBlock } from "@/components/ai-elements/code-block";

interface DiagnosisToolArgsProps {
  toolName: string;
  args: Record<string, unknown>;
}

export function DiagnosisToolArgs({ toolName, args }: DiagnosisToolArgsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!args || Object.keys(args).length === 0) {
    return null;
  }

  // Get specific highlights based on toolName
  const getSummaryContent = () => {
    if (toolName === "bash" && typeof args.command === "string") {
      return (
        <span className="font-mono text-zinc-600 dark:text-zinc-300 truncate block text-[10px]">
          命令: <code className="bg-zinc-100 dark:bg-zinc-900 px-1 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-semibold">{args.command}</code>
        </span>
      );
    }
    if ((toolName === "read_file" || toolName === "write_file") && typeof args.path === "string") {
      return (
        <span className="font-mono text-zinc-600 dark:text-zinc-300 truncate block text-[10px]">
          路径: <code className="bg-zinc-100 dark:bg-zinc-900 px-1 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-semibold">{args.path}</code>
        </span>
      );
    }

    // Generic: 2-3 key parameters summary
    const entries = Object.entries(args);
    const summaryItems = entries.slice(0, 3).map(([key, val]) => {
      const displayVal = typeof val === "string" ? val : JSON.stringify(val);
      return `${key}: ${displayVal}`;
    });
    
    let summaryText = summaryItems.join(", ");
    if (entries.length > 3) {
      summaryText += ` (+${entries.length - 3})`;
    }

    return (
      <span className="text-zinc-500 dark:text-zinc-400 truncate block font-mono text-[10px]">
        参数: {summaryText || "{}"}
      </span>
    );
  };

  return (
    <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40">
      <div 
        onClick={() => setExpanded(!expanded)} 
        className="flex items-center justify-between gap-2 cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 p-1 rounded transition-colors"
      >
        <div className="flex-1 min-w-0 text-[10px]">
          {getSummaryContent()}
        </div>
        <button 
          type="button"
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 shrink-0"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <CodeBlock
            code={JSON.stringify(args, null, 2)}
            language="json"
            className="text-[10px]"
          />
        </div>
      )}
    </div>
  );
}
