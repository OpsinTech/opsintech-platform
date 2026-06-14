"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, CircleCheck, CircleX, Loader2, MoreHorizontal, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fetchAuthApi } from "@/core/api/auth-client";
import { useI18n } from "@/core/i18n/hooks";
import { testModelConnection } from "@/core/models/api";
import { PROVIDER_TEMPLATES, getProviderById } from "@/core/models/provider-templates";

type GlobalModel = {
  name: string;
  display_name?: string | null;
  model: string;
  use?: string | null;
  api_key?: string | null;
  base_url?: string | null;
  description?: string | null;
  supports_thinking?: boolean;
  supports_reasoning_effort?: boolean;
  supports_vision?: boolean;
  supports_text2image?: boolean;
  use_responses_api?: boolean | null;
  output_version?: string | null;
  max_tokens?: number | null;
  enabled?: boolean;
  verify_ssl?: boolean;
  model_type?: string | null;
};

const MODEL_TYPES: Record<string, { thinking: boolean; reasoning: boolean; vision: boolean; text2image: boolean }> = {
  chat: { thinking: true, reasoning: false, vision: false, text2image: false },
  code: { thinking: false, reasoning: false, vision: false, text2image: false },
  reasoning: { thinking: true, reasoning: true, vision: false, text2image: false },
  vision: { thinking: false, reasoning: false, vision: true, text2image: false },
  text2image: { thinking: false, reasoning: false, vision: false, text2image: true },
  multimodal: { thinking: true, reasoning: false, vision: true, text2image: false },
};

type AdminTenant = {
  id: string;
  name: string;
};

function useAdminTenants() {
  return useQuery<{ tenants: AdminTenant[] }>({
    queryKey: ["admin", "tenants", "list"],
    queryFn: async () => {
      const res = await fetchAuthApi("/api/admin/tenants");
      if (!res.ok) {
        throw new Error("Failed to load tenants");
      }
      const data = (await res.json()) as { tenants?: AdminTenant[] };
      return { tenants: data.tenants ?? [] };
    },
  });
}

function useGlobalModels() {
  return useQuery<{ models: GlobalModel[] }>({
    queryKey: ["admin", "models", "global"],
    queryFn: async () => {
      const res = await fetchAuthApi("/api/admin/models/global");
      if (!res.ok) {
        throw new Error("Failed to load global models");
      }
      const data = (await res.json()) as { models?: GlobalModel[] };
      return { models: data.models ?? [] };
    },
  });
}

function useAssignedTenantsByModel(tenants: AdminTenant[] | undefined) {
  return useQuery<{
    byModelTenantIds: Record<string, string[]>;
    byModelTenantNames: Record<string, string[]>;
  }>({
    queryKey: ["admin", "models", "global", "assigned-matrix", (tenants ?? []).map((t) => t.id).join("|")],
    enabled: Boolean(tenants && tenants.length > 0),
    queryFn: async () => {
      const byModelTenantIds = new Map<string, Set<string>>();
      const byModelTenantNames = new Map<string, Set<string>>();

      await Promise.all(
        (tenants ?? []).map(async (tenant) => {
          const res = await fetchAuthApi(`/api/admin/tenants/${tenant.id}/models/assigned`);
          if (!res.ok) return;
          const data = (await res.json()) as { models?: Array<{ name: string }> };
          for (const model of data.models ?? []) {
            if (!byModelTenantIds.has(model.name)) {
              byModelTenantIds.set(model.name, new Set<string>());
            }
            if (!byModelTenantNames.has(model.name)) {
              byModelTenantNames.set(model.name, new Set<string>());
            }
            byModelTenantIds.get(model.name)?.add(tenant.id);
            byModelTenantNames.get(model.name)?.add(tenant.name);
          }
        }),
      );

      return {
        byModelTenantIds: Object.fromEntries(
          Array.from(byModelTenantIds.entries()).map(([name, ids]) => [name, Array.from(ids)]),
        ),
        byModelTenantNames: Object.fromEntries(
          Array.from(byModelTenantNames.entries()).map(([name, names]) => [name, Array.from(names)]),
        ),
      };
    },
  });
}

