"use client";

import { PlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminAnnouncementDetail,
  useAdminAnnouncementList,
  useAdminTenantTargets,
  useArchiveAdminAnnouncement,
  useCreateAdminAnnouncement,
  useDeleteAdminAnnouncement,
  usePublishAdminAnnouncement,
  useUpdateAdminAnnouncement,
} from "@/core/announcements";
import { useI18n } from "@/core/i18n/hooks";

const TYPE_OPTIONS = ["general", "model_change", "tool_change", "skill_change", "maintenance", "security"];
const SEVERITY_OPTIONS = ["info", "warning", "critical"];
const SCOPE_OPTIONS = ["platform_all", "tenant_scoped", "role_scoped", "tenant_role_scoped"];
const STATUS_OPTIONS = ["draft", "scheduled", "published", "archived", "expired"];

type FormState = {
  title: string;
  content: string;
  type: string;
  severity: string;
  scope: string;
  targetRolesText: string;
  targetTenantIds: string[];
  publishAt: string;
  expireAt: string;
  pinnedUntil: string;
  status: string;
};

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function normalizeRoles(input: string): string[] {
  const aliasMap: Record<string, string> = {
    owner: "tenant_admin",
    admin: "tenant_admin",
    member: "tenant_member",
  };

  return Array.from(
    new Set(
      input
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .map((item) => aliasMap[item] ?? item)
        .filter(Boolean),
    ),
  );
}

function buildDefaultForm(): FormState {
  const now = new Date();
  const expire = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    title: "",
    content: "",
    type: "general",
    severity: "info",
    scope: "platform_all",
    targetRolesText: "",
    targetTenantIds: [],
    publishAt: toDateTimeLocal(now.toISOString()),
    expireAt: toDateTimeLocal(expire.toISOString()),
    pinnedUntil: "",
    status: "draft",
  };
}

function formatScope(scope: string, scopeLabels: { platformAll: string; tenantScoped: string; roleScoped: string; tenantRoleScoped: string }): string {
  if (scope === "platform_all") return scopeLabels.platformAll;
  if (scope === "tenant_scoped") return scopeLabels.tenantScoped;
  if (scope === "role_scoped") return scopeLabels.roleScoped;
  if (scope === "tenant_role_scoped") return scopeLabels.tenantRoleScoped;
  return scope;
}

