"use client";

import { BuildingIcon, PlusIcon, Trash2Icon, Edit2Icon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchAuthApi } from "@/core/api/auth-client";
import { useI18n } from "@/core/i18n/hooks";

import { CreateTenantDialog } from "./create-tenant-dialog";
import { DeactivateTenantDialog } from "./deactivate-tenant-dialog";
import { DeleteTenantDialog } from "./delete-tenant-dialog";
import { EditTenantDialog } from "./edit-tenant-dialog";
import { RestoreTenantDialog } from "./restore-tenant-dialog";

interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  tenant_type?: string;
  created_at: string;
  member_count: number;
  member_summaries?: Array<{
    user_id: string;
    user_name?: string | null;
    role: string;
  }>;
}

export default function AdminTenantsPage() {
  const { t } = useI18n();
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [selectedTenantForDeactivate, setSelectedTenantForDeactivate] = useState<{id: string; name: string} | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedTenantForDelete, setSelectedTenantForDelete] = useState<{id: string; name: string} | null>(null);

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [selectedTenantForRestore, setSelectedTenantForRestore] = useState<{id: string; name: string} | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [selectedTenantForEdit, setSelectedTenantForEdit] = useState<{
    id: string;
    name: string;
    slug: string;
    status: string;
    tenant_type?: string;
  } | null>(null);

  const loadTenants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAuthApi("/api/admin/tenants");
      if (!res.ok) {
        throw new Error(t.admin.tenants.loadError);
      }
      const data = await res.json();
      setTenants(data.tenants ?? []);
    } catch (err: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const openDeactivateTenant = (id: string, name: string) => {
    setSelectedTenantForDeactivate({ id, name });
    setDeactivateOpen(true);
  };

  const openRestoreTenant = (id: string, name: string) => {
    setSelectedTenantForRestore({ id, name });
    setRestoreOpen(true);
  };

  const openDeleteTenant = (id: string, name: string) => {
    setSelectedTenantForDelete({ id, name });
    setDeleteOpen(true);
  };

  const openEditTenant = (tenant: AdminTenant) => {
    setSelectedTenantForEdit({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      tenant_type: tenant.tenant_type,
    });
    setEditOpen(true);
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredTenants = tenants.filter((tenant) => {
    if (!normalizedSearch) return true;
    return (
      tenant.name.toLowerCase().includes(normalizedSearch) ||
      tenant.slug.toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div className="flex-1 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
            <BuildingIcon className="size-6 text-indigo-600" />
            {t.admin.tenants.title}
          </h1>
          <p className="text-zinc-500 text-sm mt-1">{t.admin.tenants.description}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
          <PlusIcon className="size-4" />
          {t.admin.tenants.createTenant}
        </Button>
      </div>

      <div className="relative w-full md:max-w-sm">
        <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t.admin.tenants.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
        />
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-900/50">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-zinc-500">{t.admin.tenants.loading}</div>
        ) : filteredTenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center">
            <BuildingIcon className="size-10 text-zinc-300 mb-4" />
            <h3 className="text-zinc-900 dark:text-zinc-100 font-medium mb-1">
              {t.admin.tenants.noMatch}
            </h3>
            <p className="text-zinc-500 text-sm max-w-sm">
              {t.admin.tenants.noMatchDescription}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-medium">
                <tr>
                  <th className="px-6 py-4 font-medium">{t.admin.tenants.columns.nameSlug}</th>
                  <th className="px-6 py-4 font-medium">{t.admin.tenants.columns.type}</th>
                  <th className="px-6 py-4 font-medium">{t.admin.tenants.columns.memberCount}</th>
                  <th className="px-6 py-4 font-medium">{t.admin.tenants.columns.status}</th>
                  <th className="px-6 py-4 font-medium text-right">{t.admin.tenants.columns.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredTenants.map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {tenant.name}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {tenant.slug}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        tenant.tenant_type === 'product' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' :
                        tenant.tenant_type === 'rd' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' :
                        tenant.tenant_type === 'ops' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {tenant.tenant_type === 'product' ? t.admin.tenants.types.product :
                         tenant.tenant_type === 'rd' ? t.admin.tenants.types.rd :
                         tenant.tenant_type === 'ops' ? t.admin.tenants.types.ops :
                         tenant.tenant_type || "未知"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center rounded px-1 py-0.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            {tenant.member_count} {t.admin.tenants.members}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[340px]">
                          <div className="space-y-1.5">
                            <div className="text-[11px] font-semibold">{t.admin.tenants.memberDetails}</div>
                            {tenant.member_summaries && tenant.member_summaries.length > 0 ? (
                              <ul className="space-y-1">
                                {tenant.member_summaries.map((member) => (
                                  <li key={`${tenant.id}-${member.user_id}`} className="flex items-center justify-between gap-3 text-[11px]">
                                    <span className="truncate">
                                      {member.user_name ?? member.user_id}
                                    </span>
                                    <span className="opacity-80">{member.role}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-[11px] opacity-80">{t.admin.tenants.noMemberDetails}</div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="px-6 py-4">
                      {tenant.status === "active" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-500">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                          {tenant.status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditTenant(tenant)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-500 dark:hover:bg-blue-900/20 px-2"
                      >
                        <Edit2Icon className="size-4 mr-1" />
                        {t.admin.tenants.actions.edit}
                      </Button>
                      {tenant.status === "inactive" ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openRestoreTenant(tenant.id, tenant.name)}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-500 dark:hover:bg-emerald-900/20 px-2"
                          >
                            {t.admin.tenants.actions.restore}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteTenant(tenant.id, tenant.name)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-900/20 px-2"
                          >
                            <Trash2Icon className="size-4 mr-1" />
                            {t.admin.tenants.actions.permanentDelete}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeactivateTenant(tenant.id, tenant.name)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-900/20 px-2"
                        >
                          <Trash2Icon className="size-4 mr-1" />
                          {t.admin.tenants.actions.deactivate}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateTenantDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={loadTenants}
      />
      
      <DeactivateTenantDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        tenantId={selectedTenantForDeactivate?.id}
        tenantName={selectedTenantForDeactivate?.name}
        onSuccess={loadTenants}
      />

      <RestoreTenantDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        tenantId={selectedTenantForRestore?.id}
        tenantName={selectedTenantForRestore?.name}
        onSuccess={loadTenants}
      />

      <DeleteTenantDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tenantId={selectedTenantForDelete?.id}
        tenantName={selectedTenantForDelete?.name}
        onSuccess={loadTenants}
      />

      <EditTenantDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        tenant={selectedTenantForEdit}
        onSuccess={loadTenants}
      />
    </div>
  );
}
