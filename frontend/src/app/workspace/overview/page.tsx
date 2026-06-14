"use client";

import {
  ArrowLeftRight,
  // BotIcon,
  BoxesIcon,
  ChevronDown,
  MessageSquareIcon,
  SearchIcon,
  SparklesIcon,
  WrenchIcon,
  Flame,
  CheckCircle2,
  BellOff,
  Activity,
  Server,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  OverviewEmptyState,
  OverviewPageHeader,
  OverviewSectionCard,
} from "@/components/backoffice/overview-primitives";
import {
  WorkspaceBody,
  WorkspaceContainer,
} from "@/components/workspace/workspace-container";
// import { useAgents } from "@/core/agents/hooks";
import { useIncidentStats } from "@/core/alerting";
import { useI18n } from "@/core/i18n/hooks";
import { useAvailableMcpConfig } from "@/core/mcp/hooks";
import { useAvailableModels } from "@/core/models/hooks";
import { useAvailableSkills } from "@/core/skills/hooks";
import { useCurrentTenant, useSwitchTenant, useTenantList } from "@/core/tenants/hooks";
import { useThreads } from "@/core/threads/hooks";
import { pathOfThread, titleOfThread } from "@/core/threads/utils";

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === "en" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-4 text-zinc-500" />
      </div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
      {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function AlertMetricCard({
  icon: Icon,
  label,
  value,
  colorClass,
  iconColorClass,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  colorClass: string;
  iconColorClass: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 relative overflow-hidden transition-all duration-200 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${iconColorClass}`} />
      </div>
      <div className={`mt-3 text-3xl font-semibold tracking-tight ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

function formatRelativeTime(dateString: string, locale: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) {
    return locale === "zh-CN" ? "刚刚" : "just now";
  }
  if (diffMins < 60) {
    return locale === "zh-CN" ? `${diffMins} 分钟前` : `${diffMins}m ago`;
  }
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return locale === "zh-CN" ? `${diffHours} 小时前` : `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return locale === "zh-CN" ? `${diffDays} 天前` : `${diffDays}d ago`;
}

function HeaderActions() {
  const { t } = useI18n();
  const { data: currentTenant } = useCurrentTenant();
  const { data: tenants } = useTenantList();
  const { mutate: switchTenant, isPending: switching } = useSwitchTenant();
  const currentTenantId = currentTenant?.tenant_id ?? "";

  const tenantName = useMemo(() => {
    if (!currentTenant?.tenant_id) {
      return t.navMenu.unbound;
    }
    const matched = tenants?.find((item) => item.id === currentTenant.tenant_id);
    return matched?.name ?? currentTenant.tenant_id;
  }, [currentTenant?.tenant_id, tenants, t.navMenu.unbound]);

  const [shortcutHint, setShortcutHint] = useState("Ctrl+K");

  useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
    setShortcutHint(isMac ? "⌘K" : "Ctrl+K");
  }, []);

  const handleOpenCommandPalette = () => {
    window.dispatchEvent(new Event("workspace:open-command-palette"));
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground hidden h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm transition md:flex"
        onClick={handleOpenCommandPalette}
      >
        <SearchIcon className="h-3.5 w-3.5" />
        <span>{t.overview.globalSearch}</span>
        <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {shortcutHint}
        </span>
      </button>

      <div className="relative hidden items-center md:flex">
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-sm">
          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t.overview.switchTenantLabel}</span>
          <select
            aria-label={t.overview.switchTenantLabel}
            value={currentTenantId}
            disabled={switching || !tenants || tenants.length === 0}
            onChange={(event) => {
              const tenantId = event.target.value;
              if (!tenantId || tenantId === currentTenantId) {
                return;
              }
              switchTenant(tenantId);
            }}
            className="cursor-pointer appearance-none bg-transparent pr-4 pl-1 text-sm font-medium text-foreground outline-none focus:outline-none"
          >
            {!tenants || tenants.length === 0 ? (
              <option value="">{tenantName}</option>
            ) : (
              tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))
            )}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {currentTenant?.role === "tenant_admin" && (
        <Link
          href="/tenant-admin"
          className="hidden rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition hover:bg-primary/90 md:block"
        >
          {t.navMenu.manageWorkspace}
        </Link>
      )}
    </div>
  );
}

export default function WorkspaceOverviewPage() {
  const { t, locale } = useI18n();
  // const { agents = [] } = useAgents();
  const { models = [] } = useAvailableModels();
  const { rawArray: tools = [] } = useAvailableMcpConfig();
  const { skills = [] } = useAvailableSkills();
  const { data: threads = [] } = useThreads({
    limit: 20,
    sortBy: "updated_at",
    sortOrder: "desc",
    select: ["thread_id", "updated_at", "values"],
  });

  // Load real-time incident statistics
  const { data: stats, isError: statsError, isLoading: statsLoading } = useIncidentStats();



  const enabledModels = models.filter((item) => item.enabled !== false);
  const filteredTools = tools.filter((item) => item.scope !== "user");
  const uniqueTools = Array.from(new Map(filteredTools.map((item) => [item.name, item])).values());
  const enabledTools = uniqueTools.filter((item) => item.enabled !== false);
  const enabledSkills = skills.filter((item) => item.enabled !== false);
  const recentThreads = threads.slice(0, 6);

  // Localization map for alerting
  const alertText = useMemo(() => {
    const isZh = locale === "zh-CN";
    return {
      firing: isZh ? "活动告警" : "Firing Alerts",
      resolved: isZh ? "已恢复" : "Resolved Alerts",
      suppressed: isZh ? "已静默" : "Suppressed Alerts",
      total: isZh ? "事件总数" : "Total Incidents",

      distributionTitle: isZh ? "告警级别分布" : "Severity Distribution",
      distributionDesc: isZh ? "当前空间各级别告警分布态势" : "Workspace alert severity distribution",

      servicesTitle: isZh ? "Top 5 告警服务" : "Top 5 Alerting Services",
      servicesDesc: isZh ? "当前空间内告警发生频率最高的服务" : "Most frequent alerting microservices",
      noServices: isZh ? "暂无服务告警记录" : "No service alert records",

      recentTitle: isZh ? "最近活跃告警" : "Recent Firing Incidents",
      recentDesc: isZh ? "实时发生的活动状态告警列表" : "Real-time active alert incidents list",
      noRecent: isZh ? "暂无活跃告警事件" : "No active firing incidents",
      viewAll: isZh ? "查看全部" : "View All",

      critical: isZh ? "紧急 (Critical)" : "Critical",
      major: isZh ? "重要 (Major)" : "Major",
      warning: isZh ? "警告 (Warning)" : "Warning",
      info: isZh ? "提示 (Info)" : "Info",
    };
  }, [locale]);

  // Compute severity distribution percentages for the CSS Horizontal Bar Chart


  // Helper to color-code badge severity classes
  const getSeverityBadgeClass = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical":
        return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/30";
      case "major":
        return "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200 dark:border-orange-900/30";
      case "warning":
        return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30";
      default:
        return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30";
    }
  };

  return (
    <WorkspaceContainer>
      <WorkspaceBody className="bg-zinc-50 dark:bg-zinc-950">
        <div className="w-full px-6 py-6 space-y-6">
          <OverviewPageHeader
            title={t.overview.title}
            description={t.overview.description}
            actions={<HeaderActions />}
          />

          {/* Developer Resources Metrics Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={MessageSquareIcon}
              label={t.overview.mySessions}
              value={threads.length}
              hint={t.overview.mySessionsHint}
            />
            <MetricCard
              icon={SparklesIcon}
              label={t.overview.availableModels}
              value={enabledModels.length}
              hint={t.overview.availableModelsHint(models.length, enabledModels.length)}
            />
            <MetricCard
              icon={WrenchIcon}
              label={t.overview.availableTools}
              value={enabledTools.length}
              hint={t.overview.availableToolsHint(uniqueTools.length, enabledTools.length)}
            />
            <MetricCard
              icon={BoxesIcon}
              label={t.overview.availableSkills}
              value={enabledSkills.length}
              hint={t.overview.availableSkillsHint(skills.length, enabledSkills.length)}
            />
          </div>

          {/* Premium Alert Metrics Grid */}
          {statsError && (
            <div className="pt-2">
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30 p-4 text-center">
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                  {locale === "zh-CN"
                    ? "告警统计数据加载失败，请检查后台服务是否正常"
                    : "Failed to load incident stats — please check if the backend service is running"}
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 pt-2">
            <AlertMetricCard
              icon={Flame}
              label={alertText.firing}
              value={statsLoading ? "—" : (stats?.firing ?? 0)}
              colorClass="text-red-600 dark:text-red-400"
              iconColorClass="text-red-500"
            />
            <AlertMetricCard
              icon={CheckCircle2}
              label={alertText.resolved}
              value={statsLoading ? "—" : (stats?.resolved ?? 0)}
              colorClass="text-emerald-600 dark:text-emerald-400"
              iconColorClass="text-emerald-500"
            />
            <AlertMetricCard
              icon={BellOff}
              label={alertText.suppressed}
              value={statsLoading ? "—" : (stats?.suppressed ?? 0)}
              colorClass="text-zinc-500 dark:text-zinc-400"
              iconColorClass="text-zinc-400"
            />
            <AlertMetricCard
              icon={Activity}
              label={alertText.total}
              value={statsLoading ? "—" : (stats?.total ?? 0)}
              colorClass="text-indigo-600 dark:text-indigo-400"
              iconColorClass="text-indigo-500"
            />
          </div>

          {/* Balanced Two-Column Workspace Layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
            {/* Left Column: Recent Conversations */}
            <div className="space-y-6">
              <OverviewSectionCard
                title={t.overview.recentSessions}
                actions={
                  <Link
                    href="/workspace/chats"
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    {t.overview.viewAll}
                  </Link>
                }
              >
                <div className="mt-4 rounded-lg border overflow-hidden">
                  {recentThreads.length === 0 ? (
                    <OverviewEmptyState text={t.overview.noSessions} />
                  ) : (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-900 bg-background/30">
                      {recentThreads.map((thread) => (
                        <li
                          key={thread.thread_id}
                          className="hover:bg-background/80 transition-colors"
                        >
                          <Link
                            href={pathOfThread(thread.thread_id)}
                            className="flex items-center justify-between gap-3 p-4"
                          >
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                {titleOfThread(thread)}
                              </h4>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Thread ID: {thread.thread_id}
                              </div>
                            </div>
                            <div className="shrink-0 text-xs text-muted-foreground font-medium">
                              {formatDateTime(thread.updated_at, locale)}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </OverviewSectionCard>
            </div>

            {/* Right Column: Recent Firing Incidents */}
            <div className="space-y-6">
              <OverviewSectionCard
                title={alertText.recentTitle}
                description={alertText.recentDesc}
                actions={
                  <Link
                    href="/workspace/incidents"
                    className="text-xs font-semibold text-indigo-600 hover:underline flex items-center"
                  >
                    {alertText.viewAll}
                  </Link>
                }
              >
                <div className="mt-4">
                  {!stats?.recent_incidents || stats.recent_incidents.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg bg-background/20">
                      {alertText.noRecent}
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900 bg-background/30">
                        {stats.recent_incidents.map((incident) => (
                          <li key={incident.id} className="hover:bg-background/80 transition-colors">
                            <Link
                              href={`/workspace/incidents/${incident.id}`}
                              className="flex items-center justify-between gap-4 p-4"
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-mono font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                                    {incident.incident_key}
                                  </span>
                                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${getSeverityBadgeClass(incident.severity)}`}>
                                    {locale === "zh-CN"
                                      ? (incident.severity === "critical" ? "紧急" : incident.severity === "major" ? "重要" : incident.severity === "warning" ? "警告" : incident.severity === "minor" ? "次要" : "提示")
                                      : incident.severity}
                                  </span>
                                </div>
                                <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate leading-snug">
                                  {incident.title ?? "Untitled Incident"}
                                </h4>
                                {incident.service && (
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Server className="h-3 w-3" />
                                    <span>{incident.service}</span>
                                  </div>
                                )}
                              </div>
                              <span className="shrink-0 text-xs text-muted-foreground font-medium">
                                {formatRelativeTime(incident.last_seen_at, locale)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </OverviewSectionCard>
            </div>
          </div>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
