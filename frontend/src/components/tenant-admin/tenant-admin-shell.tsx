"use client";

import { Bot, Boxes, Building2, Radio, ShieldAlert, ShieldCheck, Users, Wrench } from "lucide-react";

import { BackofficeShellLayout } from "@/components/backoffice/backoffice-shell-layout";
import { useI18n } from "@/core/i18n/hooks";
import { useCurrentTenant, useSwitchTenant, useTenantList } from "@/core/tenants";
import { hasRouteAccess } from "@/core/tenants/route-type-requirements";
import { useWorkspaceTypeGuard } from "@/core/tenants/use-workspace-type-guard";

export function TenantAdminShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { t } = useI18n();
  const { data: currentTenant } = useCurrentTenant();
  const { data: tenants = [] } = useTenantList();
  const { mutate: switchTenant, isPending: switching } = useSwitchTenant();
  const currentTenantId = currentTenant?.tenant_id ?? "";

  useWorkspaceTypeGuard();

  const tenantType = currentTenant?.tenant_type ?? "ops";

  const allGovernanceNavItems = [
    { href: "/tenant-admin", label: t.tenantAdmin.shell.nav.overview, icon: Building2 },
    { href: "/tenant-admin/members", label: t.tenantAdmin.shell.nav.members, icon: Users },
    { href: "/tenant-admin/models", label: t.tenantAdmin.shell.nav.models, icon: Bot },
    { href: "/tenant-admin/tools", label: t.tenantAdmin.shell.nav.tools, icon: Wrench },
    { href: "/tenant-admin/skills", label: t.tenantAdmin.shell.nav.skills, icon: Boxes },
    { href: "/tenant-admin/agents", label: "智能体管理", icon: Bot },
    { href: "/tenant-admin/alerts", label: t.tenantAdmin.shell.nav.alerts, icon: ShieldAlert },
    { href: "/tenant-admin/im", label: "渠道管理", icon: Radio },
  ];

  // Filter nav items by workspace type
  const governanceNavItems = allGovernanceNavItems.filter((item) => hasRouteAccess(item.href, tenantType));

  const sidebarExtra = (
    <div className="space-y-1">
      <label htmlFor="tenant-switch" className="text-xs text-sidebar-foreground/70">
        {t.tenantAdmin.shell.currentTenant}
      </label>
      <select
        id="tenant-switch"
        aria-label={t.navMenu.switchTenant}
        value={currentTenantId}
        disabled={switching || tenants.length === 0}
        onChange={(event) => {
          const tenantId = event.target.value;
          if (!tenantId || tenantId === currentTenantId) {
            return;
          }
          switchTenant(tenantId);
        }}
        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
      >
        {tenants.length === 0 ? (
          <option value="">{t.tenantAdmin.shell.noTenants}</option>
        ) : (
          tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))
        )}
      </select>
    </div>
  );

  const bottomItems = [
    { href: "/workspace/overview", label: t.tenantAdmin.shell.enterWorkspace, icon: Building2 },
  ];

  return (
    <BackofficeShellLayout
      moduleTitle={t.tenantAdmin.shell.moduleTitle}
      moduleDescription={t.tenantAdmin.shell.moduleDescription}
      moduleIcon={ShieldCheck}
      navItems={governanceNavItems}
      bottomItems={bottomItems}
      sidebarExtra={sidebarExtra}
    >
      {children}
    </BackofficeShellLayout>
  );
}