export default function AdminModelsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [creatingDialogOpen, setCreatingDialogOpen] = useState(false);
  const [editingDialogOpen, setEditingDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  const [creatingGlobal, setCreatingGlobal] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [deletingGlobalName, setDeletingGlobalName] = useState<string | null>(null);
  const [togglingGlobalName, setTogglingGlobalName] = useState<string | null>(null);
  const [createAdvancedOpen, setCreateAdvancedOpen] = useState(false);
  const [editAdvancedOpen, setEditAdvancedOpen] = useState(false);

  const [isCreateTesting, setIsCreateTesting] = useState(false);
  const [createTestResult, setCreateTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isEditTesting, setIsEditTesting] = useState(false);
  const [editTestResult, setEditTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [deletingModelName, setDeletingModelName] = useState("");
  const [editingModelName, setEditingModelName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [assigningModelName, setAssigningModelName] = useState("");
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const creatingGlobalRef = useRef(false);

  const [globalName, setGlobalName] = useState("");
  const [globalNameEdited, setGlobalNameEdited] = useState(false);
  const [globalProviderModel, setGlobalProviderModel] = useState("");
  const [globalUse, setGlobalUse] = useState("langchain_openai.ChatOpenAI");
  const [globalDisplayName, setGlobalDisplayName] = useState("");
  const [globalDescription, setGlobalDescription] = useState("");
  const [globalApiKey, setGlobalApiKey] = useState("");
  const [globalBaseUrl, setGlobalBaseUrl] = useState("");
  const [globalMaxTokens, setGlobalMaxTokens] = useState("");
  const [globalUseResponsesApi, setGlobalUseResponsesApi] = useState(false);
  const [globalOutputVersion, setGlobalOutputVersion] = useState("");
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [globalSupportsThinking, setGlobalSupportsThinking] = useState(false);
  const [globalSupportsReasoningEffort, setGlobalSupportsReasoningEffort] = useState(false);
  const [globalSupportsVision, setGlobalSupportsVision] = useState(false);
  const [globalSupportsText2Image, setGlobalSupportsText2Image] = useState(false);
  const [globalProviderId, setGlobalProviderId] = useState("");
  const [globalVerifySsl, setGlobalVerifySsl] = useState(false);
  const [globalModelType, setGlobalModelType] = useState("chat");

  const [editDisplayName, setEditDisplayName] = useState("");
  const [editProviderModel, setEditProviderModel] = useState("");
  const [editUse, setEditUse] = useState("langchain_openai.ChatOpenAI");
  const [editDescription, setEditDescription] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);
  const [editApiKey, setEditApiKey] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editMaxTokens, setEditMaxTokens] = useState("");
  const [editUseResponsesApi, setEditUseResponsesApi] = useState(false);
  const [editOutputVersion, setEditOutputVersion] = useState("");
  const [editSupportsThinking, setEditSupportsThinking] = useState(false);
  const [editSupportsReasoningEffort, setEditSupportsReasoningEffort] = useState(false);
  const [editSupportsVision, setEditSupportsVision] = useState(false);
  const [editSupportsText2Image, setEditSupportsText2Image] = useState(false);
  const [editProviderId, setEditProviderId] = useState("");
  const [editVerifySsl, setEditVerifySsl] = useState(false);
  const [editModelType, setEditModelType] = useState("chat");

  const { data: tenantData } = useAdminTenants();
  const {
    data: globalData,
    isLoading: globalLoading,
    error: globalLoadError,
  } = useGlobalModels();
  const {
    data: assignedMatrix,
    isLoading: assignedMatrixLoading,
  } = useAssignedTenantsByModel(tenantData?.tenants);

  const globalModels = Array.from(
    new Map((globalData?.models ?? []).map((m) => [m.name, m])).values(),
  );
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredGlobalModels = globalModels.filter((m) => {
    if (!normalizedKeyword) return true;
    return (
      (m.name ?? "").toLowerCase().includes(normalizedKeyword)
      || (m.display_name ?? "").toLowerCase().includes(normalizedKeyword)
      || (m.model ?? "").toLowerCase().includes(normalizedKeyword)
    );
  });
  const existingModelNames = new Set(globalModels.map((m) => m.name.toLowerCase()));
  const nameRegex = /^[a-z0-9][a-z0-9._-]{1,62}$/;
  const normalizedGlobalName = globalName.trim();
  const deriveGlobalModelId = (modelName: string) => {
    const normalized = modelName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[^a-z0-9]+/, "")
      .replace(/[-._]{2,}/g, "-")
      .replace(/[-._]+$/, "")
      .slice(0, 63);
    return normalized.length >= 2 ? normalized : "";
  };
  const autoGeneratedGlobalName = deriveGlobalModelId(globalProviderModel);
  const isGlobalNameValid = nameRegex.test(normalizedGlobalName);
  const isGlobalNameConflict = normalizedGlobalName.length > 0
    ? existingModelNames.has(normalizedGlobalName.toLowerCase())
    : false;

  useEffect(() => {
    if (!globalNameEdited) {
      setGlobalName(autoGeneratedGlobalName);
    }
  }, [autoGeneratedGlobalName, globalNameEdited]);

  const parseError = async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => ({}));
    return (data as { detail?: string; message?: string }).detail
      ?? (data as { detail?: string; message?: string }).message
      ?? fallback;
  };

  const refreshModelQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "models", "global"] });
    void queryClient.invalidateQueries({ queryKey: ["availableModels"] });
    void queryClient.invalidateQueries({ queryKey: ["tenantModels"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "models", "global", "assigned-matrix"] });
  };

  const applyProviderTemplate = (providerId: string, isEdit: boolean) => {
    const template = getProviderById(providerId);
    if (!template) return;
    const mt = template.defaultModelType || "chat";
    if (isEdit) {
      setEditUse(template.use);
      setEditBaseUrl(template.baseUrl);
      setEditSupportsThinking(template.defaultSupportsThinking);
      setEditSupportsReasoningEffort(template.defaultSupportsReasoningEffort);
      setEditSupportsVision(template.defaultSupportsVision);
      setEditSupportsText2Image(Boolean(template.defaultSupportsText2Image));
      setEditModelType(mt);
      setEditProviderId(providerId);
    } else {
      setGlobalUse(template.use);
      setGlobalBaseUrl(template.baseUrl);
      setGlobalSupportsThinking(template.defaultSupportsThinking);
      setGlobalSupportsReasoningEffort(template.defaultSupportsReasoningEffort);
      setGlobalSupportsVision(template.defaultSupportsVision);
      setGlobalSupportsText2Image(Boolean(template.defaultSupportsText2Image));
      setGlobalModelType(mt);
      setGlobalProviderId(providerId);
    }
  };

  const handleCreateGlobalModel = async () => {
    if (creatingGlobalRef.current) {
      return;
    }
    if (!normalizedGlobalName || !globalProviderModel.trim() || !globalUse.trim()) {
      toast.error(t.admin.models.validation.fillRequired);
      return;
    }
    if (!isGlobalNameValid) {
      toast.error(t.admin.models.validation.nameInvalid);
      return;
    }
    if (isGlobalNameConflict) {
      toast.error(t.admin.models.validation.nameExists);
      return;
    }
    const parsedMaxTokens = globalMaxTokens.trim() ? Number(globalMaxTokens.trim()) : undefined;
    if (parsedMaxTokens !== undefined && (!Number.isFinite(parsedMaxTokens) || parsedMaxTokens <= 0)) {
      toast.error(t.admin.models.validation.maxTokensInvalid);
      return;
    }
    try {
      creatingGlobalRef.current = true;
      setCreatingGlobal(true);
      const res = await fetchAuthApi("/api/admin/models/global", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: normalizedGlobalName,
          model: globalProviderModel.trim(),
          use: globalUse.trim(),
          display_name: globalDisplayName.trim() || undefined,
          description: globalDescription.trim() || undefined,
          api_key: globalApiKey.trim() || undefined,
          base_url: globalBaseUrl.trim() || undefined,
          max_tokens: parsedMaxTokens,
          use_responses_api: globalUseResponsesApi,
          output_version: globalOutputVersion.trim() || undefined,
          supports_thinking: globalSupportsThinking,
          supports_reasoning_effort: globalSupportsReasoningEffort,
          supports_vision: globalSupportsVision,
          supports_text2image: globalSupportsText2Image,
          enabled: globalEnabled,
          verify_ssl: globalVerifySsl,
          model_type: globalModelType || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(await parseError(res, t.admin.models.createFailed));
      }
      toast.success(t.admin.models.createSuccess);
      setCreateTestResult(null);
      setGlobalName("");
      setGlobalNameEdited(false);
      setGlobalProviderModel("");
      setGlobalUse("langchain_openai.ChatOpenAI");
      setGlobalDisplayName("");
      setGlobalDescription("");
      setGlobalApiKey("");
      setGlobalBaseUrl("");
      setGlobalMaxTokens("");
      setGlobalUseResponsesApi(false);
      setGlobalOutputVersion("");
      setGlobalSupportsThinking(false);
      setGlobalSupportsReasoningEffort(false);
      setGlobalSupportsVision(false);
      setGlobalSupportsText2Image(false);
      setGlobalEnabled(true);
      setGlobalVerifySsl(false);
      setGlobalModelType("chat");
      setGlobalProviderId("");
      setCreateAdvancedOpen(false);
      setCreatingDialogOpen(false);
      refreshModelQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.admin.models.createFailed);
    } finally {
      setCreatingGlobal(false);
      creatingGlobalRef.current = false;
    }
  };

  const getDeleteDisabledReason = (model: GlobalModel): string | null => {
    // 如果 assignedMatrix 正在加载，显示加载状态
    if (assignedMatrixLoading) {
      return t.admin.models.assignLoading;
    }
    // 如果 assignedMatrix 未加载完成，暂时允许删除
    if (!assignedMatrix) {
      return null;
    }
    const assignedTenants = assignedMatrix?.byModelTenantIds?.[model.name] ?? [];
    if (assignedTenants.length > 0) {
      return t.admin.models.cannotDeleteInUse;
    }
    if (model.enabled !== false) {
      return t.admin.models.cannotDeleteEnabled;
    }
    return null;
  };

  const handleOpenDeleteDialog = (name: string) => {
    const model = globalModels.find((m) => m.name === name);
    if (!model) {
      toast.error(t.admin.models.modelNotFound);
      return;
    }

    const disabledReason = getDeleteDisabledReason(model);
    if (disabledReason) {
      toast.error(disabledReason);
      return;
    }

    setDeletingModelName(name);
    setDeleteDialogOpen(true);
  };

  const handleDeleteGlobalModel = async () => {
    if (!deletingModelName) return;
    try {
      setDeletingGlobalName(deletingModelName);
      const res = await fetchAuthApi(`/api/admin/models/global/${encodeURIComponent(deletingModelName)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await parseError(res, t.admin.models.deleteFailed));
      }
      toast.success(t.admin.models.deleteSuccess);
      refreshModelQueries();
      setDeleteDialogOpen(false);
      setDeletingModelName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.admin.models.deleteFailed);
    } finally {
      setDeletingGlobalName(null);
    }
  };

  const handleOpenEditDialog = (model: GlobalModel) => {
    setEditTestResult(null);
    setEditingModelName(model.name);
    setEditDisplayName(model.display_name ?? "");
    setEditProviderModel(model.model ?? "");
    // Provider Class 由厂商模板决定，不直接暴露给管理员
    setEditUse(model.use ?? "");
    setEditDescription(model.description ?? "");
    setEditEnabled(model.enabled !== false);
    setEditApiKey(model.api_key ?? "");
    setEditBaseUrl(model.base_url ?? "");
    setEditMaxTokens(model.max_tokens ? String(model.max_tokens) : "");
    setEditUseResponsesApi(Boolean(model.use_responses_api));
    setEditOutputVersion(model.output_version ?? "");
    setEditSupportsThinking(Boolean(model.supports_thinking));
    setEditSupportsReasoningEffort(Boolean(model.supports_reasoning_effort));
    setEditSupportsVision(Boolean(model.supports_vision));
    setEditSupportsText2Image(Boolean(model.supports_text2image));
    setEditVerifySsl(model.verify_ssl !== false);
    setEditModelType(model.model_type || "chat");
    // 尝试根据 use 值反推厂商模板
    const matchedProvider = PROVIDER_TEMPLATES.find(p =>
      model.use === p.use || model.use?.startsWith(p.id)
    );
    setEditProviderId(matchedProvider?.id ?? "");
    setEditAdvancedOpen(false);
    setEditingDialogOpen(true);
  };

  const handleUpdateGlobalModel = async () => {
    if (!editingModelName || !editProviderModel.trim() || !editUse.trim()) {
      toast.error(t.admin.models.validation.fillRequired);
      return;
    }
    const parsedMaxTokens = editMaxTokens.trim() ? Number(editMaxTokens.trim()) : undefined;
    if (parsedMaxTokens !== undefined && (!Number.isFinite(parsedMaxTokens) || parsedMaxTokens <= 0)) {
      toast.error(t.admin.models.validation.maxTokensInvalid);
      return;
    }
    try {
      setSavingGlobal(true);
      const res = await fetchAuthApi(`/api/admin/models/global/${encodeURIComponent(editingModelName)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: editProviderModel.trim() || undefined,
          use: editUse.trim() || undefined,
          display_name: editDisplayName.trim() || null,
          description: editDescription.trim() || null,
          api_key: editApiKey.trim() || undefined,
          base_url: editBaseUrl.trim() || undefined,
          max_tokens: parsedMaxTokens,
          use_responses_api: editUseResponsesApi,
          output_version: editOutputVersion.trim() || undefined,
          supports_thinking: editSupportsThinking,
          supports_reasoning_effort: editSupportsReasoningEffort,
          supports_vision: editSupportsVision,
          supports_text2image: editSupportsText2Image,
          enabled: editEnabled,
          verify_ssl: editVerifySsl,
          model_type: editModelType || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(await parseError(res, t.admin.models.updateFailed));
      }
      toast.success(t.admin.models.updateSuccess);
      setEditTestResult(null);
      setEditingDialogOpen(false);
      setEditingModelName("");
      refreshModelQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.admin.models.updateFailed);
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleCreateTestConnection = async () => {
    setCreateTestResult(null);
    setIsCreateTesting(true);
    try {
      const result = await testModelConnection({
        model: globalProviderModel.trim(),
        use: globalUse.trim(),
        base_url: globalBaseUrl.trim() || undefined,
        api_key: globalApiKey.trim() || undefined,
        max_tokens: 32,
        verify_ssl: globalVerifySsl,
      });
      setCreateTestResult(result);
    } catch (err) {
      setCreateTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsCreateTesting(false);
    }
  };

  const handleEditTestConnection = async () => {
    setEditTestResult(null);
    setIsEditTesting(true);
    try {
      const result = await testModelConnection({
        model: editProviderModel.trim(),
        use: editUse.trim(),
        base_url: editBaseUrl.trim() || undefined,
        api_key: editApiKey.trim() || undefined,
        max_tokens: 32,
        verify_ssl: editVerifySsl,
      });
      setEditTestResult(result);
    } catch (err) {
      setEditTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsEditTesting(false);
    }
  };

  const handleToggleGlobalEnabled = async (model: GlobalModel) => {
    try {
      setTogglingGlobalName(model.name);
      const nextEnabled = model.enabled === false;
      const res = await fetchAuthApi(`/api/admin/models/global/${encodeURIComponent(model.name)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) {
        throw new Error(await parseError(res, nextEnabled ? t.admin.models.statusUpdateFailed : t.admin.models.statusUpdateFailed));
      }
      toast.success(nextEnabled ? t.admin.models.enableSuccess : t.admin.models.disableSuccess);
      refreshModelQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.admin.models.statusUpdateFailed);
    } finally {
      setTogglingGlobalName(null);
    }
  };

  const handleOpenAssignDialog = (modelNameToAssign: string) => {
    setAssigningModelName(modelNameToAssign);
    setSelectedTenantIds(assignedMatrix?.byModelTenantIds?.[modelNameToAssign] ?? []);
    setAssignDialogOpen(true);
  };

  const handleBulkAssignTenants = async () => {
    if (!assigningModelName) {
      toast.error(t.admin.models.assignSelectModel);
      return;
    }
    if (assignedMatrixLoading) {
      toast.error(t.admin.models.assignLoading);
      return;
    }
    if (!assignedMatrix) {
      toast.error(t.admin.models.assignNotReady);
      return;
    }

    const currentlyAssigned = new Set(assignedMatrix?.byModelTenantIds?.[assigningModelName] ?? []);
    const selected = new Set(selectedTenantIds);
    const idsToAssign = selectedTenantIds.filter((id) => !currentlyAssigned.has(id));
    const idsToUnassign = Array.from(currentlyAssigned).filter((id) => !selected.has(id));

    if (idsToAssign.length === 0 && idsToUnassign.length === 0) {
      toast.info(t.admin.models.assignNoChange);
      setAssignDialogOpen(false);
      return;
    }

    try {
      setBulkAssigning(true);
      const assignResults = await Promise.allSettled(
        idsToAssign.map(async (selectedTenantId) => {
          const res = await fetchAuthApi(`/api/admin/tenants/${selectedTenantId}/models/assign`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model_name: assigningModelName, enabled: true }),
          });
          if (!res.ok) {
            throw new Error(await parseError(res, t.admin.models.assignError));
          }
        }),
      );

      const unassignResults = await Promise.allSettled(
        idsToUnassign.map(async (selectedTenantId) => {
          const res = await fetchAuthApi(
            `/api/admin/tenants/${selectedTenantId}/models/${encodeURIComponent(assigningModelName)}/assign`,
            {
              method: "DELETE",
            },
          );
          if (!res.ok) {
            throw new Error(await parseError(res, t.admin.models.assignError));
          }
        }),
      );

      const results = [...assignResults, ...unassignResults];

      const successCount = results.filter((r) => r.status === "fulfilled").length;
      const failCount = results.length - successCount;
      if (successCount > 0 && failCount === 0) {
        toast.success(t.admin.models.assignSuccess(idsToAssign.length, idsToUnassign.length));
      } else if (successCount > 0) {
        toast.success(t.admin.models.assignPartialSuccess(idsToAssign.length, idsToUnassign.length));
      }
      if (failCount > 0) {
        toast.error(t.admin.models.assignFailed(failCount));
      }

      if (failCount === 0) {
        setAssignDialogOpen(false);
      }
      refreshModelQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.admin.models.assignError);
    } finally {
      setBulkAssigning(false);
    }
  };

  const toggleTenantSelection = (tenantId: string) => {
    setSelectedTenantIds((prev) => {
      if (prev.includes(tenantId)) {
        return prev.filter((id) => id !== tenantId);
      }
      return [...prev, tenantId];
    });
  };

  return (
    <div className="flex-1 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.admin.models.title}</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {t.admin.models.description}
          </p>
        </div>
        <Button onClick={() => setCreatingDialogOpen(true)}>{t.admin.models.createGlobalModel}</Button>
      </div>

      <div className="relative w-full md:max-w-sm">
        <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t.admin.models.searchPlaceholder}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
        />
      </div>

      {globalLoadError && (
        <div className="p-4 rounded-md bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-900/50">
          {globalLoadError instanceof Error ? globalLoadError.message : t.admin.models.loadFailed}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        {globalLoading ? (
          <div className="p-10 text-center text-zinc-500">{t.admin.models.loading}</div>
        ) : filteredGlobalModels.length === 0 ? (
          <div className="p-16 text-center text-zinc-500">
            {normalizedKeyword ? t.admin.models.noMatch : t.admin.models.noModels}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-medium">
                <tr>
                  <th className="px-4 py-3 font-medium">{t.admin.models.columns.model}</th>
                  <th className="px-4 py-3 font-medium">{t.admin.models.columns.assignedTenants}</th>
                  <th className="px-4 py-3 font-medium">{t.admin.models.columns.capabilities}</th>
                  <th className="px-4 py-3 font-medium text-right">{t.admin.models.columns.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredGlobalModels.map((m) => (
                  <tr key={m.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{m.display_name ?? m.name}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{m.name} · {m.model}</div>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const names = assignedMatrix?.byModelTenantNames?.[m.name] ?? [];
                        if (names.length === 0) {
                          return <span className="text-xs text-zinc-500">{t.admin.models.unassigned}</span>;
                        }
                        const preview = names.slice(0, 2).join("、");
                        const remain = names.length - 2;
                        return (
                          <span className="text-xs text-zinc-700 dark:text-zinc-300">
                            {preview}
                            {remain > 0 ? t.admin.models.andMore(names.length) : ""}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {m.supports_thinking && <span className="text-xs rounded border px-1.5 py-0.5">{t.admin.models.capabilitiesLabels.thinking}</span>}
                        {m.supports_reasoning_effort && <span className="text-xs rounded border px-1.5 py-0.5">{t.admin.models.capabilitiesLabels.reasoningEffort}</span>}
                        {m.supports_vision && <span className="text-xs rounded border px-1.5 py-0.5">{t.admin.models.capabilitiesLabels.vision}</span>}
                        {m.supports_text2image && <span className="text-xs rounded border px-1.5 py-0.5">{t.admin.models.capabilitiesLabels.text2image}</span>}
                        {!m.supports_thinking && !m.supports_reasoning_effort && !m.supports_vision && !m.supports_text2image && (
                          <span className="text-xs text-zinc-500">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{m.enabled !== false ? t.admin.models.status.enabled : t.admin.models.status.disabled}</span>
                          <Switch
                            checked={m.enabled !== false}
                            onCheckedChange={() => void handleToggleGlobalEnabled(m)}
                            disabled={togglingGlobalName === m.name}
                          />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => void handleOpenEditDialog(m)}>
                              {t.admin.models.actions.edit}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenAssignDialog(m.name)}>
                              {t.admin.models.actions.assign}
                            </DropdownMenuItem>
                            {(() => {
                              const deleteDisabledReason = getDeleteDisabledReason(m);
                              const isDeleting = deletingGlobalName === m.name;
                              if (deleteDisabledReason) {
                                return (
                                  <DropdownMenuItem disabled>
                                    {t.admin.models.actions.delete}
                                    <span className="ml-auto text-xs text-muted-foreground">{deleteDisabledReason}</span>
                                  </DropdownMenuItem>
                                );
                              }
                              return (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => void handleOpenDeleteDialog(m.name)}
                                  disabled={isDeleting}
                                >
                                  {isDeleting ? t.admin.models.actions.deleting : t.admin.models.actions.delete}
                                </DropdownMenuItem>
                              );
                            })()}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={creatingDialogOpen}
        onOpenChange={(open) => {
          setCreatingDialogOpen(open);
          if (!open) {
            setCreateAdvancedOpen(false);
            setGlobalNameEdited(false);
            setCreateTestResult(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px] overflow-hidden">
          <DialogHeader className="pb-2">
            <DialogTitle>{t.admin.models.createDialog.title}</DialogTitle>
            <DialogDescription>
              {t.admin.models.createDialog.description}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-6 py-1">
              {/* 基础信息 */}
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 items-start">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="global-provider-model">{t.admin.models.createDialog.modelName} <span className="text-destructive">*</span></label>
                    <Input
                      id="global-provider-model"
                      placeholder={t.admin.models.createDialog.modelNamePlaceholder}
                      value={globalProviderModel}
                      onChange={(e) => setGlobalProviderModel(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="global-provider-select">{t.admin.models.createDialog.providerTemplate}</label>
                    <Select value={globalProviderId} onValueChange={(v) => applyProviderTemplate(v, false)}>
                      <SelectTrigger id="global-provider-select" className="w-full">
                        <SelectValue placeholder={t.admin.models.createDialog.providerPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDER_TEMPLATES.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {globalProviderId && (
                      <p className="text-[11px] text-muted-foreground leading-tight">{getProviderById(globalProviderId)?.note}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none">模型类型</label>
                    <Select value={globalModelType} onValueChange={(v) => {
                      setGlobalModelType(v);
                      const preset = MODEL_TYPES[v];
                      if (preset) {
                        setGlobalSupportsThinking(preset.thinking);
                        setGlobalSupportsReasoningEffort(preset.reasoning);
                        setGlobalSupportsVision(preset.vision);
                        setGlobalSupportsText2Image(preset.text2image);
                      }
                    }}>
                      <SelectTrigger size="sm" className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chat">对话 (Chat)</SelectItem>
                        <SelectItem value="code">代码 (Code)</SelectItem>
                        <SelectItem value="reasoning">推理 (Reasoning)</SelectItem>
                        <SelectItem value="vision">视觉 (Vision)</SelectItem>
                        <SelectItem value="text2image">文生图 (Text-to-Image)</SelectItem>
                        <SelectItem value="multimodal">多模态 (Multimodal)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="global-model-name">
                      {t.admin.models.createDialog.globalModelId} <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="global-model-name"
                      className={normalizedGlobalName.length > 0 && (!isGlobalNameValid || isGlobalNameConflict) ? "border-destructive focus-visible:ring-destructive/30" : ""}
                      placeholder={t.admin.models.createDialog.globalModelIdPlaceholder}
                      value={globalName}
                      onChange={(e) => {
                        setGlobalNameEdited(true);
                        setGlobalName(e.target.value);
                      }}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground leading-tight">{t.admin.models.createDialog.autoGenerateHint}</p>
                      {globalNameEdited && autoGeneratedGlobalName && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[10px]"
                          onClick={() => {
                            setGlobalName(autoGeneratedGlobalName);
                            setGlobalNameEdited(false);
                          }}
                        >
                          {t.admin.models.createDialog.restoreAuto}
                        </Button>
                      )}
                    </div>
                    {normalizedGlobalName.length > 0 && !isGlobalNameValid && (
                      <p className="text-[11px] text-destructive leading-tight">{t.admin.models.createDialog.nameInvalidHint}</p>
                    )}
                    {isGlobalNameConflict && <p className="text-[11px] text-destructive leading-tight">{t.admin.models.createDialog.nameExistsHint}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="global-display-name">{t.admin.models.createDialog.displayName}</label>
                    <Input
                      id="global-display-name"
                      placeholder={t.admin.models.createDialog.displayNamePlaceholder}
                      value={globalDisplayName}
                      onChange={(e) => setGlobalDisplayName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium leading-none" htmlFor="global-description">{t.admin.models.createDialog.modelDescription}</label>
                    <Textarea
                      id="global-description"
                      placeholder={t.admin.models.createDialog.descriptionPlaceholder}
                      value={globalDescription}
                      onChange={(e) => setGlobalDescription(e.target.value)}
                      className="min-h-[60px]"
                    />
                  </div>
                  {/* API Key、Base URL、Max Tokens 移到基础区 */}
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium leading-none" htmlFor="global-api-key">{t.admin.models.createDialog.apiKey}</label>
                    <Input
                      id="global-api-key"
                      type="text"
                      placeholder={t.admin.models.createDialog.apiKeyPlaceholder}
                      value={globalApiKey}
                      onChange={(e) => setGlobalApiKey(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="global-base-url">{t.admin.models.createDialog.baseUrl}</label>
                    <Input
                      id="global-base-url"
                      placeholder={t.admin.models.createDialog.baseUrlPlaceholder}
                      value={globalBaseUrl}
                      onChange={(e) => setGlobalBaseUrl(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="global-max-tokens">{t.admin.models.createDialog.maxTokens}</label>
                    <Input
                      id="global-max-tokens"
                      inputMode="numeric"
                      placeholder={t.admin.models.createDialog.maxTokensPlaceholder}
                      value={globalMaxTokens}
                      onChange={(e) => setGlobalMaxTokens(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
                    <span className="text-sm">{t.admin.models.createDialog.sslVerification}</span>
                    <Switch checked={globalVerifySsl} onCheckedChange={setGlobalVerifySsl} />
                  </label>
                </div>
              </div>

              <div className="border-t" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t.admin.models.createDialog.testConnection}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCreateTestConnection}
                    disabled={isCreateTesting || !globalProviderModel.trim()}
                  >
                    {isCreateTesting ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        {t.admin.models.createDialog.testing}
                      </>
                    ) : (
                      t.admin.models.createDialog.test
                    )}
                  </Button>
                </div>

                {createTestResult && (
                  <div
                    className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
                      createTestResult.success
                        ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                        : "bg-destructive/5 border-destructive/20 text-destructive"
                    }`}
                  >
                    {createTestResult.success ? (
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <CircleX className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">
                        {createTestResult.success ? t.admin.models.createDialog.connectionSuccess : t.admin.models.createDialog.connectionFailed}
                      </p>
                      <p className="text-xs mt-0.5 opacity-80 break-words">{createTestResult.message}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* 能力与状态 */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t.admin.models.createDialog.capabilitiesTitle}</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-sm">{t.admin.models.createDialog.thinking}</span>
                    <Switch checked={globalSupportsThinking} onCheckedChange={setGlobalSupportsThinking} />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-sm">{t.admin.models.createDialog.reasoningEffort}</span>
                    <Switch checked={globalSupportsReasoningEffort} onCheckedChange={setGlobalSupportsReasoningEffort} />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-sm">{t.admin.models.createDialog.vision}</span>
                    <Switch checked={globalSupportsVision} onCheckedChange={setGlobalSupportsVision} />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-sm">{t.admin.models.createDialog.text2image}</span>
                    <Switch checked={globalSupportsText2Image} onCheckedChange={setGlobalSupportsText2Image} />
                  </label>
                </div>
                <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm font-medium">{t.admin.models.createDialog.defaultEnabled}</span>
                  <Switch checked={globalEnabled} onCheckedChange={setGlobalEnabled} />
                </label>
              </div>

              {/* 高级配置 */}
              <Collapsible open={createAdvancedOpen} onOpenChange={setCreateAdvancedOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="flex h-auto w-full items-center justify-between px-3 py-2.5 hover:bg-transparent">
                      <span className="text-sm font-medium">{t.admin.models.createDialog.advancedConfig}</span>
                      <ChevronDownIcon className={`size-4 shrink-0 text-muted-foreground transition-transform ${createAdvancedOpen ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 pb-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <label className="text-sm font-medium" htmlFor="global-output-version">{t.admin.models.createDialog.outputVersion}</label>
                        <Input id="global-output-version" placeholder={t.admin.models.createDialog.outputVersionPlaceholder} value={globalOutputVersion} onChange={(e) => setGlobalOutputVersion(e.target.value)} />
                      </div>
                    </div>
                    <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="text-sm">Use Responses API</span>
                      <Switch checked={globalUseResponsesApi} onCheckedChange={setGlobalUseResponsesApi} />
                    </label>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
          </ScrollArea>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => setCreatingDialogOpen(false)}
              disabled={creatingGlobal}
            >
              {t.admin.models.createDialog.cancel}
            </Button>
            <Button
              onClick={() => void handleCreateGlobalModel()}
              disabled={creatingGlobal || !normalizedGlobalName || !globalProviderModel.trim() || !globalUse.trim() || !isGlobalNameValid || isGlobalNameConflict}
            >
              {creatingGlobal ? t.admin.models.createDialog.creating : t.admin.models.createDialog.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingDialogOpen}
        onOpenChange={(open) => {
          setEditingDialogOpen(open);
          if (!open) {
            setEditAdvancedOpen(false);
            setEditTestResult(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px] overflow-hidden">
          <DialogHeader className="pb-2">
            <DialogTitle>{t.admin.models.editDialog.title}</DialogTitle>
            <DialogDescription>{t.admin.models.editDialog.description}</DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-6 py-1">
              {/* 基础信息 */}
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 items-start">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="edit-provider-model">{t.admin.models.createDialog.modelName} <span className="text-destructive">*</span></label>
                    <Input id="edit-provider-model" placeholder={t.admin.models.createDialog.modelNamePlaceholder} value={editProviderModel} onChange={(e) => setEditProviderModel(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="edit-provider-select">{t.admin.models.createDialog.providerTemplate}</label>
                    <Select value={editProviderId} onValueChange={(v) => applyProviderTemplate(v, true)}>
                      <SelectTrigger id="edit-provider-select" className="w-full"><SelectValue placeholder={t.admin.models.createDialog.providerPlaceholder} /></SelectTrigger>
                      <SelectContent>
                        {PROVIDER_TEMPLATES.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editProviderId && (
                      <p className="text-[11px] text-muted-foreground leading-tight">{getProviderById(editProviderId)?.note}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none">模型类型</label>
                    <Select value={editModelType} onValueChange={(v) => {
                      setEditModelType(v);
                      const preset = MODEL_TYPES[v];
                      if (preset) {
                        setEditSupportsThinking(preset.thinking);
                        setEditSupportsReasoningEffort(preset.reasoning);
                        setEditSupportsVision(preset.vision);
                        setEditSupportsText2Image(preset.text2image);
                      }
                    }}>
                      <SelectTrigger size="sm" className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chat">对话 (Chat)</SelectItem>
                        <SelectItem value="code">代码 (Code)</SelectItem>
                        <SelectItem value="reasoning">推理 (Reasoning)</SelectItem>
                        <SelectItem value="vision">视觉 (Vision)</SelectItem>
                        <SelectItem value="text2image">文生图 (Text-to-Image)</SelectItem>
                        <SelectItem value="multimodal">多模态 (Multimodal)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="edit-model-name">{t.admin.models.createDialog.globalModelId}</label>
                    <Input id="edit-model-name" value={editingModelName} disabled className="bg-muted/50" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="edit-display-name">{t.admin.models.createDialog.displayName}</label>
                    <Input id="edit-display-name" placeholder={t.admin.models.createDialog.displayNamePlaceholder} value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium leading-none" htmlFor="edit-description">{t.admin.models.createDialog.modelDescription}</label>
                    <Textarea id="edit-description" placeholder={t.admin.models.createDialog.descriptionPlaceholder} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="min-h-[60px]" />
                  </div>
                  {/* API Key、Base URL、Max Tokens 移到基础区 */}
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium leading-none" htmlFor="edit-api-key">{t.admin.models.createDialog.apiKey}</label>
                    <Input
                      id="edit-api-key"
                      type="text"
                      placeholder={t.admin.models.createDialog.apiKeyPlaceholder}
                      value={editApiKey}
                      onChange={(e) => setEditApiKey(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="edit-base-url">{t.admin.models.createDialog.baseUrl}</label>
                    <Input id="edit-base-url" placeholder={t.admin.models.createDialog.baseUrlPlaceholder} value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none" htmlFor="edit-max-tokens">{t.admin.models.createDialog.maxTokens}</label>
                    <Input id="edit-max-tokens" inputMode="numeric" placeholder={t.admin.models.createDialog.maxTokensPlaceholder} value={editMaxTokens} onChange={(e) => setEditMaxTokens(e.target.value)} />
                  </div>
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
                    <span className="text-sm">{t.admin.models.createDialog.sslVerification}</span>
                    <Switch checked={editVerifySsl} onCheckedChange={setEditVerifySsl} />
                  </label>
                </div>
              </div>

              <div className="border-t" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t.admin.models.createDialog.testConnection}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleEditTestConnection}
                    disabled={isEditTesting || !editProviderModel.trim()}
                  >
                    {isEditTesting ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        {t.admin.models.createDialog.testing}
                      </>
                    ) : (
                      t.admin.models.createDialog.test
                    )}
                  </Button>
                </div>

                {editTestResult && (
                  <div
                    className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
                      editTestResult.success
                        ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                        : "bg-destructive/5 border-destructive/20 text-destructive"
                    }`}
                  >
                    {editTestResult.success ? (
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <CircleX className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">
                        {editTestResult.success ? t.admin.models.createDialog.connectionSuccess : t.admin.models.createDialog.connectionFailed}
                      </p>
                      <p className="text-xs mt-0.5 opacity-80 break-words">{editTestResult.message}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* 能力与状态 */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t.admin.models.createDialog.capabilitiesTitle}</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-sm">{t.admin.models.createDialog.thinking}</span>
                    <Switch checked={editSupportsThinking} onCheckedChange={setEditSupportsThinking} />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-sm">{t.admin.models.createDialog.reasoningEffort}</span>
                    <Switch checked={editSupportsReasoningEffort} onCheckedChange={setEditSupportsReasoningEffort} />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-sm">{t.admin.models.createDialog.vision}</span>
                    <Switch checked={editSupportsVision} onCheckedChange={setEditSupportsVision} />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-sm">{t.admin.models.createDialog.text2image}</span>
                    <Switch checked={editSupportsText2Image} onCheckedChange={setEditSupportsText2Image} />
                  </label>
                </div>
                <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm font-medium">{t.admin.models.createDialog.defaultEnabled}</span>
                  <Switch checked={editEnabled} onCheckedChange={setEditEnabled} />
                </label>
              </div>

              {/* 高级配置 */}
              <Collapsible open={editAdvancedOpen} onOpenChange={setEditAdvancedOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="flex h-auto w-full items-center justify-between px-3 py-2.5 hover:bg-transparent">
                      <span className="text-sm font-medium">{t.admin.models.createDialog.advancedConfig}</span>
                      <ChevronDownIcon className={`size-4 shrink-0 text-muted-foreground transition-transform ${editAdvancedOpen ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 pb-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <label className="text-sm font-medium" htmlFor="edit-output-version">{t.admin.models.createDialog.outputVersion}</label>
                        <Input id="edit-output-version" placeholder={t.admin.models.createDialog.outputVersionPlaceholder} value={editOutputVersion} onChange={(e) => setEditOutputVersion(e.target.value)} />
                      </div>
                    </div>
                    <label className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="text-sm">Use Responses API</span>
                      <Switch checked={editUseResponsesApi} onCheckedChange={setEditUseResponsesApi} />
                    </label>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
          </ScrollArea>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setEditingDialogOpen(false)} disabled={savingGlobal}>{t.admin.models.createDialog.cancel}</Button>
            <Button onClick={() => void handleUpdateGlobalModel()} disabled={savingGlobal || !editingModelName || !editProviderModel.trim() || !editUse.trim()}>
              {savingGlobal ? t.admin.models.editDialog.saving : t.admin.models.editDialog.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{t.admin.models.deleteDialog.title}</DialogTitle>
            <DialogDescription>
              {t.admin.models.deleteDialog.description}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{t.admin.models.deleteDialog.target}：{deletingModelName || "-"}</div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deletingGlobalName === deletingModelName}
            >
              {t.admin.models.createDialog.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteGlobalModel()}
              disabled={!deletingModelName || deletingGlobalName === deletingModelName}
            >
              {deletingGlobalName === deletingModelName ? t.admin.models.actions.deleting : t.admin.models.deleteDialog.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>{t.admin.models.assignDialog.title}</DialogTitle>
            <DialogDescription>{t.admin.models.assignDialog.description}{assigningModelName || "-"}</DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-2 overflow-auto rounded-md border p-2">
            {(tenantData?.tenants ?? []).length === 0 ? (
              <div className="text-muted-foreground px-2 py-4 text-sm">{t.admin.models.assignDialog.noTenants}</div>
            ) : (
              (tenantData?.tenants ?? []).map((tenant) => {
                const checked = selectedTenantIds.includes(tenant.id);
                const assigned = (assignedMatrix?.byModelTenantIds?.[assigningModelName] ?? []).includes(tenant.id);
                return (
                  <label
                    key={tenant.id}
                    className="hover:bg-muted/40 flex cursor-pointer items-center justify-between rounded-md border px-3 py-2"
                  >
                    <span className="text-sm">
                      {tenant.name}
                      {assigned ? <span className="ml-2 text-xs text-emerald-600">{t.admin.models.assignDialog.assigned}</span> : null}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTenantSelection(tenant.id)}
                      className="h-4 w-4"
                    />
                  </label>
                );
              })
            )}
          </div>
          <p className="text-muted-foreground text-xs">{t.admin.models.assignDialog.selectedCount} {selectedTenantIds.length}</p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={bulkAssigning}>
              {t.admin.models.assignDialog.cancel}
            </Button>
            <Button onClick={() => void handleBulkAssignTenants()} disabled={bulkAssigning || assignedMatrixLoading}>
              {bulkAssigning ? t.admin.models.assignDialog.saving : assignedMatrixLoading ? t.admin.models.assignDialog.loading : t.admin.models.assignDialog.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