export default function AdminAnnouncementsPage() {
  const { t } = useI18n();
  const { announcements, isLoading, refetch } = useAdminAnnouncementList();
  const { tenants } = useAdminTenantTargets();

  const createMutation = useCreateAdminAnnouncement();
  const updateMutation = useUpdateAdminAnnouncement();
  const publishMutation = usePublishAdminAnnouncement();
  const archiveMutation = useArchiveAdminAnnouncement();
  const deleteMutation = useDeleteAdminAnnouncement();

  const [form, setForm] = useState<FormState>(buildDefaultForm);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  // 过滤状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const { announcement: selectedAnnouncement, isLoading: detailLoading } = useAdminAnnouncementDetail({
    announcementId: selectedId,
    enabled: selectedId !== null,
  });

  useEffect(() => {
    if (!selectedAnnouncement) return;
    if (editingId !== selectedAnnouncement.id) return;

    setForm({
      title: selectedAnnouncement.title,
      content: selectedAnnouncement.content,
      type: selectedAnnouncement.type,
      severity: selectedAnnouncement.severity,
      scope: selectedAnnouncement.scope,
      targetRolesText: (selectedAnnouncement.target_roles ?? []).join(", "),
      targetTenantIds: selectedAnnouncement.target_tenant_ids ?? [],
      publishAt: toDateTimeLocal(selectedAnnouncement.publish_at),
      expireAt: toDateTimeLocal(selectedAnnouncement.expire_at),
      pinnedUntil: selectedAnnouncement.pinned_until ? toDateTimeLocal(selectedAnnouncement.pinned_until) : "",
      status: selectedAnnouncement.status,
    });
  }, [editingId, selectedAnnouncement]);

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    publishMutation.isPending ||
    archiveMutation.isPending ||
    deleteMutation.isPending;

  const requiresTenant = useMemo(
    () => form.scope === "tenant_scoped" || form.scope === "tenant_role_scoped",
    [form.scope],
  );
  const requiresRole = useMemo(
    () => form.scope === "role_scoped" || form.scope === "tenant_role_scoped",
    [form.scope],
  );

  const resetForm = () => {
    setForm(buildDefaultForm());
    setEditingId(null);
    setCreateDialogOpen(false);
  };

  // 过滤通知列表
  const filteredAnnouncements = useMemo(() => {
    if (!announcements) return [];
    
    return announcements.filter((item) => {
      // 关键词搜索
      if (searchKeyword.trim()) {
        const keyword = searchKeyword.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(keyword);
        const matchesContent = item.content.toLowerCase().includes(keyword);
        if (!matchesTitle && !matchesContent) return false;
      }
      
      // 状态筛选
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      
      // 类型筛选
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      
      // 严重等级筛选
      if (severityFilter !== "all" && item.severity !== severityFilter) return false;
      
      return true;
    });
  }, [announcements, searchKeyword, statusFilter, typeFilter, severityFilter]);

  // 重置过滤器
  const resetFilters = () => {
    setSearchKeyword("");
    setStatusFilter("all");
    setTypeFilter("all");
    setSeverityFilter("all");
  };

  const validateForm = (): string | null => {
    if (!form.title.trim()) return t.admin.announcements.validation.titleRequired;
    if (!form.content.trim()) return t.admin.announcements.validation.contentRequired;

    const publishDate = new Date(form.publishAt);
    const expireDate = new Date(form.expireAt);
    if (Number.isNaN(publishDate.getTime()) || Number.isNaN(expireDate.getTime())) {
      return t.admin.announcements.validation.invalidDate;
    }
    if (publishDate >= expireDate) return t.admin.announcements.validation.publishBeforeExpire;

    const roles = normalizeRoles(form.targetRolesText);
    if (requiresRole && roles.length === 0) return t.admin.announcements.validation.rolesRequired;
    if (requiresTenant && form.targetTenantIds.length === 0) return t.admin.announcements.validation.tenantsRequired;

    return null;
  };

  const submitForm = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    setError(null);

    const validation = validateForm();
    if (validation) {
      setError(validation);
      return;
    }

    const payload = {
      title: form.title.trim(),
      content: form.content,
      type: form.type,
      severity: form.severity,
      scope: form.scope,
      target_roles: normalizeRoles(form.targetRolesText),
      target_tenant_ids: form.targetTenantIds,
      publish_at: new Date(form.publishAt).toISOString(),
      expire_at: new Date(form.expireAt).toISOString(),
      pinned_until: form.pinnedUntil ? new Date(form.pinnedUntil).toISOString() : null,
      status: form.status,
    };

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ announcementId: editingId, input: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      resetForm();
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.announcements.saveError);
    }
  };

  const onQuickAction = async (id: number, action: "publish" | "archive" | "delete") => {
    setError(null);
    try {
      if (action === "publish") {
        await publishMutation.mutateAsync(id);
      }
      if (action === "archive") {
        await archiveMutation.mutateAsync(id);
      }
      if (action === "delete") {
        await deleteMutation.mutateAsync(id);
      }
      if (selectedId === id && action === "delete") {
        setSelectedId(null);
        if (editingId === id) {
          resetForm();
        }
      }
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.announcements.operationError);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t.admin.announcements.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.admin.announcements.description}</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          {t.admin.announcements.create}
        </Button>
      </section>

      {/* 过滤工具栏 */}
      <section className="rounded-lg border bg-white dark:bg-zinc-900 p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            {/* 搜索框 */}
            <div className="relative">
              <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t.admin.announcements.filter.searchPlaceholder}
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="h-9 w-full sm:w-64 rounded-md border border-zinc-200 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 状态筛选 */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="all">{t.admin.announcements.filter.allStatuses}</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {/* 类型筛选 */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="all">{t.admin.announcements.filter.allTypes}</option>
              {TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {/* 严重等级筛选 */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="all">{t.admin.announcements.filter.allSeverities}</option>
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {/* 重置按钮 */}
          {(searchKeyword || statusFilter !== "all" || typeFilter !== "all" || severityFilter !== "all") && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="h-9"
            >
              {t.admin.announcements.filter.reset}
            </Button>
          )}
        </div>

        {/* 筛选结果统计 */}
        {(searchKeyword || statusFilter !== "all" || typeFilter !== "all" || severityFilter !== "all") && (
          <div className="mt-3 text-sm text-muted-foreground">
            {t.admin.announcements.filter.found(filteredAnnouncements.length)}
            {searchKeyword && (
              <span className="ml-2">{t.admin.announcements.filter.keyword(searchKeyword)}</span>
            )}
            {statusFilter !== "all" && (
              <span className="ml-2">{t.admin.announcements.filter.status(statusFilter)}</span>
            )}
            {typeFilter !== "all" && (
              <span className="ml-2">{t.admin.announcements.filter.type(typeFilter)}</span>
            )}
            {severityFilter !== "all" && (
              <span className="ml-2">{t.admin.announcements.filter.severity(severityFilter)}</span>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-white dark:bg-zinc-900 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-900 dark:border-zinc-100 mx-auto mb-2"></div>
            {t.admin.announcements.loading}
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
             <div className="text-4xl mb-2">🔍</div>
             <div className="text-lg font-medium mb-1">
               {announcements.length === 0 ? t.admin.announcements.noAnnouncements : t.admin.announcements.noMatch}
             </div>
             <div className="text-sm">
               {announcements.length === 0 
                 ? t.admin.announcements.noAnnouncementsHint
                 : t.admin.announcements.noMatchHint
               }
             </div>
           </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredAnnouncements.map((item) => (
              <div key={item.id} className="p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">{item.title}</div>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        item.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-500' :
                        item.status === 'draft' ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' :
                        item.status === 'scheduled' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-500' :
                        'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:bg-orange-500'
                      }`}>
                        {item.status}
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        item.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-500' :
                        item.severity === 'warning' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-500'
                      }`}>
                        {item.severity}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-2">
                      <span>{t.admin.announcements.listLabels.type}: {item.type}</span>
                      <span>{t.admin.announcements.listLabels.scope}: {formatScope(item.scope, t.admin.announcements.scopeLabels)}</span>
                      <span>{t.admin.announcements.listLabels.publishAt}: {new Date(item.publish_at).toLocaleString()}</span>
                      <span>{t.admin.announcements.listLabels.expireAt}: {new Date(item.expire_at).toLocaleString()}</span>
                    </div>

                    {selectedId === item.id && (
                      <div className="mt-4 p-4 rounded-lg bg-muted/40 border border-muted">
                        {detailLoading ? (
                          <div className="text-muted-foreground">{t.admin.announcements.detail.loading}</div>
                        ) : selectedAnnouncement?.id === item.id ? (
                          <div className="space-y-3">
                            <div className="whitespace-pre-wrap text-sm leading-relaxed">{selectedAnnouncement.content}</div>
                            <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                              <div>{t.admin.announcements.detail.targetRoles}: {(selectedAnnouncement.target_roles ?? []).join(", ") || t.admin.announcements.detail.none}</div>
                              <div>{t.admin.announcements.detail.targetTenants}: {(selectedAnnouncement.target_tenant_ids ?? []).join(", ") || t.admin.announcements.detail.none}</div>
                              <div>{t.admin.announcements.detail.pinnedUntil}: {selectedAnnouncement.pinned_until ? new Date(selectedAnnouncement.pinned_until).toLocaleString() : t.admin.announcements.detail.notSet}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-muted-foreground">{t.admin.announcements.detail.noDetails}</div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
                    >
                      {selectedId === item.id ? t.admin.announcements.collapse : t.admin.announcements.details}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedId(item.id);
                        setEditingId(item.id);
                        setCreateDialogOpen(true);
                      }}
                    >
                      {t.admin.announcements.edit}
                    </Button>
                    {item.status === 'draft' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onQuickAction(item.id, "publish")}
                        disabled={isMutating}
                      >
                        {t.admin.announcements.publish}
                      </Button>
                    )}
                    {item.status === 'published' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onQuickAction(item.id, "archive")}
                        disabled={isMutating}
                      >
                        {t.admin.announcements.archive}
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onQuickAction(item.id, "delete")}
                      disabled={isMutating}
                    >
                      {t.common.delete}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.admin.announcements.createDialog.title}</DialogTitle>
            <DialogDescription>
              {t.admin.announcements.createDialog.description}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-6 py-4" onSubmit={submitForm}>
            <div className="grid gap-2">
              <label className="text-sm font-medium">{t.admin.announcements.form.title}</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={t.admin.announcements.form.title}
                className="w-full"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">{t.admin.announcements.form.content}</label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder={t.admin.announcements.form.content}
                className="min-h-32 w-full"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="grid gap-3">
                <label className="text-sm font-medium">{t.admin.announcements.form.type}</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3">
                <label className="text-sm font-medium">{t.admin.announcements.form.severity}</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm((prev) => ({ ...prev, severity: e.target.value }))}
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {SEVERITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3">
                <label className="text-sm font-medium">{t.admin.announcements.form.status}</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="grid gap-3">
                <label className="text-sm font-medium">{t.admin.announcements.form.scope}</label>
                <select
                  value={form.scope}
                  onChange={(e) => setForm((prev) => ({ ...prev, scope: e.target.value }))}
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {SCOPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatScope(option, t.admin.announcements.scopeLabels)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3">
                <label className="text-sm font-medium">{t.admin.announcements.form.targetRoles}</label>
                <Input
                  value={form.targetRolesText}
                  onChange={(e) => setForm((prev) => ({ ...prev, targetRolesText: e.target.value }))}
                  placeholder={t.admin.announcements.form.targetRolesPlaceholder}
                  className="w-full h-10"
                />
              </div>
            </div>

            <div className="rounded border p-4">
              <label className="text-sm font-medium">{t.admin.announcements.form.targetTenants}</label>
              <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto md:grid-cols-2">
                {tenants.map((tenant) => {
                  const checked = form.targetTenantIds.includes(tenant.id);
                  return (
                    <label key={tenant.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setForm((prev) => ({
                            ...prev,
                            targetTenantIds: e.target.checked
                              ? [...prev.targetTenantIds, tenant.id]
                              : prev.targetTenantIds.filter((id) => id !== tenant.id),
                          }));
                        }}
                      />
                      <span>{tenant.name}</span>
                      <span className="text-xs text-muted-foreground">{tenant.id}</span>
                    </label>
                  );
                })}
                {tenants.length === 0 && <div className="text-xs text-muted-foreground">{t.admin.announcements.form.noTenantsAvailable}</div>}
              </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <div className="grid gap-3">
                <label className="text-sm font-medium">{t.admin.announcements.form.publishAt}</label>
                <input
                  type="datetime-local"
                  value={form.publishAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, publishAt: e.target.value }))}
                  className="h-11 w-full min-w-[200px] rounded-md border border-zinc-200 bg-white px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
                />
              </div>

              <div className="grid gap-3">
                <label className="text-sm font-medium">{t.admin.announcements.form.expireAt}</label>
                <input
                  type="datetime-local"
                  value={form.expireAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, expireAt: e.target.value }))}
                  className="h-11 w-full min-w-[200px] rounded-md border border-zinc-200 bg-white px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
                />
              </div>
            </div>

            <div className="grid gap-3 md:w-1/2">
              <label className="text-sm font-medium">{t.admin.announcements.form.pinnedUntil}</label>
              <input
                type="datetime-local"
                value={form.pinnedUntil}
                onChange={(e) => setForm((prev) => ({ ...prev, pinnedUntil: e.target.value }))}
                className="h-11 w-full min-w-[200px] rounded-md border border-zinc-200 bg-white px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                {t.admin.announcements.form.cancel}
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating ? t.admin.announcements.creating : (editingId ? t.admin.announcements.form.submitUpdate : t.admin.announcements.form.submitCreate)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
