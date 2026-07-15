"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAuthApi } from "@/core/api/auth-client";
import { useI18n } from "@/core/i18n/hooks";

interface EditTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    tenant_type?: string;
  } | null;
  onSuccess: () => void;
}

export function EditTenantDialog({
  open,
  onOpenChange,
  tenant,
  onSuccess,
}: EditTenantDialogProps) {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("active");
  const [tenantType, setTenantType] = useState("ops");
  const [isCustomType, setIsCustomType] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    if (tenant) {
      setName(tenant.name);
      setSlug(tenant.slug);
      setStatus(tenant.status === "active" ? "active" : "inactive");
      const currentType = tenant.tenant_type || "ops";
      if (currentType !== "ops" && currentType !== "product" && currentType !== "rd") {
        setTenantType(currentType);
        setIsCustomType(true);
        setCustomTypeInput(currentType);
      } else {
        setTenantType(currentType);
        setIsCustomType(false);
        setCustomTypeInput("");
      }
    } else {
      setName("");
      setSlug("");
      setStatus("active");
      setTenantType("ops");
      setIsCustomType(false);
      setCustomTypeInput("");
    }
    setError(null);
  }, [tenant, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    
    setLoading(true);
    setError(null);

    const finalType = isCustomType ? customTypeInput.trim() : tenantType;
    if (isCustomType && !finalType) {
      setError(customEmptyError);
      setLoading(false);
      return;
    }

    try {
      const res = await fetchAuthApi(`/api/admin/tenants/${tenant.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          slug,
          status,
          tenant_type: finalType,
        }),
      });

      if (!res.ok) {
        let msg = t.admin.tenants.editDialog.editError;
        try {
          const data = await res.json();
          if (data.detail) msg = data.detail;
        } catch {}
        throw new Error(msg);
      }

      toast.success(t.admin.tenants.editDialog.editSuccess);
      onSuccess();
      onOpenChange(false);
    } catch (err: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t.admin.tenants.editDialog.title}</DialogTitle>
            <DialogDescription>{t.admin.tenants.editDialog.description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
                {error}
              </div>
            )}
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium">{t.admin.tenants.editDialog.nameLabel}</label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.admin.tenants.editDialog.namePlaceholder}
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="slug" className="text-sm font-medium">{t.admin.tenants.editDialog.slugLabel}</label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={t.admin.tenants.editDialog.slugPlaceholder}
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="status" className="text-sm font-medium">{t.admin.tenants.editDialog.statusLabel}</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status">
                  <SelectValue placeholder={t.admin.tenants.editDialog.statusPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t.admin.tenants.editDialog.statusActive}</SelectItem>
                  <SelectItem value="inactive">{t.admin.tenants.editDialog.statusInactive}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">{t.admin.tenants.editDialog.typeLabel}</label>
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
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t.admin.tenants.editDialog.cancel}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t.admin.tenants.editDialog.saving : t.admin.tenants.editDialog.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
