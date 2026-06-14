"use client";

import {
  AlertTriangleIcon,
  SearchIcon,
  ShieldAlertIcon,
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ActivityIcon,
  CheckCircle2Icon,
  VolumeXIcon,
  FilterIcon,
  TagIcon,
  RefreshCwIcon
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  WorkspaceContainer,
  WorkspaceBody
} from "@/components/workspace/workspace-container";
import { useIncidents, getSeverityBadgeStyles, formatDate, type IncidentSummary } from "@/core/alerting";

const PAGE_SIZE = 15;

export default function WorkspaceIncidentsPage() {
  const [activeTab, setActiveTab] = useState<"firing" | "resolved" | "suppressed">("firing");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [serviceQuery, setServiceQuery] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(0);

  // 获取告警列表
  const { data, isLoading, isError, refetch, isFetching } = useIncidents({
    status: activeTab,
    severity: severityFilter || undefined,
    service: serviceQuery || undefined,
    limit: PAGE_SIZE,
    offset: currentPage * PAGE_SIZE,
  });

  const incidents = data?.incidents ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // 过滤后的事件 (客户端二次搜索，匹配 Title / Key)
  const filteredIncidents = incidents.filter((incident) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      (incident.title ?? "").toLowerCase().includes(term) ||
      incident.incident_key.toLowerCase().includes(term)
    );
  });

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setCurrentPage(0);
  };

  return (
    <WorkspaceContainer>
      <WorkspaceBody className="bg-zinc-50 dark:bg-zinc-950">
        <div className="w-full px-6 py-8">
          {/* Header 区域 */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                <ShieldAlertIcon className="h-6 w-6 text-zinc-800 dark:text-zinc-100" />
                智能告警工作台
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                当前工作空间内处于 firing 或已处理的事件列表，您可以在此降噪和标记误报。
              </p>
            </div>

            <div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 h-9"
                onClick={() => refetch()}
                disabled={isLoading || isFetching}
              >
                <RefreshCwIcon className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                刷新列表
              </Button>
            </div>
          </div>

          {/* 状态大 Tab 切换 */}
          <div className="mt-8 flex border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => handleTabChange("firing")}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${activeTab === "firing"
                ? "border-primary text-zinc-900 dark:text-zinc-50 font-semibold"
                : "border-transparent text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-300"
                }`}
            >
              <ActivityIcon className="h-4 w-4" />
              发生中
              {activeTab === "firing" && data && totalCount > 0 && (
                <span className="rounded-full bg-rose-100 dark:bg-rose-950/40 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">
                  {totalCount}
                </span>
              )}
            </button>

            <button
              onClick={() => handleTabChange("resolved")}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${activeTab === "resolved"
                ? "border-primary text-zinc-900 dark:text-zinc-50 font-semibold"
                : "border-transparent text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-300"
                }`}
            >
              <CheckCircle2Icon className="h-4 w-4" />
              已恢复
              {activeTab === "resolved" && data && totalCount > 0 && (
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {totalCount}
                </span>
              )}
            </button>

            <button
              onClick={() => handleTabChange("suppressed")}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${activeTab === "suppressed"
                ? "border-primary text-zinc-900 dark:text-zinc-50 font-semibold"
                : "border-transparent text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-300"
                }`}
            >
              <VolumeXIcon className="h-4 w-4" />
              已静默
              {activeTab === "suppressed" && data && totalCount > 0 && (
                <span className="rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {totalCount}
                </span>
              )}
            </button>
          </div>

          {/* 筛选与搜索工具栏 */}
          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
            {/* 全局过滤搜索 */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="搜索事件标题或 INC 编号..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 border-zinc-200 dark:border-zinc-800"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {/* 服务过滤 */}
              <div className="relative w-44">
                <TagIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <Input
                  type="text"
                  placeholder="按服务名过滤..."
                  value={serviceQuery}
                  onChange={(e) => {
                    setServiceQuery(e.target.value);
                    setCurrentPage(0);
                  }}
                  className="pl-8.5 h-10 text-xs border-zinc-200 dark:border-zinc-800"
                />
              </div>

              {/* 严重度下拉过滤 */}
              <div className="relative w-36">
                <FilterIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <select
                  aria-label="按严重度过滤"
                  value={severityFilter}
                  onChange={(e) => {
                    setSeverityFilter(e.target.value);
                    setCurrentPage(0);
                  }}
                  className="w-full h-10 pr-4 pl-9 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-background outline-none cursor-pointer appearance-none text-zinc-700 dark:text-zinc-300"
                >
                  <option value="">所有严重度</option>
                  <option value="critical">Critical</option>
                  <option value="major">Major</option>
                  <option value="warning">Warning</option>
                  <option value="minor">Minor</option>
                  <option value="info">Info</option>
                </select>
              </div>
            </div>
          </div>

          {/* 列表渲染 */}
          <div className="mt-6">
            {isLoading ? (
              // Loading 骨架屏
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-20 w-full animate-pulse rounded-xl border border-zinc-200/60 bg-zinc-100/50 dark:border-zinc-800/60 dark:bg-zinc-900/30"
                  />
                ))}
              </div>
            ) : isError ? (
              // 错误态
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
                <AlertTriangleIcon className="h-10 w-10 text-rose-500" />
                <h3 className="mt-4 text-base font-semibold">告警加载失败</h3>
                <p className="mt-1 text-sm text-muted-foreground">无法从网关获取事件数据，请检查网络或重新登录重试。</p>
                <Button size="sm" onClick={() => refetch()} className="mt-4">
                  重试
                </Button>
              </div>
            ) : filteredIncidents.length === 0 ? (
              // 空状态
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 py-16 text-center bg-background/50">
                <ActivityIcon className="h-10 w-10 text-zinc-400" />
                <h3 className="mt-4 text-base font-semibold text-zinc-800 dark:text-zinc-200">没有匹配的告警事件</h3>
                <p className="mt-1 text-sm text-muted-foreground">当前大盘没有此条件的活跃事件，您的保障体系运行平稳。</p>
              </div>
            ) : (
              // 实际列表行渲染
              <div className="flex flex-col gap-3">
                {filteredIncidents.map((incident: IncidentSummary) => (
                  <Link
                    key={incident.id}
                    href={`/workspace/incidents/${incident.id}`}
                    className="group block rounded-xl border border-zinc-200/80 bg-background p-5 shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800/80 dark:hover:border-zinc-700"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      {/* 左半部分：标号，标题，环境/服务 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-zinc-500">
                            {incident.incident_key}
                          </span>

                          <Badge variant="outline" className={`${getSeverityBadgeStyles(incident.severity)} border font-medium px-2 py-0.5 rounded text-[10px] uppercase`}>
                            {incident.severity}
                          </Badge>

                          {incident.environment && (
                            <Badge variant="secondary" className="px-2 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300">
                              {incident.environment}
                            </Badge>
                          )}

                          {incident.diagnosis_status && (
                            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${incident.diagnosis_status === "completed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400" :
                              incident.diagnosis_status === "failed" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400" :
                                incident.diagnosis_status === "running" ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400" :
                                  "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                              }`}>
                              {incident.diagnosis_status === "completed" ? "已诊断" :
                                incident.diagnosis_status === "failed" ? "诊断失败" :
                                  incident.diagnosis_status === "running" ? "诊断中" :
                                    incident.diagnosis_status === "partial" ? "部分诊断" :
                                      incident.diagnosis_status}
                            </span>
                          )}
                        </div>

                        <h3 className="mt-2.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50 group-hover:underline truncate leading-snug">
                          {incident.title ?? "未命名告警事件"}
                        </h3>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          {incident.service && (
                            <span className="flex items-center gap-1">
                              <TagIcon className="h-3 w-3" />
                              服务: <span className="font-medium text-zinc-700 dark:text-zinc-300">{incident.service}</span>
                            </span>
                          )}

                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-3 w-3" />
                            最近发生: {formatDate(incident.last_seen_at)}
                          </span>
                        </div>
                      </div>

                      {/* 右半部分：归并信号数 + 查看箭头 */}
                      <div className="flex items-center justify-between sm:justify-end gap-6 border-t border-zinc-100 pt-3 sm:border-none sm:pt-0 shrink-0">
                        <div className="text-left sm:text-right">
                          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                            {incident.signal_count}
                          </span>
                          <p className="text-[10px] text-muted-foreground">关联信号数</p>
                        </div>

                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-50 border transition-colors group-hover:bg-primary group-hover:text-primary-foreground dark:bg-zinc-900 dark:border-zinc-800 group-hover:dark:border-transparent">
                          <ChevronRightIcon className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 分页控制栏 */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <span className="text-xs text-muted-foreground">
                共 <span className="font-semibold text-zinc-800 dark:text-zinc-200">{totalCount}</span> 个事件 ·
                第 <span className="font-semibold text-zinc-800 dark:text-zinc-200">{currentPage + 1}</span> / {totalPages} 页
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8.5 w-8.5 p-0"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0 || isLoading}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8.5 w-8.5 p-0"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1 || isLoading}
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
