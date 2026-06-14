"use client";

import {
  ArrowLeftIcon,
  ActivityIcon,
  AlertTriangleIcon,
  SparklesIcon,
  WrenchIcon,
  RefreshCwIcon,
  Loader2Icon,
  ShieldCheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  BotIcon,
  ArrowUpRightIcon,
  StopCircleIcon
} from "lucide-react";
import Link from "next/link";
import { use, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetTitle
} from "@/components/ui/sheet";
import { AiAnalysisCard } from "@/components/workspace/incidents/ai-analysis-card";
import { IncidentHeader } from "@/components/workspace/incidents/incident-header";
import { SignalTimeline } from "@/components/workspace/incidents/signal-timeline";
import { MarkdownContent } from "@/components/workspace/messages/markdown-content";
import {
  WorkspaceContainer,
  WorkspaceBody
} from "@/components/workspace/workspace-container";
import { useAgents } from "@/core/agents";
import { useIncidentDetail, useSuppressIncident, useUnsuppressIncident, useAnalyzeIncident, useCancelDiagnosis, getSeverityBadgeStyles, formatDate, diagnoseIncident } from "@/core/alerting";
import {
  type DiagnosisStep,
  parseSSELine,
  AGUI_RUN_STARTED,
  AGUI_RUN_FINISHED,
  AGUI_RUN_ERROR,
  AGUI_TEXT_MESSAGE_START,
  AGUI_TEXT_MESSAGE_CONTENT,
  AGUI_TEXT_MESSAGE_END,
  AGUI_TOOL_CALL_RESULT,
  AGUI_STEP_STARTED,
  AGUI_STEP_FINISHED,
  AGUI_CLARIFICATION_REQUEST,
} from "@/core/alerting/diagnosis-types";
import { pathOfThread } from "@/core/threads/utils";
import { cn } from "@/lib/utils";
import { SaveAsSkillDialog } from "@/components/workspace/incidents/save-as-skill-dialog";

// 定义页面接收的 params 动态属性
interface PageProps {
  params: Promise<{ incident_id: string }>;
}

