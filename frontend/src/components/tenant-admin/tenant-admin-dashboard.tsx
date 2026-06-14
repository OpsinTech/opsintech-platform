"use client";

import { AlertTriangle, Bot, Boxes, ShieldAlert, Users, Wrench } from "lucide-react";

import {
  OverviewPageHeader,
  OverviewSectionCard,
} from "@/components/backoffice/overview-primitives";
import { useAlertRules } from "@/core/alerting";
import { useI18n } from "@/core/i18n/hooks";
import { useAvailableMcpConfig } from "@/core/mcp/hooks";
import { useAvailableModels } from "@/core/models/hooks";
import { useAvailableSkills } from "@/core/skills/hooks";
import { useCurrentTenant, useTenantMembers } from "@/core/tenants/hooks";

export function TenantAdminDashboard() {
  const { t } = useI18n();
  const { data: currentTenant } = useCurrentTenant();
  const { data: members = [] } = useTenantMembers();
  const { models = [] } = useAvailableModels();
  const { rawArray: tools = [] } = useAvailableMcpConfig();
  const { skills = [] } = useAvailableSkills();
  const { data: alertRules = [] } = useAlertRules();

  const tenantModels = models.filter((item) => item.scope === "tenant");
  const enabledTenantModels = tenantModels.filter((item) => item.enabled !== false);

  const tenantTools = tools.filter((item) => item.source !== "user_private");
  const enabledTenantTools = tenantTools.filter((item) => item.enabled !== false);

  const tenantSkills = skills.filter((item) => item.scope === "tenant");
  const enabledTenantSkills = tenantSkills.filter((item) => item.enabled !== false);

  const activeRules = alertRules.filter((r) => r.enabled).length;
  const suppressionCount = alertRules.filter((r) => r.rule_type === "suppression").length;
  const aggregationCount = alertRules.filter((r) => r.rule_type === "aggregation").length;

  const risks: string[] = [];
  if (members.length <= 1) risks.push(t.tenantAdmin.dashboard.riskSingleAdmin);
  if (enabledTenantModels.length === 0) risks.push(t.tenantAdmin.dashboard.riskNoModels);
  if (enabledTenantTools.length === 0) risks.push(t.tenantAdmin.dashboard.riskNoTools);

  return (
    <div className="space-y-6">
      <OverviewPageHeader
        title={t.tenantAdmin.dashboard.title}
        description={t.tenantAdmin.dashboard.description(
          currentTenant?.tenant_id ?? "-",
          currentTenant?.role ?? "tenant_member"
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard icon={Users} label={t.tenantAdmin.dashboard.members} value={members.length} />
        <MetricCard icon={Bot} label={t.tenantAdmin.dashboard.enabledModels} value={enabledTenantModels.length} />
        <MetricCard icon={Wrench} label={t.tenantAdmin.dashboard.enabledTools} value={enabledTenantTools.length} />
        <MetricCard icon={Boxes} label={t.tenantAdmin.dashboard.enabledSkills} value={enabledTenantSkills.length} />
        <MetricCard
          icon={ShieldAlert}
          label="告警治理规则"
          value={activeRules}
          hint={`${suppressionCount} 静默 · ${aggregationCount} 聚合`}
        />
        <MetricCard icon={AlertTriangle} label={t.tenantAdmin.dashboard.riskAlerts} value={risks.length} />
      </div>

      <OverviewSectionCard
        title={t.tenantAdmin.dashboard.riskTitle}
        description={t.tenantAdmin.dashboard.riskDesc}
      >
        <div className="rounded-lg border p-4">
          {risks.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t.tenantAdmin.dashboard.noRisks}</div>
          ) : (
            <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-400">
              {risks.map((risk) => (
                <li key={risk}>• {risk}</li>
              ))}
            </ul>
          )}
        </div>
      </OverviewSectionCard>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold leading-none">{value}</div>
      {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
