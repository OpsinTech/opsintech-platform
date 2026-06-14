import { ChevronDown, ChevronUp, ArrowLeft, Settings2, CircleCheck, CircleX, Loader2 } from "lucide-react";
import React, { type FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/core/i18n/hooks";
import {
  useAvailableModels,
  useRegisterModel,
  useUpdateModel,
  useUpdateTenantModel,
  useTestModelConnection,
  getDisabledModelsStore,
  setDisabledModelsStore,
} from "@/core/models/hooks";
import { PROVIDER_TEMPLATES, getProviderById } from "@/core/models/provider-templates";
import type { AvailableModelResponse } from "@/core/models/types";
import { isTenantAdminRole, scopeLabel } from "@/core/permissions/scope";
import { useCurrentTenant } from "@/core/tenants/hooks";

import { SettingsSection } from "./settings-section";

const DEFAULT_USE_CLASS = "langchain_openai.ChatOpenAI";

export function ModelLifecycleSettingsPage({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { t } = useI18n();
  const { data: currentTenant } = useCurrentTenant();
  const { models, isLoading, error } = useAvailableModels();

  const isTenantAdmin = isTenantAdminRole(currentTenant?.role);
  const canManageTenantModels = isTenantAdmin && !readOnly;
  
  // Mutations
  const { mutateAsync: registerModel, isPending: isRegistering } = useRegisterModel();
  const { mutateAsync: updateModel, isPending: isUpdating } = useUpdateModel();
  const { mutateAsync: updateTenantModel, isPending: isUpdatingTenant } = useUpdateTenantModel();
  const isMutating = isRegistering || isUpdating || isUpdatingTenant;

  const { mutateAsync: testConnection, isPending: isTesting } = useTestModelConnection();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Local state for enable/disable
  const [disabledStore, setDisabledStore] = useState<string[]>([]);
  useEffect(() => setDisabledStore(getDisabledModelsStore()), []);
  const setDisabled = (next: string[]) => {
    setDisabledStore(next);
    setDisabledModelsStore(next);
  };

  // View state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingModelName, setEditingModelName] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Form fields
  const [name, setName] = useState("");
  const [providerModel, setProviderModel] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [useClass, setUseClass] = useState(DEFAULT_USE_CLASS);
  const [supportsThinking, setSupportsThinking] = useState(false);
  const [supportsReasoningEffort, setSupportsReasoningEffort] = useState(false);
  const [supportsVision, setSupportsVision] = useState(false);
  const [supportsText2Image, setSupportsText2Image] = useState(false);
  const [useResponsesApi, setUseResponsesApi] = useState(false);
  const [outputVersion, setOutputVersion] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [providerId, setProviderId] = useState("");
  
  const [formError, setFormError] = useState<string | null>(null);

  const sortedModels = useMemo(
    () => [...models].sort((a, b) => a.name.localeCompare(b.name)),
    [models],
  );

  const resetForm = () => {
    setName("");
    setProviderModel("");
    setDisplayName("");
    setDescription("");
    setUseClass(DEFAULT_USE_CLASS);
    setSupportsThinking(false);
    setSupportsReasoningEffort(false);
    setSupportsVision(false);
    setSupportsText2Image(false);
    setUseResponsesApi(false);
    setOutputVersion("");
    setMaxTokens("");
    setBaseUrl("");
    setApiKey("");
    setProviderId("");
    setShowAdvanced(false);
    setFormError(null);
    setTestResult(null);
    setEditingModelName(null);
  };

  const applyProviderTemplate = (id: string) => {
    const template = getProviderById(id);
    if (!template) return;
    setUseClass(template.use);
    setBaseUrl(template.baseUrl);
    setSupportsThinking(template.defaultSupportsThinking);
    setSupportsReasoningEffort(template.defaultSupportsReasoningEffort);
    setSupportsVision(template.defaultSupportsVision);
    setSupportsText2Image(Boolean(template.defaultSupportsText2Image));
    setProviderId(id);
  };

  const handleToggleModel = async (model: AvailableModelResponse, enabled: boolean) => {
    if (model.scope === "tenant") {
      if (!isTenantAdmin) {
        alert(t.settings.modelLifecycle.tenantAdminOnly);
        return;
      }
      try {
        await updateTenantModel({ name: model.name, input: { enabled } });
      } catch (err) {
        alert(err instanceof Error ? err.message : t.settings.modelLifecycle.updateTenantFailed);
      }
      return;
    }

    if (enabled) {
      setDisabled(disabledStore.filter((n) => n !== model.name));
    } else {
      setDisabled([...disabledStore, model.name]);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    // Editing mode constraints check
    if (!editingModelName) {
      if (!name.trim() || !providerModel.trim()) {
        setFormError(t.settings.modelLifecycle.register.validationRequired);
        return;
      }
    }

    try {
      if (editingModelName) {
        const isTenant = models.find(m => m.name === editingModelName)?.scope === "tenant";
        const inputPayload = {
            display_name: displayName.trim() || undefined,
            description: description.trim() || undefined,
            supports_thinking: supportsThinking,
            supports_reasoning_effort: supportsReasoningEffort,
            supports_vision: supportsVision,
            supports_text2image: supportsText2Image,
            use_responses_api: useResponsesApi,
            output_version: outputVersion.trim() || undefined,
            max_tokens: maxTokens.trim() ? Number(maxTokens) : undefined,
            base_url: baseUrl.trim() || undefined,
            api_key: apiKey.trim() || undefined,
            use: useClass.trim() || DEFAULT_USE_CLASS,
        };

        if (isTenant) {
          if (!isTenantAdmin) {
            setFormError(t.settings.modelLifecycle.tenantAdminOnly);
            return;
          }
          await updateTenantModel({ name: editingModelName, input: inputPayload });
        } else {
          await updateModel({ name: editingModelName, input: inputPayload });
        }
      } else {
        const inputPayload = {
          name: name.trim(),
          model: providerModel.trim(),
          use: useClass.trim() || DEFAULT_USE_CLASS,
          display_name: displayName.trim() || undefined,
          description: description.trim() || undefined,
          supports_thinking: supportsThinking,
          supports_reasoning_effort: supportsReasoningEffort,
          supports_vision: supportsVision,
          supports_text2image: supportsText2Image,
          use_responses_api: useResponsesApi,
          output_version: outputVersion.trim() || undefined,
          max_tokens: maxTokens.trim() ? Number(maxTokens) : undefined,
          base_url: baseUrl.trim() || undefined,
          api_key: apiKey.trim() || undefined,
        };
        // For now, new models from UI are user models. If tenant select is needed, it would be here.
        await registerModel(inputPayload);
      }
      setIsFormOpen(false);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save model");
    }
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    try {
      const result = await testConnection({
        model: providerModel.trim(),
        use: useClass.trim() || DEFAULT_USE_CLASS,
        base_url: baseUrl.trim() || undefined,
        api_key: apiKey.trim() || undefined,
        max_tokens: 32,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  if (isFormOpen) {
    return (
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col space-y-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsFormOpen(false)}
            className="w-fit p-0 h-auto text-muted-foreground hover:text-foreground mb-4 font-normal"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t.settings.modelLifecycle.backToList}
          </Button>
          <h2 className="text-xl font-semibold tracking-tight">
            {editingModelName ? t.settings.modelLifecycle.register.editTitle(editingModelName) : t.settings.modelLifecycle.register.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {editingModelName ? t.settings.modelLifecycle.register.editDescription : t.settings.modelLifecycle.register.description}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 pb-10">
          <div className="space-y-4">
            <h3 className="text-sm font-medium flex items-center">
              <Settings2 className="mr-2 h-4 w-4" />
              {t.settings.modelLifecycle.register.basicInfo}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  {t.settings.modelLifecycle.register.fields.name} <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder={t.settings.modelLifecycle.register.fields.namePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isMutating || !!editingModelName}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  {t.settings.modelLifecycle.register.fields.model} <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder={t.settings.modelLifecycle.register.fields.modelPlaceholder}
                  value={providerModel}
                  onChange={(e) => setProviderModel(e.target.value)}
                  disabled={isMutating || !!editingModelName}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  {t.settings.modelLifecycle.register.fields.provider}
                </label>
                <Select value={providerId} onValueChange={applyProviderTemplate}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.settings.modelLifecycle.register.fields.providerPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_TEMPLATES.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {providerId && (
                  <p className="text-[11px] text-muted-foreground leading-tight">{getProviderById(providerId)?.note}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  {t.settings.modelLifecycle.register.fields.displayName}
                </label>
                <Input
                  placeholder={t.settings.modelLifecycle.register.fields.displayNamePlaceholder}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isMutating}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  {t.settings.modelLifecycle.register.fields.description}
                </label>
                <Input
                  placeholder={t.settings.modelLifecycle.register.fields.descriptionPlaceholder}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isMutating}
                />
              </div>
            </div>
          </div>

          <div className="border-t"></div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="group flex w-full items-center justify-between py-2 text-sm font-medium transition-colors hover:text-muted-foreground"
            >
              <div className="flex flex-col items-start gap-1">
                <span className="flex items-center">{t.settings.modelLifecycle.register.advancedConfig}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t.settings.modelLifecycle.register.advancedConfigDesc}
                </span>
              </div>
              {showAdvanced ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground transition-transform group-hover:text-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-hover:text-foreground" />
              )}
            </button>

            {showAdvanced && (
              <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-4">
                <div className="grid gap-4 sm:grid-cols-2 bg-muted/20 p-4 rounded-lg border">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Base URL</label>
                    <Input
                      placeholder="https://api.openai.com/v1"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      disabled={isMutating}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">API Key</label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      disabled={isMutating}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">{t.settings.modelLifecycle.register.fields.use}</label>
                    <Input
                      placeholder="langchain_openai.ChatOpenAI"
                      value={useClass}
                      onChange={(e) => setUseClass(e.target.value)}
                      disabled={isMutating}
                    />
                    <p className="text-[11px] text-muted-foreground leading-tight">{t.settings.modelLifecycle.register.providerNote}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Max Tokens</label>
                    <Input
                      type="number"
                      placeholder="e.g. 8192"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(e.target.value)}
                      disabled={isMutating}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-sm">
                    <label className="text-sm font-medium leading-none">
                      {t.settings.modelLifecycle.register.fields.supportsThinking}
                    </label>
                    <Switch checked={supportsThinking} onCheckedChange={setSupportsThinking} disabled={isMutating} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-sm">
                    <label className="text-sm font-medium leading-none">
                      {t.settings.modelLifecycle.register.fields.supportsReasoningEffort}
                    </label>
                    <Switch checked={supportsReasoningEffort} onCheckedChange={setSupportsReasoningEffort} disabled={isMutating} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-sm">
                    <label className="text-sm font-medium leading-none">
                      {t.settings.modelLifecycle.register.fields.supportsVision}
                    </label>
                    <Switch checked={supportsVision} onCheckedChange={setSupportsVision} disabled={isMutating} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-sm">
                    <label className="text-sm font-medium leading-none">
                      {t.settings.modelLifecycle.register.fields.supportsText2Image}
                    </label>
                    <Switch checked={supportsText2Image} onCheckedChange={setSupportsText2Image} disabled={isMutating} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-sm">
                    <label className="text-sm font-medium leading-none">
                      {t.settings.modelLifecycle.register.fields.useResponsesApi}
                    </label>
                    <Switch checked={useResponsesApi} onCheckedChange={setUseResponsesApi} disabled={isMutating} />
                  </div>
                </div>

              </div>
            )}
          </div>

          <div className="border-t" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t.settings.modelLifecycle.register.testConnection}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTesting || !providerModel.trim()}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    {t.settings.modelLifecycle.register.testing}
                  </>
                ) : (
                  t.settings.modelLifecycle.register.testConnection
                )}
              </Button>
            </div>

            {testResult && (
              <div
                className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
                  testResult.success
                    ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                    : "bg-destructive/5 border-destructive/20 text-destructive"
                }`}
              >
                {testResult.success ? (
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CircleX className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">
                    {testResult.success
                      ? t.settings.modelLifecycle.register.testSuccess
                      : t.settings.modelLifecycle.register.testFailed}
                  </p>
                  <p className="text-xs mt-0.5 opacity-80 break-words">{testResult.message}</p>
                </div>
              </div>
            )}
          </div>

          {formError && (
            <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-md border border-destructive/20 animate-in fade-in">
              {formError}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4 border-t gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFormOpen(false)}
              disabled={isMutating}
            >
              {t.settings.modelLifecycle.register.cancel}
            </Button>
            <Button type="submit" disabled={isMutating}>
              {isMutating ? t.settings.modelLifecycle.register.submitting : t.settings.modelLifecycle.register.submit}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <SettingsSection
      title={t.settings.modelLifecycle.title}
      description={t.settings.modelLifecycle.description}
      action={null}
    >
      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground text-sm border rounded-xl bg-muted/10 animate-pulse">
          {t.common.loading}
        </div>
      ) : error ? (
        <div className="text-sm text-destructive p-4 border rounded-xl bg-destructive/5">
          Failed to load models: {error.message}
        </div>
      ) : (
        <div className="grid gap-4 mt-2">
          {sortedModels.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center p-16 text-center text-muted-foreground rounded-xl border border-dashed bg-muted/5">
              <div className="rounded-full bg-muted/50 p-4 mb-4">
                <Settings2 className="h-8 w-8 opacity-50" />
              </div>
              <p className="text-base font-medium text-foreground mb-2">No models registered</p>
              <p className="text-sm max-w-sm mb-6 opacity-80">
                {t.settings.modelLifecycle.register.emptyHint}
              </p>
                <p className="text-xs text-muted-foreground">
                  {readOnly ? t.settings.modelLifecycle.readOnlyHint : t.settings.modelLifecycle.userHint}
                </p>
            </div>
          ) : (
            sortedModels.map((model) => (
              <ModelItem
                key={model.name}
                model={model}
                canManageTenantModels={canManageTenantModels}
                isEnabled={
                  model.scope === "tenant"
                    ? model.enabled !== false
                    : !disabledStore.includes(model.name)
                }
                onToggle={(enabled) => void handleToggleModel(model, enabled)}
              />
            ))
          )}
        </div>
      )}
    </SettingsSection>
  );
}

function ModelItem({
  model,
  canManageTenantModels,
  isEnabled,
  onToggle,
}: {
  model: AvailableModelResponse;
  canManageTenantModels: boolean;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const { t } = useI18n();
  const scopeBadgeStyle = {
    global: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    tenant: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
    user: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  }[model.scope] ?? "bg-muted text-muted-foreground";

  const canToggle =
    model.scope === "tenant" &&
    canManageTenantModels &&
    model.managed_by_current_user;

  return (
    <div className={`flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-card ${!isEnabled ? "opacity-60 grayscale-[50%]" : ""}`}>
      <div className="flex flex-col gap-1.5 min-w-0 pr-4 flex-1">
        <div className="flex flex-row items-center gap-2 min-w-0">
          <h4 className="font-semibold text-base leading-tight truncate" title={model.display_name || model.name}>
            {model.display_name || model.name}
          </h4>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${scopeBadgeStyle} hidden sm:inline-block shrink-0 whitespace-nowrap`}>
            {scopeLabel(model.scope)}
          </span>
        </div>
        <div className="flex flex-row items-center gap-2 min-w-0 text-xs text-muted-foreground">
          <span 
            className="px-2 py-0.5 rounded-full bg-muted font-mono truncate max-w-[280px] sm:max-w-[400px] shrink-0" 
            title={model.model}
          >
            {model.model}
          </span>
          {model.description && (
            <span className="truncate flex-1" title={model.description}>
              {model.description}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {isEnabled ? t.settings.modelLifecycle.enabled : t.settings.modelLifecycle.disabled}
          </span>
          <Switch checked={isEnabled} onCheckedChange={onToggle} disabled={!canToggle} />
        </div>
        
        <div className="w-8 ml-2 flex items-center justify-center" title={t.settings.modelLifecycle.editDisabled}>
          <Settings2 className="h-4 w-4 text-muted-foreground/30" />
        </div>
      </div>
    </div>
  );
}