export default function WorkspaceIncidentDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const incidentId = resolvedParams.incident_id;

  // 获取详情数据
  const { data: incident, isLoading, isError, refetch } = useIncidentDetail(incidentId);

  // 降噪静默 Mutation
  const { mutate: handleSuppress, isPending: suppressing } = useSuppressIncident();

  // 恢复活跃 Mutation
  const { mutate: handleUnsuppress, isPending: unsuppressing } = useUnsuppressIncident();

  // AI 解读 Mutation
  const { mutate: handleAnalyze, isPending: analyzing } = useAnalyzeIncident();

  // Agent diagnosis state
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisThreadId, setDiagnosisThreadId] = useState<string | null>(null);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [diagnosisPanelOpen, setDiagnosisPanelOpen] = useState(false);
  const [diagnosisSteps, setDiagnosisSteps] = useState<DiagnosisStep[]>([]);
  const [conclusionText, setConclusionText] = useState("");
  const [fileCount, setFileCount] = useState(0);
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null);
  const [replanCount, setReplanCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { mutate: cancelDiagnosisMutate } = useCancelDiagnosis();

  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const { agents: availableAgents = [], isLoading: isLoadingAgents } = useAgents();

  useEffect(() => {
    if (incident?.agent_id) {
      setSelectedAgentId(incident.agent_id);
    } else if (availableAgents && availableAgents.length > 0 && !selectedAgentId) {
      const firstAgent = availableAgents[0];
      if (firstAgent) {
        setSelectedAgentId(firstAgent.id);
      }
    }
  }, [incident?.agent_id, availableAgents]);

  useEffect(() => {
    if (diagnosisPanelOpen && !diagnosing && !conclusionText && incident?.diagnosis_result) {
      setConclusionText(incident.diagnosis_result);
    }
  }, [diagnosisPanelOpen, incident?.diagnosis_result, diagnosing, conclusionText]);

  const currentThreadId = diagnosisThreadId ?? incident?.thread_id ?? null;

  const selectedAgentName = useMemo(() => {
    if (selectedAgentId && availableAgents) {
      const found = availableAgents.find(a => a.id === selectedAgentId);
      if (found) return found.name;
    }
    return "lead_agent";
  }, [selectedAgentId, availableAgents]);

  const handleExportReport = () => {
    if (!incident) return;

    const lines: string[] = [];
    lines.push(`# 告警事件诊断报告`);
    lines.push("");
    lines.push(`- **事件编号**: ${incident.incident_key}`);
    lines.push(`- **标题**: ${incident.title ?? "N/A"}`);
    lines.push(`- **严重级别**: ${incident.severity}`);
    lines.push(`- **服务**: ${incident.service ?? "Unknown"}`);
    lines.push(`- **环境**: ${incident.environment ?? "Unknown"}`);
    lines.push(`- **状态**: ${incident.status}`);
    lines.push(`- **信号数**: ${incident.signal_count}`);
    lines.push(`- **首次检测**: ${incident.first_seen_at}`);
    lines.push(`- **最后更新**: ${incident.last_seen_at}`);
    lines.push("");

    if (incident.ai_summary || incident.ai_impact || incident.ai_suggestion) {
      lines.push("## AI 解读");
      lines.push("");
      if (incident.ai_summary) lines.push(`**摘要**: ${incident.ai_summary}`);
      if (incident.ai_impact) lines.push(`**影响**: ${incident.ai_impact}`);
      if (incident.ai_suggestion) lines.push(`**建议**: ${incident.ai_suggestion}`);
      lines.push("");
    }

    const diagnosisSummary = conclusionText || incident?.diagnosis_result;
    if (diagnosisSummary) {
      lines.push("## 深度诊断结果");
      lines.push("");
      lines.push(diagnosisSummary);
      lines.push("");
    }

    const now = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
    const filename = `diagnosis-${incident.incident_key}-${now}.md`;
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("诊断报告已导出");
  };

  const handleDiagnosisClick = () => {
    setDiagnosisPanelOpen(true);
  };

  const connectStream = useCallback(async (isReconnect = false) => {
    if (diagnosing && abortControllerRef.current) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setDiagnosing(true);
    setDiagnosisError(null);
    if (!isReconnect) {
      setDiagnosisThreadId(null);
      setDiagnosisSteps([]);
      setConclusionText("");
      setFileCount(0);
      setClarificationQuestion(null);
      setReplanCount(0);
    }

    try {
      const { getAuthHeaders } = await import("@/core/api/auth-client");
      const { getBackendBaseURL } = await import("@/core/config");
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const baseUrl = getBackendBaseURL();

      const url = `${baseUrl}/api/incidents/${encodeURIComponent(incidentId)}/diagnose` +
        (selectedAgentId ? `?agent_id=${encodeURIComponent(selectedAgentId)}` : "");

      const response = await fetch(url, {
        method: "POST",
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? `Diagnosis failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      if (isReconnect) {
        setDiagnosisSteps([]);
        setConclusionText("");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const msg = parseSSELine(line);
          if (!msg) continue;

          switch (msg.type) {
            case AGUI_RUN_STARTED:
              setDiagnosisThreadId(msg.threadId);
              break;

            case AGUI_RUN_FINISHED:
              break;

            case AGUI_RUN_ERROR:
              setDiagnosisError(msg.message);
              break;

            case AGUI_TEXT_MESSAGE_START:
            case AGUI_TEXT_MESSAGE_END:
              break;

            case AGUI_TEXT_MESSAGE_CONTENT:
              if (msg.delta.includes("⚠️")) {
                setReplanCount(prev => prev + 1);
              }
              setConclusionText(prev => prev + msg.delta);
              break;

            case AGUI_TOOL_CALL_RESULT:
              try {
                const result = JSON.parse(msg.content);
                if (result?.type === "present_files_result" && Array.isArray(result.filepaths)) {
                  setFileCount(fc => Math.max(fc, result.filepaths.length));
                }
              } catch {
                // ignore
              }
              break;

            case AGUI_STEP_STARTED: {
              setDiagnosisSteps(prev => {
                const exists = prev.some(s => s.label === msg.stepName);
                if (exists) return prev;
                return [...prev, {
                  id: prev.length + 1,
                  label: msg.stepName,
                  status: "running" as const,
                }];
              });
              break;
            }

            case AGUI_STEP_FINISHED:
              setDiagnosisSteps(prev =>
                prev.map(s => s.label === msg.stepName ? { ...s, status: "done" as const } : s)
              );
              break;

            case AGUI_CLARIFICATION_REQUEST:
              setClarificationQuestion(msg.question);
              break;
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // cancelled by user
      } else {
        setDiagnosisError(e instanceof Error ? e.message : "Unknown error");
      }
    } finally {
      setDiagnosing(false);
      abortControllerRef.current = null;
      void refetch();
    }
  }, [incidentId, selectedAgentId, diagnosing, refetch]);

  async function startDiagnosis() {
    setDiagnosisPanelOpen(true);
    await connectStream(false);
  }

  // Auto-connect to ongoing background stream if running when entering/refreshing
  useEffect(() => {
    if (incident?.diagnosis_status === "running" && !diagnosing && !abortControllerRef.current) {
      setDiagnosisPanelOpen(true);
      void connectStream(true);
    }
  }, [incident?.diagnosis_status, connectStream, diagnosing]);

  const handleCancelDiagnosis = () => {
    abortControllerRef.current?.abort();
    cancelDiagnosisMutate(incidentId, {
      onSettled: () => {
        void refetch();
      },
    });
  };

  // 本地后台分析轮询状态
  const [isBackgroundAnalyzing, setIsBackgroundAnalyzing] = useState(false);
  const [ignoreOldSummary, setIgnoreOldSummary] = useState(false);
  const [pollingCount, setPollingCount] = useState(0);

  // 计算当前的实际解读摘要，用于避免重新解读时的旧缓存时序冲突
  const effectiveSummary = ignoreOldSummary ? null : incident?.ai_summary;

  // 当后台异步清空旧数据后，重置本地忽略标记
  useEffect(() => {
    if (incident?.ai_summary === null && ignoreOldSummary) {
      setIgnoreOldSummary(false);
    }
  }, [incident, ignoreOldSummary]);

  // 告警 AI 解读异步分析后台轮询 Effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isBackgroundAnalyzing && incident && !effectiveSummary) {
      if (pollingCount >= 15) {
        setIsBackgroundAnalyzing(false);
        setIgnoreOldSummary(false);
        setPollingCount(0);
        toast.warning("AI 告警解读耗时较长，任务已在后台排队，请稍后手动刷新查看。");
        return;
      }

      intervalId = setInterval(() => {
        setPollingCount(prev => prev + 1);
        void refetch();
      }, 2000);
    } else if (incident && effectiveSummary) {
      setIsBackgroundAnalyzing(false);
      setPollingCount(0);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isBackgroundAnalyzing, incident, refetch, pollingCount, effectiveSummary]);

  if (isLoading) {
    return (
      <WorkspaceContainer>
        <WorkspaceBody className="bg-zinc-50 dark:bg-zinc-950">
          <div className="w-full px-6 py-8 animate-pulse space-y-6">
            <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-28 w-full bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-60 md:col-span-2 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
              <div className="h-60 bg-zinc-200 dark:bg-zinc-800 rounded-2xl" />
            </div>
          </div>
        </WorkspaceBody>
      </WorkspaceContainer>
    );
  }

  if (isError || !incident) {
    return (
      <WorkspaceContainer>
        <WorkspaceBody className="bg-zinc-50 dark:bg-zinc-950">
          <div className="mx-auto w-full max-w-3xl px-6 py-16 flex flex-col items-center justify-center text-center">
            <AlertTriangleIcon className="h-12 w-12 text-rose-500" />
            <h3 className="mt-4 text-lg font-bold">告警事件未找到</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              请求的告警 ID 不存在，或者该事件已被清理删除。
            </p>
            <Link href="/workspace/incidents" className="mt-6">
              <Button size="sm" variant="outline" className="gap-2">
                <ArrowLeftIcon className="h-4 w-4" /> 返回告警列表
              </Button>
            </Link>
          </div>
        </WorkspaceBody>
      </WorkspaceContainer>
    );
  }

  // 拼接智能工作台诊断参数
  const diagnosisQuery = encodeURIComponent(
    `帮我详细排查告警事件 [${incident.incident_key}]。该告警名为 "${incident.title}"，发生在服务 "${incident.service}" 的 ${incident.environment} 环境上，当前严重度为 ${incident.severity}。请帮我列出可能的排查步骤，并使用沙箱命令行终端抓取该服务的日志信息，探寻异常。`
  );

  return (
    <WorkspaceContainer>
      <WorkspaceBody className="bg-zinc-50 dark:bg-zinc-950">
        <div className="w-full px-6 py-8">
          {/* 返回按钮 */}
          <div className="flex items-center justify-between">
            <Link
              href="/workspace/incidents"
              className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              返回告警列表
            </Link>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-zinc-500 gap-1.5"
              onClick={() => refetch()}
            >
              <RefreshCwIcon className="h-3.5 w-3.5" />
              刷新
            </Button>
          </div>

          {/* 顶层主控制卡片 */}
          <div className="mt-4">
            <IncidentHeader
              incident={incident}
              onSuppress={() => handleSuppress(incident.id)}
              onUnsuppress={() => handleUnsuppress(incident.id)}
              onOpenDiagnosis={handleDiagnosisClick}
              onExportReport={handleExportReport}
              suppressing={suppressing}
              unsuppressing={unsuppressing}
              diagnosing={diagnosing}
              currentThreadId={currentThreadId ?? null}
            />
          </div>

          {/* 左右板块排版 */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">

            {/* 左侧：Signals 时间线 (占位 2/3) */}
            <div className="lg:col-span-2 space-y-6">
              <SignalTimeline signals={incident.signals ?? []} />
            </div>

            {/* 右侧：AI 解读卡片 */}
            <AiAnalysisCard
              incident={incident}
              analyzing={analyzing}
              isBackgroundAnalyzing={isBackgroundAnalyzing}
              ignoreOldSummary={ignoreOldSummary}
              onAnalyze={() => {
                setIsBackgroundAnalyzing(true);
                setIgnoreOldSummary(true);
                setPollingCount(0);
                handleAnalyze(incident.id, {
                  onError: () => {
                    setIsBackgroundAnalyzing(false);
                    setIgnoreOldSummary(false);
                  }
                });
              }}
              onOpenDiagnosis={() => setDiagnosisPanelOpen(true)}
            />

          </div>

          {/* 深度诊断滑出式抽屉 */}
          <Sheet open={diagnosisPanelOpen} onOpenChange={setDiagnosisPanelOpen}>
            <SheetContent
              side="right"
              className="w-[94vw] sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col h-full bg-background border-l border-zinc-200 dark:border-zinc-800"
            >
              {/* Drawer Header */}
              <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <WrenchIcon className="h-5 w-5 text-indigo-500" />
                  <SheetTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    🩺 深度诊断（Agent 执行排障 SOP）
                  </SheetTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 text-xs"
                    onClick={handleExportReport}
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    导出报告
                  </Button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* 智能体选择与控制面板 */}
                {incident.diagnosis_status !== "running" && !diagnosing && (
                  <details open className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-background overflow-hidden shadow-sm group">
                    <summary className="flex items-center justify-between p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 transition-colors">
                      <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider cursor-pointer">
                        选择深度诊断智能体
                      </label>
                      <div className="flex items-center gap-2">
                        {incident.diagnosis_status && (
                          <span className={cn(
                            "text-[10px] px-2 py-0.5 rounded font-mono uppercase font-semibold",
                            incident.diagnosis_status === "completed" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400",
                            incident.diagnosis_status === "failed" && "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400",
                            incident.diagnosis_status === "partial" && "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400",
                            incident.diagnosis_status === "cancelled" && "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                          )}>
                            诊断状态: {
                              incident.diagnosis_status === "completed" ? "完成" :
                                incident.diagnosis_status === "failed" ? "失败" :
                                  incident.diagnosis_status === "partial" ? "部分完成" :
                                    incident.diagnosis_status === "cancelled" ? "已取消" :
                                      incident.diagnosis_status
                            }
                          </span>
                        )}
                        <ChevronDownIcon className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-180" />
                      </div>
                    </summary>

                    <div className="px-4 pb-4 space-y-3">
                      {/* Show diagnosis error message */}
                      {incident.diagnosis_status === "failed" && incident.diagnosis_error && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/10 p-3">
                          <p className="text-xs font-medium text-rose-700 dark:text-rose-400 mb-1">诊断失败原因</p>
                          <p className="text-xs text-rose-600 dark:text-rose-400">{incident.diagnosis_error}</p>
                        </div>
                      )}

                      {incident.diagnosis_status === "partial" && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/10 p-3">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">诊断被中断</p>
                          <p className="text-xs text-amber-600 dark:text-amber-400">诊断过程中断，已保存部分结果。建议重新发起完整诊断。</p>
                        </div>
                      )}

                      <ScrollArea className="max-h-64">
                        <div className="space-y-2 pr-2">
                          {availableAgents && availableAgents.length > 0 ? (
                            availableAgents.map((agent) => {
                              const isSelected = selectedAgentId === agent.id;
                              const isDisabled = agent.enabled === false;

                              return (
                                <div
                                  key={agent.id}
                                  onClick={() => !isDisabled && setSelectedAgentId(agent.id)}
                                  className={cn(
                                    "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                                    isDisabled
                                      ? "opacity-50 pointer-events-none"
                                      : isSelected
                                        ? "ring-2 ring-indigo-500 border-indigo-300 dark:border-indigo-700 bg-indigo-50/30 dark:bg-indigo-950/10 cursor-pointer"
                                        : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 cursor-pointer"
                                  )}
                                >
                                  {/* 左侧：BotIcon */}
                                  <div className={cn(
                                    "p-2 rounded-lg border shrink-0",
                                    isSelected
                                      ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400"
                                      : "bg-zinc-50 border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400"
                                  )}>
                                    <BotIcon className="h-4 w-4" />
                                  </div>

                                  {/* 右侧 */}
                                  <div className="flex-1 min-w-0 space-y-1">
                                    {/* 行1: name（粗体）+ 共享/私有 badge + model badge */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                                        {agent.name}
                                      </span>
                                      <Badge variant="outline" className={cn(
                                        "text-[10px] px-1.5 py-0 h-4 leading-none font-normal shrink-0",
                                        agent.is_shared
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400"
                                          : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                                      )}>
                                        {agent.is_shared ? "共享" : "私有"}
                                      </Badge>
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 leading-none font-mono font-normal shrink-0 bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                                        {agent.model ?? "default"}
                                      </Badge>
                                    </div>

                                    {/* 行2: description（line-clamp-2） */}
                                    {agent.description && (
                                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                                        {agent.description}
                                      </p>
                                    )}

                                    {/* 行3: 工具组数 badge + 技能数 badge + tags（最多3个） */}
                                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 leading-none font-normal shrink-0 border-indigo-100/80 bg-indigo-50/30 text-indigo-700 dark:border-indigo-900/30 dark:bg-indigo-950/10 dark:text-indigo-400">
                                        工具组: {agent.tool_groups?.length ?? 0}
                                      </Badge>
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 leading-none font-normal shrink-0 border-sky-100/80 bg-sky-50/30 text-sky-700 dark:border-sky-900/30 dark:bg-sky-950/10 dark:text-sky-400">
                                        技能: {agent.skills?.length ?? 0}
                                      </Badge>
                                      {agent.tags?.slice(0, 3).map((tag, idx) => (
                                        <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 h-4 leading-none font-normal shrink-0 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-400">
                                          {tag}
                                        </Badge>
                                      ))}
                                      {(agent.tags?.length ?? 0) > 3 && (
                                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono">
                                          +{agent.tags.length - 3}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 py-4 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                              无可用智能体，请先去智能体中心创建
                            </div>
                          )}
                        </div>
                      </ScrollArea>

                      <Button
                        size="sm"
                        disabled={!selectedAgentId || diagnosing}
                        onClick={startDiagnosis}
                        className={cn(
                          "w-full text-white gap-1.5 h-9 font-semibold text-xs px-4",
                          incident.diagnosis_status === "failed" || incident.diagnosis_status === "partial"
                            ? "bg-rose-600 hover:bg-rose-700"
                            : "bg-indigo-600 hover:bg-indigo-700"
                        )}
                      >
                        <SparklesIcon className="h-3.5 w-3.5" />
                        {incident.diagnosis_status === "failed" || incident.diagnosis_status === "partial"
                          ? "重新诊断"
                          : incident.diagnosis_status === "completed"
                            ? "重新诊断"
                            : "开始深度诊断"}
                      </Button>
                    </div>
                  </details>
                )}

                {(incident.diagnosis_status === "running" || diagnosing) && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/20 dark:border-indigo-900/30 dark:bg-indigo-950/10 p-4 flex items-center justify-between shadow-sm gap-4">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Loader2Icon className="h-4 w-4 text-indigo-500 animate-spin" />
                        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                          深度诊断执行中...
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 pl-6 leading-normal">
                        诊断过程可能需要几分钟。您可以关闭此面板或离开此页面，诊断将在后台继续运行，完成后您可以随时回来查看结果。
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-indigo-50 border border-indigo-100 dark:bg-indigo-950/40 dark:border-indigo-900 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded font-mono">
                        Agent: {availableAgents.find(a => a.id === selectedAgentId)?.name ?? "lead_agent"}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900 dark:text-rose-400"
                        onClick={handleCancelDiagnosis}
                      >
                        <StopCircleIcon className="h-3 w-3" />
                        停止诊断
                      </Button>
                    </div>
                  </div>
                )}

                {/* 0. 诊断能力状态 */}
                <details className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/10 overflow-hidden group">
                  <summary className="flex items-center justify-between p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 transition-colors">
                    <h4 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheckIcon className="h-3.5 w-3.5" />
                      诊断能力状态
                    </h4>
                    <ChevronDownIcon className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 grid grid-cols-2 gap-3 text-xs">
                    {[
                      { label: "告警上下文分析", desc: "信号数据 + 历史事件 + 变更记录" },
                      ...(availableAgents.find(a => a.id === selectedAgentId)?.tool_groups ?? []).map(tg => ({
                        label: tg,
                        desc: tg === "bash"
                          ? "命令行执行与环境交互"
                          : tg === "file:read"
                            ? "日志检索与文件读取"
                            : tg === "http"
                              ? "网络请求与 API 调用"
                              : "智能体已配置的工具组能力"
                      }))
                    ].map((cap) => (
                      <div key={cap.label} className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/10 p-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0 bg-emerald-500" />
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{cap.label}</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1">
                          {cap.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>

                {/* SOP 执行进度（紧凑版） */}
                {diagnosisSteps.length > 0 ? (
                  <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/10 p-4 space-y-2">
                    <h4 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                      <ActivityIcon className="h-3.5 w-3.5" />
                      SOP 执行进度
                    </h4>
                    <div className="space-y-2">
                      {diagnosisSteps.map((step) => (
                        <div key={step.id} className="flex items-center gap-2.5 text-xs">
                          {step.status === "done" ? (
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                          ) : step.status === "running" ? (
                            <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-indigo-500 shrink-0">
                              <span className="absolute h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                            </span>
                          ) : step.status === "error" ? (
                            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
                          ) : (
                            <span className="h-2.5 w-2.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-background shrink-0" />
                          )}
                          <span className={cn(
                            "font-medium",
                            step.status === "done" && "text-zinc-500 line-through",
                            step.status === "running" && "text-indigo-600 dark:text-indigo-400",
                            step.status === "error" && "text-rose-600 dark:text-rose-400",
                            step.status === "pending" && "text-zinc-400"
                          )}>
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : diagnosing ? (
                  <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/10 p-4">
                    <div className="flex items-center gap-3 py-2">
                      <Loader2Icon className="h-4 w-4 text-indigo-500 animate-spin" />
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Agent 正在执行排障步骤...
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* 诊断错误（实时展示） */}
                {diagnosisError && (
                  <div className="rounded-xl border border-rose-200/80 dark:border-rose-800/80 bg-rose-50/30 dark:bg-rose-950/10 p-4 space-y-2">
                    <h4 className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangleIcon className="h-3.5 w-3.5" />
                      诊断过程中发生错误
                    </h4>
                    <div className="rounded-lg border border-rose-100 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-900/20 p-3">
                      <pre className="text-xs text-rose-600 dark:text-rose-400 font-mono whitespace-pre-wrap break-all line-clamp-6">
                        {diagnosisError}
                      </pre>
                    </div>
                    <p className="text-[10px] text-rose-500">
                      诊断已自动终止。请检查错误原因后重新发起诊断，或进入智能工作台手动排查。
                    </p>
                  </div>
                )}

                {/* Agent 重新规划提示（实时展示） */}
                {diagnosing && replanCount > 0 && !diagnosisError && (
                  <div className="rounded-xl border border-amber-200/80 dark:border-amber-800/80 bg-amber-50/30 dark:bg-amber-950/10 p-3 flex items-center gap-3">
                    <Loader2Icon className="h-4 w-4 text-amber-500 animate-spin shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Agent 遇到问题，正在重新规划...
                      </p>
                      <p className="text-[10px] text-amber-600 dark:text-amber-500">
                        第 {replanCount} 次重新规划。如果持续出现，诊断将自动终止。
                      </p>
                    </div>
                  </div>
                )}

                {/* 需要用户输入（Agent 调用了 ask_clarification） */}
                {clarificationQuestion && (
                  <div className="rounded-xl border border-amber-200/80 dark:border-amber-800/80 bg-amber-50/30 dark:bg-amber-950/10 p-4 space-y-3">
                    <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangleIcon className="h-3.5 w-3.5" />
                      需要您的输入
                    </h4>
                    <div className="rounded-lg border border-amber-100 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/20 p-3">
                      <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed whitespace-pre-wrap line-clamp-6">
                        {clarificationQuestion}
                      </p>
                    </div>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500">
                      Agent 在诊断过程中需要您的反馈才能继续。点击下方按钮进入智能工作台回复。
                    </p>
                  </div>
                )}

                {/* 诊断结论（完成后显示） */}
                {!diagnosing && conclusionText && (
                  <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/10 p-4 space-y-3">
                    <h4 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                      <SparklesIcon className="h-3.5 w-3.5" />
                      诊断结论
                    </h4>
                    <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      <MarkdownContent content={conclusionText} isLoading={false} rehypePlugins={null} />
                    </div>
                    {fileCount > 0 && (
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        本次诊断共生成 <span className="font-semibold text-indigo-600 dark:text-indigo-400">{fileCount}</span> 个文件，点击下方&ldquo;进入智能工作台&rdquo;查看和下载
                      </p>
                    )}
                  </div>
                )}

                {/* 底部：操作按钮 */}
                {!diagnosing && conclusionText && (
                  <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/10">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          需要深入排查？
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                          跳转智能工作台，基于诊断上下文继续与 Agent 对话排查
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <SaveAsSkillDialog
                          incidentTitle={incident.title ?? incident.incident_key ?? incidentId}
                          diagnosisText={conclusionText}
                          diagnosisSteps={diagnosisSteps.map(s => s.label)}
                          toolCallsSummary={[]}
                        />
                        {currentThreadId && (
                          <Link
                            href={`${pathOfThread(currentThreadId)}?incident=${encodeURIComponent(incidentId)}`}
                            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold transition shadow-sm no-underline bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-100"
                          >
                            <ArrowUpRightIcon className="h-3.5 w-3.5" />
                            进入智能工作台
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 底部：进入智能工作台（旧逻辑保留作为 fallback） */}
                {currentThreadId && !diagnosing && !conclusionText && (
                  <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/10">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          需要深入排查？
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                          跳转智能工作台，基于诊断上下文继续与 Agent 对话排查
                        </p>
                      </div>
                      <Link
                        href={`${pathOfThread(currentThreadId)}?incident=${encodeURIComponent(incidentId)}`}
                        className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold transition shadow-sm no-underline bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-100"
                      >
                        <ArrowUpRightIcon className="h-3.5 w-3.5" />
                        进入智能工作台
                      </Link>
                    </div>
                  </div>
                )}

              </div>

            </SheetContent>
          </Sheet>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
