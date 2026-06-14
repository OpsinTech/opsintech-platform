"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  InfoIcon,
  ShieldAlertIcon,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchAuthApi } from "@/core/api/auth-client";
import { useSession } from "@/core/auth/hooks";
import { useI18n } from "@/core/i18n/hooks";
import { canAccessAdminPage } from "@/core/permissions/roles";

interface AuditLog {
  id: string;
  ts: string;
  event_type: string;
  severity: "info" | "warning" | "error" | "critical";
  actor_id?: string;
  target_user_id?: string;
  metadata?: string;
  ip_address?: string;
}

interface AuditLogsResponse {
  events: AuditLog[];
}

function toDisplayText(value: unknown, fallback = "-"): string {
  if (value == null) return fallback;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function fetchAuditLogs(): Promise<AuditLogsResponse> {
  return fetchAuthApi("/api/admin/audit/logs").then((res) => {
    if (!res.ok) throw new Error("Failed to fetch audit logs");
    return res.json();
  });
}

function formatAuditTime(ts: unknown) {
  const parsed = ts instanceof Date ? ts : new Date(String(ts));
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  // Render a deterministic UTC timestamp to avoid SSR/client timezone mismatch.
  return parsed.toISOString().slice(0, 19).replace("T", " ");
}

export default function AuditPage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const canAccess = canAccessAdminPage(session?.user?.role);

  function SeverityBadge({ severity }: { severity: unknown }) {
    const severityText = toDisplayText(severity, "unknown");

    switch (severity) {
      case "info":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/30">
            <InfoIcon className="size-3" /> {t.admin.audit.severity.info}
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20 dark:bg-yellow-400/10 dark:text-yellow-500 dark:ring-yellow-400/20">
            <AlertCircleIcon className="size-3" /> {t.admin.audit.severity.warning}
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20">
            <AlertCircleIcon className="size-3" /> {t.admin.audit.severity.error}
          </span>
        );
      case "critical":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-600/10 dark:bg-purple-400/10 dark:text-purple-400 dark:ring-purple-400/20">
            <ShieldAlertIcon className="size-3" /> {t.admin.audit.severity.critical}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-500/10 dark:bg-zinc-400/10 dark:text-zinc-400 dark:ring-zinc-400/20">
            {severityText}
          </span>
        );
    }
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin_audit_logs"],
    queryFn: fetchAuditLogs,
    enabled: canAccess,
  });

  return (
    <div className="flex-1 space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.admin.audit.title}</h1>
          <p className="text-zinc-500 mt-1">
            {t.admin.audit.description}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 border-b border-zinc-200 dark:border-zinc-800 z-10">
              <tr>
                <th scope="col" className="px-6 py-3 font-medium">
                  {t.admin.audit.columns.time}
                </th>
                <th scope="col" className="px-6 py-3 font-medium">
                  {t.admin.audit.columns.severity}
                </th>
                <th scope="col" className="px-6 py-3 font-medium">
                  {t.admin.audit.columns.eventType}
                </th>
                <th scope="col" className="px-6 py-3 font-medium">
                  {t.admin.audit.columns.actor}
                </th>
                <th scope="col" className="px-6 py-3 font-medium">
                  {t.admin.audit.columns.metadata}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    {t.admin.audit.loading}
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-red-500">
                    {t.admin.audit.loadError}
                  </td>
                </tr>
              ) : !data?.events || data.events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    {t.admin.audit.noRecords}
                  </td>
                </tr>
              ) : (
                <TooltipProvider delayDuration={200}>
                  {data.events.map((log, index) => {
                    const eventTypeText = toDisplayText(log.event_type);
                    const actorText = log.actor_id ? toDisplayText(log.actor_id) : t.admin.audit.systemAnonymous;
                    const metadataText = toDisplayText(log.metadata);

                    return (
                      <tr
                        key={log.id ?? `${log.ts}-${log.event_type}-${log.actor_id ?? "system"}-${index}`}
                        className="border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-zinc-500 font-mono text-xs">
                          {formatAuditTime(log.ts)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <SeverityBadge severity={log.severity} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dotted border-zinc-400">
                                {eventTypeText}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-md">
                              <p>{eventTypeText}</p>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dotted border-zinc-400">
                                {log.actor_id ? (
                                  <span className="text-zinc-900 dark:text-zinc-100">
                                    {actorText}
                                  </span>
                                ) : (
                                  <span className="text-zinc-400 italic">{t.admin.audit.systemAnonymous}</span>
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-md">
                              <p>{actorText}</p>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-6 py-4 max-w-[300px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help truncate block text-zinc-500 font-mono text-xs border-b border-dotted border-zinc-400">
                                {metadataText}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-lg max-h-[400px] overflow-y-auto">
                              <pre className="text-xs whitespace-pre-wrap break-all">{metadataText}</pre>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })}
                </TooltipProvider>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
