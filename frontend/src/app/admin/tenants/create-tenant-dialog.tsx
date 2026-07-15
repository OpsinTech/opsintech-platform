"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchAuthApi } from "@/core/api/auth-client";
import { useI18n } from "@/core/i18n/hooks";

type AdminUserOption = {
  id?: string;
  user_id?: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  status?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateTenantDialog({ open, onOpenChange, onSuccess }: Props) {
  const { t, locale } = useI18n();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [ownerUserName, setOwnerUserName] = useState("");
  const [tenantType, setTenantType] = useState("ops");
  const [isCustomType, setIsCustomType] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<AdminUserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  const customLabel =
    locale === "zh-CN"
      ? "自定义"
      : locale === "ja"
      ? "カスタム"
      : locale === "ko"
      ? "사용자 정의"
      : "Custom";

  const customEmptyError =
    locale === "zh-CN"
      ? "自定义类型不能为空"
      : locale === "ja"
      ? "カスタムタイプは空にできません"
      : locale === "ko"
      ? "사용자 정의 유형은 비워 둘 수 없습니다"
      : "Custom type cannot be empty";

  const customPlaceholder =
    locale === "zh-CN"
      ? "请输入自定义工作空间类型 (如: security)"
      : locale === "ja"
      ? "カスタムワークスペース类型を入力してください (例: security)"
      : locale === "ko"
      ? "사용자 정의 워크스페이스 유형을 입력하십시오 (예: security)"
      : "Please enter custom workspace type (e.g., security)";

  useEffect(() => {
    if (!showDropdown) {
      setUsers([]);
      setSearching(false);
      return;
    }
    
    setSearching(true);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    
    searchTimeout.current = setTimeout(() => {
      void (async () => {
        try {
          const url = new URL("/api/admin/users", window.location.origin);
          const keyword = searchTerm.trim();
          if (keyword) {
            url.searchParams.set("keyword", keyword);
          }
          const res = await fetchAuthApi(url.pathname + url.search);
          if (res.ok) {
            const data = await res.json();
            setUsers(data.users ?? []);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchTerm, showDropdown]);

  const selectableUsers = users.filter((u) => (u.role ?? "user") !== "admin");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t.admin.tenants.createDialog.nameRequired);
      return;
    }
    if (!ownerUserId.trim()) {
      setError(t.admin.tenants.createDialog.ownerRequired);
      return;
    }

    const finalType = isCustomType ? customTypeInput.trim() : tenantType;
    if (isCustomType && !finalType) {
      setError(customEmptyError);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const res = await fetchAuthApi("/api/admin/tenants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          owner_user_id: ownerUserId.trim(),
          owner_role: "tenant_admin",
          tenant_type: finalType,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? d.message ?? t.admin.tenants.createDialog.createError);
      }

      toast.success(t.admin.tenants.createDialog.createSuccess);
      onSuccess();
      onOpenChange(false);
      
      // reset
      setName("");
      setSlug("");
      setOwnerUserId("");
      setOwnerUserName("");
      setTenantType("ops");
      setIsCustomType(false);
      setCustomTypeInput("");
      setSearchTerm("");
    } catch (err: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t.admin.tenants.createDialog.title}</DialogTitle>
          <DialogDescription>
            {t.admin.tenants.createDialog.description}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-sm bg-red-50 text-red-600 rounded-md border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t.admin.tenants.createDialog.nameLabel} <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.admin.tenants.createDialog.namePlaceholder}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t.admin.tenants.createDialog.slugLabel}
              <span className="text-zinc-400 font-normal">({t.admin.tenants.createDialog.reselect})</span>
            </label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t.admin.tenants.createDialog.slugPlaceholder}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t.admin.tenants.createDialog.typeLabel}
            </label>
            <div className="flex gap-2">
              {(['ops', 'product', 'rd'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setTenantType(type);
                    setIsCustomType(false);
                  }}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
                    !isCustomType && tenantType === type
                      ? type === 'product'
                        ? 'bg-violet-50 border-violet-300 text-violet-700 dark:bg-violet-900/20 dark:border-violet-700 dark:text-violet-400'
                        : type === 'rd'
                        ? 'bg-cyan-50 border-cyan-300 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-700 dark:text-cyan-400'
                        : 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-400'
                      : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  {type === 'product' ? t.admin.tenants.types.product :
                   type === 'rd' ? t.admin.tenants.types.rd :
                   t.admin.tenants.types.ops}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsCustomType(true)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
                  isCustomType
                    ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400'
                    : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`}
              >
                {customLabel}
              </button>
            </div>
            {isCustomType && (
              <Input
                value={customTypeInput}
                onChange={(e) => setCustomTypeInput(e.target.value)}
                placeholder={customPlaceholder}
                className="mt-2"
              />
            )}
            <p className="text-xs text-zinc-500">
              {t.admin.tenants.createDialog.typeDescription}
            </p>
          </div>

          <div className="space-y-2 relative">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t.admin.tenants.createDialog.ownerLabel} <span className="text-red-500">*</span>
            </label>
            
            {ownerUserId ? (
              <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/50">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium">{ownerUserName ?? ownerUserId}</span>
                  <span className="text-xs text-muted-foreground truncate">{ownerUserId}</span>
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    setOwnerUserId("");
                    setOwnerUserName("");
                    setSearchTerm("");
                  }}
                >
                  {t.admin.tenants.createDialog.reselect}
                </Button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative relative-group">
                  <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onClick={() => setShowDropdown(true)}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                    }}
                    placeholder={t.admin.tenants.createDialog.ownerPlaceholder}
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
                
                {showDropdown && (
                  <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-80">
                    {searching ? (
                      <div className="p-3 text-sm text-center text-muted-foreground">{t.admin.tenants.createDialog.searching}</div>
                    ) : selectableUsers.length === 0 ? (
                      <div className="p-3 text-sm text-center text-muted-foreground">{t.admin.tenants.createDialog.noUsers}</div>
                    ) : (
                      <div className="py-1">
                        {selectableUsers.map((u, index) => (
                          <div 
                            key={u.id ?? u.user_id ?? `user-${index}`} 
                            className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-accent hover:text-accent-foreground text-sm"
                            onClick={() => {
                              const selectedUserId = (u.user_id ?? u.id ?? "").trim();
                              const selectedName =
                                u.name ?? u.email ?? u.user_id ?? u.id ?? t.admin.tenants.createDialog.unnamedUser;
                              if (!selectedUserId) {
                                return;
                              }
                              setOwnerUserId(selectedUserId);
                              setOwnerUserName(selectedName);
                              setShowDropdown(false);
                            }}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium">{u.name ?? u.email ?? t.admin.tenants.createDialog.unnamedUser}</span>
                              <span className="text-xs text-muted-foreground truncate">{u.user_id ?? u.id} · {(u.role ?? "user")}</span>
                            </div>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 w-12 px-0 text-xs shrink-0 bg-transparent"
                            >
                              {t.admin.tenants.createDialog.select}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t.admin.tenants.createDialog.initialRole}
            </label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300">
              tenant_admin
            </div>
            <p className="text-xs text-zinc-500">
              {t.admin.tenants.createDialog.initialRoleDescription}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t.admin.tenants.createDialog.cancel}
            </Button>
            <Button type="submit" disabled={isLoading} className="min-w-[100px]">
              {isLoading ? t.admin.tenants.createDialog.creating : t.admin.tenants.createDialog.confirm}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
