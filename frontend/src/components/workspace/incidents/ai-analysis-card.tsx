"use client";

import {
  ActivityIcon,
  Loader2Icon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { IncidentDetail } from "@/core/alerting/types";

interface AiAnalysisCardProps {
  incident: IncidentDetail;
  analyzing: boolean;
  isBackgroundAnalyzing: boolean;
  ignoreOldSummary: boolean;
  onAnalyze: () => void;
  onOpenDiagnosis: () => void;
}

export function AiAnalysisCard({
  incident,
  analyzing,
  isBackgroundAnalyzing,
  ignoreOldSummary,
  onAnalyze,
  onOpenDiagnosis,
}: AiAnalysisCardProps) {
  return (
    <div className="space-y-6">

      {incident.ai_analysis_enabled && (
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-background p-6 shadow-sm dark:border-zinc-800">
          <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-indigo-500/5 blur-3xl" />
          <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />

          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2 border-b pb-3 border-zinc-100 dark:border-zinc-800">
            <SparklesIcon className="h-4 w-4 text-indigo-500" />
            告警解读（轻量分析 · 30s 内出结果）
          </h3>

          {analyzing || isBackgroundAnalyzing ? (
            <div className="mt-6 flex flex-col items-center justify-center text-center py-10 space-y-4">
              <Loader2Icon className="h-8 w-8 text-indigo-500 animate-spin" />
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">AI 智能解读中...</h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed px-2">
                  智能解读引擎正在并发提取关联底层信号与原始 Payload，提炼核心结论中...
                </p>
              </div>
            </div>
          ) : !ignoreOldSummary && incident.ai_summary ? (
            <div className="mt-5 space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 px-2 py-0.5 rounded flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  已生成告警解读
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">v1.0 Engine</span>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <ActivityIcon className="h-3.5 w-3.5 text-indigo-500" />
                  故障现象总结 (What Happened)
                </div>
                <div className="rounded-xl border border-zinc-100/80 bg-zinc-50/50 p-3.5 text-xs text-zinc-700 dark:border-zinc-800/80 dark:bg-zinc-900/30 dark:text-zinc-300 leading-relaxed font-medium">
                  {incident.ai_summary}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlertIcon className="h-3.5 w-3.5 text-rose-500" />
                  影响范围评估 (What&apos;s Affected)
                </div>
                <div className="rounded-xl border border-rose-500/10 bg-rose-500/5 p-3.5 text-xs text-rose-800 dark:border-rose-500/20 dark:bg-rose-950/10 dark:text-rose-300 leading-relaxed">
                  {incident.ai_impact ?? "暂无明确影响范围评估数据。"}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                  运维排查路径 (What to Check)
                </div>
                <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3.5 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-950/10 dark:text-emerald-300 leading-relaxed font-medium">
                  {incident.ai_suggestion ?? "暂无推荐排查建议。"}
                </div>
              </div>

              <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400">
                    {incident.signal_count >= 2
                      ? `基于 ${incident.signal_count} 条信号生成 · 数据充分`
                      : "基于单条信号生成 · 数据有限，仅供参考"}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  解读内容基于告警数据自动生成，仅供参考。建议结合下方信号详情和原始 Payload 交叉验证。
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8.5 text-xs font-semibold gap-1.5"
                  onClick={onAnalyze}
                  disabled={analyzing || isBackgroundAnalyzing}
                >
                  <RefreshCwIcon className="h-3.5 w-3.5" />
                  重新发起 AI 解读
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center justify-center text-center py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-50 border border-zinc-200/80 text-zinc-500 dark:bg-zinc-900 dark:border-zinc-800">
                <SparklesIcon className="h-5 w-5 text-indigo-500 animate-pulse" />
              </div>

              <h4 className="mt-4 text-xs font-bold text-zinc-800 dark:text-zinc-200">AI 解读就绪，待发起</h4>

              <p className="mt-2 text-xs text-muted-foreground leading-relaxed px-2">
                平台已经将相关的告警源、历史日志与系统拓扑进行了归集。
              </p>

              <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500 leading-normal px-2">
                立即调配大语言模型告警翻译官，为您提炼黄金三句告警智能解读，把技术字段翻译成人话。
              </p>

              <div className="mt-6 w-full border-t border-dashed border-zinc-100 pt-5 dark:border-zinc-800">
                <Button
                  size="sm"
                  className="w-full h-9 bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-100 font-semibold gap-1.5 shadow"
                  onClick={onAnalyze}
                  disabled={analyzing || isBackgroundAnalyzing}
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  一键发起 AI 告警解读
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {incident.diagnosis_agent_configured && incident.thread_id && (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-background p-6 shadow-sm dark:border-indigo-900/50">
          <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-indigo-500/5 blur-3xl" />
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2 border-b pb-3 border-zinc-100 dark:border-zinc-800">
            <WrenchIcon className="h-4 w-4 text-indigo-500" />
            深度诊断 (Agent Diagnosis)
            {incident.diagnosis_status && (
              <span className={`ml-auto text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                incident.diagnosis_status === "completed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400" :
                incident.diagnosis_status === "failed" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400" :
                incident.diagnosis_status === "running" ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400" :
                "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
              }`}>
                {incident.diagnosis_status === "completed" ? "完成" :
                 incident.diagnosis_status === "failed" ? "失败" :
                 incident.diagnosis_status === "running" ? "进行中" :
                 incident.diagnosis_status === "partial" ? "部分完成" :
                 incident.diagnosis_status === "cancelled" ? "已取消" : incident.diagnosis_status}
              </span>
            )}
          </h3>
          <div className="mt-4 space-y-3">
            {incident.diagnosis_result ? (
              <>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed line-clamp-4">
                  {incident.diagnosis_result}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={onOpenDiagnosis}
                >
                  查看完整诊断过程
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  诊断已完成，可查看完整诊断过程。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={onOpenDiagnosis}
                >
                  查看诊断过程
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
