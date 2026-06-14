"use client";

import { useState } from "react";
import { DatabaseIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDate, getSeverityBadgeStyles } from "@/core/alerting";
import type { Signal } from "@/core/alerting/types";

interface SignalTimelineProps {
  signals: Signal[];
}

export function SignalTimeline({ signals }: SignalTimelineProps) {
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});

  const togglePayload = (sigId: string) => {
    setExpandedPayloads(prev => ({ ...prev, [sigId]: !prev[sigId] }));
  };

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-background p-6 shadow-sm dark:border-zinc-800/80">
      <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2 border-b pb-3 border-zinc-100 dark:border-zinc-800">
        <DatabaseIcon className="h-4 w-4 text-zinc-500" />
        关联告警信号时间线 (Signals Timeline)
        <span className="ml-auto rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-xs text-muted-foreground">
          共 {signals?.length ?? 0} 个信号
        </span>
      </h3>

      <div className="mt-6 relative pl-4 border-l border-zinc-200 dark:border-zinc-800 space-y-6 ml-2.5">
        {(!signals || signals.length === 0) ? (
          <p className="text-sm text-muted-foreground py-2 pl-2">暂无关联的底层信号记录。</p>
        ) : (
          signals.map((sig, idx) => (
            <div key={sig.id} className="relative pl-5">

              <span className={`absolute -left-[21.5px] top-1.5 flex h-3 w-3 items-center justify-center rounded-full border bg-background ${
                idx === 0
                  ? "border-primary ring-4 ring-primary/10"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${idx === 0 ? "bg-primary" : "bg-zinc-300 dark:bg-zinc-700"}`} />
              </span>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-900 dark:bg-zinc-900/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`${getSeverityBadgeStyles(sig.severity)} border text-[9px] px-1.5 rounded py-0`}>
                      {sig.severity}
                    </Badge>
                    <span className="text-[10px] font-mono text-zinc-400">Fingerprint: {sig.fingerprint.slice(0, 8)}...</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-medium">
                    {formatDate(sig.occurred_at ?? "", true)}
                  </span>
                </div>

                <h4 className="mt-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 leading-snug">
                  {sig.title}
                </h4>

                <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-500">
                  <span>告警源: <span className="font-semibold text-zinc-700 dark:text-zinc-400 uppercase">{sig.source}</span></span>
                  {sig.service && <span>服务: <span className="font-medium">{sig.service}</span></span>}
                </div>

                {sig.labels_json && Object.keys(sig.labels_json).length > 0 && (
                  <div className="mt-3 border-t border-zinc-200/40 dark:border-zinc-800/60 pt-3">
                    <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-2">信号关联属性 (Labels JSON)</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-zinc-100/30 dark:bg-zinc-900/30 p-2.5 rounded-lg border border-zinc-200/40 dark:border-zinc-800/40">
                      {Object.entries(sig.labels_json).map(([key, val]) => (
                        <div key={key} className="flex flex-col gap-0.5 text-[10px] min-w-0">
                          <span className="text-zinc-400 font-mono select-none truncate text-[9px] font-semibold">{key}</span>
                          <span className="text-zinc-700 dark:text-zinc-300 font-mono break-all font-medium leading-relaxed">
                            {typeof val === "string" ? val : (typeof val === "number" || typeof val === "boolean" || val === null || val === undefined ? String(val) : JSON.stringify(val))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sig.raw_payload && (
                  <div className="mt-3 pt-2.5 border-t border-dashed border-zinc-200/60 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => togglePayload(sig.id)}
                      className="flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:text-indigo-500 transition-colors cursor-pointer"
                    >
                      {expandedPayloads[sig.id] ? "收起原始告警 Payload (Collapse)" : "查看原始告警 Payload (Expand)"}
                    </button>

                    {expandedPayloads[sig.id] && (
                      <pre className="mt-2 p-3 rounded-lg bg-zinc-950 text-zinc-100 text-[10px] font-mono overflow-x-auto border border-zinc-800/80 shadow-inner select-all leading-normal max-h-60">
                        {JSON.stringify(sig.raw_payload, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  );
}
