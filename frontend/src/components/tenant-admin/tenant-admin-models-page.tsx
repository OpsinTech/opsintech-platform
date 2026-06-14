"use client";

import { SearchIcon } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/core/i18n/hooks";
import { useAvailableModels, useUpdateTenantModel } from "@/core/models/hooks";

export function TenantAdminModelsPage() {
  const { t } = useI18n();
  const { models, isLoading, error } = useAvailableModels();
  const { mutateAsync: updateTenantModel } = useUpdateTenantModel();
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "platform" | "tenant">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");

  const tenantModels = useMemo(
    () => models.filter((item) => item.scope === "tenant"),
    [models],
  );

  const filteredModels = useMemo(() => {
    return tenantModels.filter((model) => {
      const matchesSearch = searchTerm === "" || 
        model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (model.display_name && model.display_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        model.model.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSource = sourceFilter === "all" || 
        (sourceFilter === "platform" && model.source !== "tenant_shared") ||
        (sourceFilter === "tenant" && model.source === "tenant_shared");
      
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "enabled" && model.enabled !== false) ||
        (statusFilter === "disabled" && model.enabled === false);
      
      return matchesSearch && matchesSource && matchesStatus;
    });
  }, [tenantModels, searchTerm, sourceFilter, statusFilter]);

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      await updateTenantModel({ name, input: { enabled } });
      toast.success(t.tenantAdmin.models.updateSuccess);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.tenantAdmin.models.updateError);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t.tenantAdmin.models.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.tenantAdmin.models.description}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative w-full max-w-sm">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t.tenantAdmin.models.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 max-w-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <select 
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              <option value="all">{t.tenantAdmin.models.sourceAll}</option>
              <option value="platform">{t.tenantAdmin.models.sourcePlatform}</option>
              <option value="tenant">{t.tenantAdmin.models.sourceTenant}</option>
            </select>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              <option value="all">{t.tenantAdmin.models.statusAll}</option>
              <option value="enabled">{t.tenantAdmin.models.statusEnabled}</option>
              <option value="disabled">{t.tenantAdmin.models.statusDisabled}</option>
            </select>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {t.tenantAdmin.models.count(filteredModels.length)}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t.tenantAdmin.models.columns.name}</th>
              <th className="px-4 py-2 font-medium">{t.tenantAdmin.models.columns.providerModel}</th>
              <th className="px-4 py-2 font-medium">{t.tenantAdmin.models.columns.source}</th>
              <th className="px-4 py-2 text-right font-medium">{t.tenantAdmin.models.columns.enabled}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                  {t.common.loading}
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td className="px-4 py-6 text-destructive" colSpan={4}>
                  {error.message}
                </td>
              </tr>
            ) : filteredModels.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                  {searchTerm || sourceFilter !== "all" || statusFilter !== "all" ? t.tenantAdmin.models.emptyFiltered : t.tenantAdmin.models.empty}
                </td>
              </tr>
            ) : (
              filteredModels.map((model) => (
                <tr key={model.name} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{model.display_name || model.name}</div>
                    <div className="text-xs text-muted-foreground">{model.name}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{model.model}</td>
                  <td className="px-4 py-3">
                    {model.source === "tenant_shared" ? t.tenantAdmin.models.sourceTenant : t.tenantAdmin.models.sourcePlatform}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Switch
                      checked={model.enabled !== false}
                      onCheckedChange={(checked) => void handleToggle(model.name, checked)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
