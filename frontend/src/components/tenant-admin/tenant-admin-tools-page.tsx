"use client";

import { Activity, ChevronRight, Loader2, Pencil, Plus, TestTube2, Trash2, SearchIcon } from "lucide-react";
import React, { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/core/i18n/hooks";
import {
  useAvailableMcpConfig,
  useCheckMCPHealth,
  useCreateTenantMCPServer,
  useDeleteTenantMCPServer,
  useEnableTenantMCPServer,
  usePingMCPServer,
  useUpdateSingleTenantMCPServer,
} from "@/core/mcp/hooks";
import { getMcpTemplateById, MCP_TEMPLATES } from "@/core/mcp/templates";
import type { MCPServerConfig, McpToolInfo } from "@/core/mcp/types";

type ToolEditor = {
  name: string;
  config: MCPServerConfig;
};

const EMPTY_EDITOR: ToolEditor = {
  name: "",
  config: {
    enabled: true,
    type: "stdio",
    command: "",
    args: [],
    env: {},
    headers: {},
    description: "",
  },
};

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9._-]{2,64}$/;

type KeyValuePair = { id: string; key: string; value: string };

let _kvIdCounter = 0;
function generateId(): string {
  _kvIdCounter += 1;
  return `kv-${_kvIdCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

function pairsToRecord(pairs: KeyValuePair[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of pairs) {
    if (key.trim()) result[key.trim()] = value;
  }
  return result;
}

function recordToPairs(record: Record<string, string> | undefined): KeyValuePair[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ id: generateId(), key, value }));
}

function pairsToArray(pairs: KeyValuePair[]): string[] {
  return pairs.map((p) => p.value).filter((v) => v !== "");
}

function arrayToPairs(arr: string[] | undefined): KeyValuePair[] {
  if (!arr || !Array.isArray(arr)) return [];
  return arr.filter((v) => typeof v === "string").map((v) => ({ id: generateId(), key: "", value: v }));
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isObjectOrNull(value: unknown): value is Record<string, unknown> | null {
  return value === null || (typeof value === "object" && !Array.isArray(value));
}

function stringifyPretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Inline key-value table for env/headers editing */
function KeyValueTable({
  pairs,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
  deleteLabel,
}: {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  addLabel: string;
  deleteLabel: string;
}) {
  const updateRow = (id: string, field: "key" | "value", val: string) => {
    onChange(pairs.map((p) => (p.id === id ? { ...p, [field]: val } : p)));
  };
  const removeRow = (id: string) => {
    onChange(pairs.filter((p) => p.id !== id));
  };
  const addRow = () => {
    onChange([...pairs, { id: generateId(), key: "", value: "" }]);
  };

  return (
    <div className="rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-medium">{keyPlaceholder}</th>
            <th className="px-2 py-1.5 font-medium">{valuePlaceholder}</th>
            <th className="w-10 px-2 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair) => (
            <tr key={pair.id} className="border-t">
              <td className="px-1 py-1">
                <Input
                  className="h-8 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                  value={pair.key}
                  onChange={(e) => updateRow(pair.id, "key", e.target.value)}
                  placeholder={keyPlaceholder}
                />
              </td>
              <td className="px-1 py-1">
                <Input
                  className="h-8 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                  value={pair.value}
                  onChange={(e) => updateRow(pair.id, "value", e.target.value)}
                  placeholder={valuePlaceholder}
                />
              </td>
              <td className="px-1 py-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(pair.id)}
                  aria-label={deleteLabel}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t px-2 py-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addRow}>
          <Plus className="mr-1 h-3 w-3" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

/** Inline array editor for args in array mode */
function ArrayEditor({
  items,
  onChange,
  placeholder,
  addLabel,
  deleteLabel,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  addLabel: string;
  deleteLabel: string;
}) {
  const updateItem = (idx: number, val: string) => {
    const next = [...items];
    next[idx] = val;
    onChange(next);
  };
  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };
  const addItem = () => {
    onChange([...items, ""]);
  };

  return (
    <div className="rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-medium">{placeholder}</th>
            <th className="w-10 px-2 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-t">
              <td className="px-1 py-1">
                <Input
                  className="h-8 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                  value={item}
                  onChange={(e) => updateItem(idx, e.target.value)}
                  placeholder={placeholder}
                />
              </td>
              <td className="px-1 py-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(idx)}
                  aria-label={deleteLabel}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t px-2 py-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addItem}>
          <Plus className="mr-1 h-3 w-3" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

export function TenantAdminToolsPage() {
  const { t } = useI18n();
  const { rawArray, isLoading, error } = useAvailableMcpConfig();
  const { mutateAsync: createTenantTool, isPending: isCreating } = useCreateTenantMCPServer();
  const { mutateAsync: updateTenantTool, isPending: isUpdating } = useUpdateSingleTenantMCPServer();
  const { mutateAsync: toggleTenantTool } = useEnableTenantMCPServer();
  const { mutateAsync: deleteTenantTool } = useDeleteTenantMCPServer();
  const { mutateAsync: pingTool, isPending: isPinging } = usePingMCPServer();
  const { mutateAsync: checkHealth, isPending: isChecking } = useCheckMCPHealth();
  const saving = isCreating || isUpdating;

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editor, setEditor] = useState<ToolEditor>(EMPTY_EDITOR);

  // Args: mode-switched between KV, array, and JSON
  const [argsMode, setArgsMode] = useState<"kv" | "array" | "json">("array");
  const [argsPairs, setArgsPairs] = useState<KeyValuePair[]>([]);
  const [argsArrayItems, setArgsArrayItems] = useState<string[]>([]);
  const [argsJsonText, setArgsJsonText] = useState<string>(stringifyPretty([]));

  // Env: mode-switched between KV, array, and JSON
  const [envMode, setEnvMode] = useState<"kv" | "array" | "json">("kv");
  const [envPairs, setEnvPairs] = useState<KeyValuePair[]>([]);
  const [envArrayItems, setEnvArrayItems] = useState<string[]>([]);
  const [envJsonText, setEnvJsonText] = useState<string>(stringifyPretty({}));

  // Headers: mode-switched between KV, array, and JSON
  const [headersMode, setHeadersMode] = useState<"kv" | "array" | "json">("kv");
  const [headersPairs, setHeadersPairs] = useState<KeyValuePair[]>([]);
  const [headersArrayItems, setHeadersArrayItems] = useState<string[]>([]);
  const [headersJsonText, setHeadersJsonText] = useState<string>(stringifyPretty({}));

  const [oauthText, setOauthText] = useState<string>("null");
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [togglingName, setTogglingName] = useState<string | null>(null);
  const [checkingHealthName, setCheckingHealthName] = useState<string | null>(null);
  const [expandedToolName, setExpandedToolName] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<McpToolInfo[]>([]);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; toolsCount?: number } | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "builtin" | "custom">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "stdio" | "sse" | "http">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");

  const visibleTools = useMemo(
    () => rawArray
      .filter((item) => item.source === "platform_builtin" || item.source === "tenant_shared")
      .sort((a, b) => {
        const sourceOrder = a.source === b.source ? 0 : a.source === "platform_builtin" ? -1 : 1;
        if (sourceOrder !== 0) return sourceOrder;
        return a.name.localeCompare(b.name);
      }),
    [rawArray],
  );

  const filteredTools = useMemo(() => {
    return visibleTools.filter((tool) => {
      const matchesSearch = searchTerm === "" ||
        tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tool.description && tool.description.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesSource = sourceFilter === "all" ||
        (sourceFilter === "builtin" && tool.source === "platform_builtin") ||
        (sourceFilter === "custom" && tool.source === "tenant_shared");

      const matchesType = typeFilter === "all" || tool.type === typeFilter;

      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "enabled" && tool.enabled !== false) ||
        (statusFilter === "disabled" && tool.enabled === false);

      return matchesSearch && matchesSource && matchesType && matchesStatus;
    });
  }, [visibleTools, searchTerm, sourceFilter, typeFilter, statusFilter]);

  const visibleToolNames = useMemo(() => new Set(visibleTools.map((item) => item.name)), [visibleTools]);

  // Helper to set all args-related state from a parsed value
  const setArgsFromValue = (value: string[] | Record<string, string>) => {
    if (Array.isArray(value)) {
      setArgsArrayItems(value);
      setArgsPairs([]);
      setArgsJsonText(stringifyPretty(value));
    } else {
      setArgsPairs(recordToPairs(value));
      setArgsArrayItems([]);
      setArgsJsonText(stringifyPretty(value));
    }
  };

  const resetForm = () => {
    setEditingName(null);
    setEditor(EMPTY_EDITOR);
    setArgsMode("array");
    setArgsPairs([]);
    setArgsArrayItems([]);
    setArgsJsonText(stringifyPretty([]));
    setEnvMode("kv");
    setEnvPairs([]);
    setEnvArrayItems([]);
    setEnvJsonText(stringifyPretty({}));
    setHeadersMode("kv");
    setHeadersPairs([]);
    setHeadersArrayItems([]);
    setHeadersJsonText(stringifyPretty({}));
    setOauthText("null");
    setDialogError(null);
    setTestResult(null);
    setTemplateId("");
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (name: string, config: MCPServerConfig) => {
    setEditingName(name);
    setEditor({
      name,
      config: {
        ...config,
        args: config.args ?? [],
        env: config.env ?? {},
        headers: config.headers ?? {},
      },
    });
    // Detect args shape: if all items look like key=value pairs, default to KV mode
    const args = config.args ?? [];
    const looksLikeKV =
      Array.isArray(args) &&
      args.length > 0 &&
      args.every((item) => typeof item === "string" && item.includes("="));
    if (looksLikeKV) {
      // Convert string array like ["key=value"] to KV pairs
      const record: Record<string, string> = {};
      for (const item of args) {
        const eqIdx = item.indexOf("=");
        if (eqIdx > 0) {
          record[item.slice(0, eqIdx)] = item.slice(eqIdx + 1);
        }
      }
      setArgsMode("kv");
      setArgsPairs(recordToPairs(record));
      setArgsArrayItems([]);
    } else {
      setArgsMode("array");
      setArgsPairs([]);
      setArgsArrayItems(Array.isArray(args) ? args : []);
    }
    setArgsJsonText(stringifyPretty(args));
    setEnvMode("kv");
    setEnvPairs(recordToPairs(config.env ?? {}));
    setEnvArrayItems([]);
    setEnvJsonText(stringifyPretty(config.env ?? {}));
    setHeadersMode("kv");
    setHeadersPairs(recordToPairs(config.headers ?? {}));
    setHeadersArrayItems([]);
    setHeadersJsonText(stringifyPretty(config.headers ?? {}));
    setOauthText(stringifyPretty(config.oauth ?? null));
    setDialogError(null);
    setTemplateId("");
    setOpen(true);
  };

  const applyMcpTemplate = (id: string) => {
    const tmpl = getMcpTemplateById(id);
    if (!tmpl) return;
    setTemplateId(id);
    setEditor((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        type: tmpl.type,
        command: tmpl.command ?? prev.config.command,
        url: tmpl.url ?? prev.config.url,
        description: tmpl.description,
      },
    }));
    // Args: always use array mode for templates
    setArgsMode("array");
    setArgsArrayItems(tmpl.args);
    setArgsPairs([]);
    setArgsJsonText(stringifyPretty(tmpl.args));
    setEnvMode("kv");
    setEnvPairs(recordToPairs(tmpl.env));
    setEnvArrayItems([]);
    setEnvJsonText(stringifyPretty(tmpl.env));
    setHeadersMode("kv");
    setHeadersPairs(recordToPairs(tmpl.headers));
    setHeadersArrayItems([]);
    setHeadersJsonText(stringifyPretty(tmpl.headers));
  };

  const sourceLabel = (source: string) => {
    if (source === "platform_builtin") return t.tenantAdmin.tools.sourceBuiltinLabel;
    if (source === "tenant_shared") return t.tenantAdmin.tools.sourceTenantLabel;
    return source;
  };

  const parseJsonOrThrow = <T,>(
    rawText: string,
    fieldLabel: string,
    guard: (value: unknown) => value is T,
  ): T => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error(t.tenantAdmin.tools.jsonInvalid(fieldLabel));
    }
    if (!guard(parsed)) {
      throw new Error(t.tenantAdmin.tools.jsonStructureError(fieldLabel));
    }
    return parsed;
  };

  const buildEditorPayload = () => {
    const trimmedName = editor.name.trim();
    if (!trimmedName) {
      throw new Error(t.tenantAdmin.tools.nameRequired);
    }
    if (!TOOL_NAME_PATTERN.test(trimmedName)) {
      throw new Error(t.tenantAdmin.tools.nameInvalid);
    }
    if (!editingName && visibleToolNames.has(trimmedName)) {
      throw new Error(t.tenantAdmin.tools.nameExists);
    }

    const type = (editor.config.type || "stdio").trim().toLowerCase();
    if (!["stdio", "sse", "http"].includes(type)) {
      throw new Error(t.tenantAdmin.tools.typeInvalid);
    }

    // Derive args from current mode
    let args: string[];
    if (argsMode === "kv") {
      args = Object.entries(pairsToRecord(argsPairs)).map(([k, v]) => `${k}=${v}`);
    } else if (argsMode === "array") {
      args = argsArrayItems.filter((v) => v !== "");
    } else {
      args = parseJsonOrThrow(argsJsonText.trim() === "" ? "[]" : argsJsonText, "Args", isStringArray);
    }

    // Derive env from current mode
    let env: Record<string, string>;
    if (envMode === "kv") {
      env = pairsToRecord(envPairs);
    } else if (envMode === "array") {
      // Convert array like ["KEY=value"] to record
      env = {};
      for (const item of envArrayItems.filter((v) => v !== "")) {
        const eqIdx = item.indexOf("=");
        if (eqIdx > 0) {
          env[item.slice(0, eqIdx)] = item.slice(eqIdx + 1);
        }
      }
    } else {
      env = parseJsonOrThrow(envJsonText.trim() === "" ? "{}" : envJsonText, "Env", isStringRecord);
    }

    // Derive headers from current mode
    let headers: Record<string, string>;
    if (headersMode === "kv") {
      headers = pairsToRecord(headersPairs);
    } else if (headersMode === "array") {
      // Convert array like ["Header: value"] to record
      headers = {};
      for (const item of headersArrayItems.filter((v) => v !== "")) {
        const colonIdx = item.indexOf(":");
        if (colonIdx > 0) {
          headers[item.slice(0, colonIdx).trim()] = item.slice(colonIdx + 1).trim();
        }
      }
    } else {
      headers = parseJsonOrThrow(headersJsonText.trim() === "" ? "{}" : headersJsonText, "Headers", isStringRecord);
    }

    const oauth = parseJsonOrThrow(oauthText.trim() === "" ? "null" : oauthText, "OAuth", isObjectOrNull);

    const payload: MCPServerConfig = {
      enabled: editor.config.enabled ?? true,
      type,
      args,
      env,
      headers,
      description: (editor.config.description ?? "").trim(),
    };

    if (type === "stdio") {
      const command = (editor.config.command ?? "").trim();
      if (!command) {
        throw new Error(t.tenantAdmin.tools.commandRequired);
      }
      payload.command = command;
      payload.url = undefined;
      payload.oauth = undefined;
    } else {
      const urlText = (editor.config.url ?? "").trim();
      if (!urlText) {
        throw new Error(t.tenantAdmin.tools.urlRequired);
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlText);
      } catch {
        throw new Error(t.tenantAdmin.tools.urlInvalid);
      }
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error(t.tenantAdmin.tools.urlInvalid);
      }
      payload.url = parsedUrl.toString();
      payload.command = undefined;
      payload.oauth = oauth as unknown as MCPServerConfig["oauth"];
    }

    return { name: trimmedName, config: payload };
  };

  const testConnection = async () => {
    setDialogError(null);
    setTestResult(null);
    try {
      const payload = buildEditorPayload();
      const result = await pingTool({ name: payload.name, config: payload.config });
      const toolsCount = typeof result?.tools_count === "number" ? result.tools_count : undefined;
      const message = toolsCount !== undefined ? t.tenantAdmin.tools.testSuccessWithCount(toolsCount) : t.tenantAdmin.tools.testSuccess;
      setTestResult({ success: true, message, toolsCount });
      toast.success(message);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.tenantAdmin.tools.testFailed;
      setDialogError(message);
      setTestResult({ success: false, message });
      toast.error(message);
    }
  };

  const save = async () => {
    setDialogError(null);
    try {
      const payload = buildEditorPayload();
      if (editingName) {
        await updateTenantTool({ name: editingName, config: payload.config });
        toast.success(t.tenantAdmin.tools.updateSuccess);
      } else {
        await createTenantTool({ name: payload.name, config: payload.config });
        toast.success(t.tenantAdmin.tools.createSuccess);
      }
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.tenantAdmin.tools.save;
      setDialogError(message);
      toast.error(message);
    }
  };

  const handleDelete = async (toolName: string) => {
    try {
      setDeletingName(toolName);
      await deleteTenantTool({ name: toolName });
      toast.success(t.tenantAdmin.tools.deleteSuccess);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.tenantAdmin.tools.delete);
    } finally {
      setDeletingName(null);
    }
  };

  const handleToggle = async (toolName: string, enabled: boolean) => {
    try {
      setTogglingName(toolName);
      await toggleTenantTool({ serverName: toolName, enabled });
      toast.success(enabled ? t.tenantAdmin.tools.statusEnabled : t.tenantAdmin.tools.statusDisabled);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.tenantAdmin.tools.save);
    } finally {
      setTogglingName(null);
    }
  };

  const handleCheckHealth = async (toolName: string) => {
    // Toggle collapse if already expanded
    if (expandedToolName === toolName) {
      setExpandedToolName(null);
      setExpandedTools([]);
      return;
    }
    try {
      setCheckingHealthName(toolName);
      const result = await checkHealth(toolName);
      setExpandedTools(result.tools ?? []);
      setExpandedToolName(toolName);
      toast.success(t.tenantAdmin.tools.healthConnected);
    } catch (err) {
      setExpandedTools([]);
      setExpandedToolName(null);
      toast.error(err instanceof Error ? err.message : t.tenantAdmin.tools.testFailed);
    } finally {
      setCheckingHealthName(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t.tenantAdmin.tools.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.tenantAdmin.tools.description}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative w-full max-w-sm">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t.tenantAdmin.tools.searchPlaceholder}
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
              <option value="all">{t.tenantAdmin.tools.sourceAll}</option>
              <option value="builtin">{t.tenantAdmin.tools.sourceBuiltin}</option>
              <option value="custom">{t.tenantAdmin.tools.sourceCustom}</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              <option value="all">{t.tenantAdmin.tools.typeAll}</option>
              <option value="stdio">stdio</option>
              <option value="sse">sse</option>
              <option value="http">http</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              <option value="all">{t.tenantAdmin.tools.statusAll}</option>
              <option value="enabled">{t.tenantAdmin.tools.statusEnabled}</option>
              <option value="disabled">{t.tenantAdmin.tools.statusDisabled}</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            {t.tenantAdmin.tools.count(filteredTools.length)}
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t.tenantAdmin.tools.register}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t.tenantAdmin.tools.columns.name}</th>
              <th className="px-4 py-2 font-medium">{t.tenantAdmin.tools.columns.source}</th>
              <th className="px-4 py-2 font-medium">{t.tenantAdmin.tools.columns.type}</th>
              <th className="px-4 py-2 font-medium">{t.tenantAdmin.tools.healthLabel}</th>
              <th className="px-4 py-2 font-medium">{t.tenantAdmin.tools.columns.status}</th>
              <th className="px-4 py-2 font-medium">{t.tenantAdmin.tools.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                  {t.common.loading}
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td className="px-4 py-6 text-destructive" colSpan={6}>
                  {error.message}
                </td>
              </tr>
            ) : filteredTools.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                  {searchTerm || sourceFilter !== "all" || typeFilter !== "all" || statusFilter !== "all" ? t.tenantAdmin.tools.emptyFiltered : t.tenantAdmin.tools.empty}
                </td>
              </tr>
            ) : (
              filteredTools.map((tool) => {
                const isTenantShared = tool.source === "tenant_shared";
                const canToggle = tool.source === "platform_builtin" || tool.source === "tenant_shared";
                return (
                  <React.Fragment key={tool.name}>
                    <tr className="border-t">
                      <td className="px-4 py-3">
                        <div className="font-medium">{tool.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{tool.description || "-"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          tool.source === "platform_builtin"
                            ? "rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700"
                            : isTenantShared
                            ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700"
                            : "rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700"
                        }
                      >
                        {sourceLabel(tool.source)}
                      </span>
                    </td>
                    <td className="px-4 py-3 uppercase">{tool.type}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${
                            tool.health_status === "connected" ? "bg-emerald-500" :
                            tool.health_status === "disconnected" ? "bg-red-500" :
                            "bg-amber-400"
                          }`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {tool.health_status === "connected" ? t.tenantAdmin.tools.healthConnected :
                           tool.health_status === "disconnected" ? t.tenantAdmin.tools.healthDisconnected :
                           t.tenantAdmin.tools.healthUnknown}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          aria-label={`${tool.name} ${t.tenantAdmin.tools.columns.status}`}
                          checked={tool.enabled !== false}
                          disabled={!canToggle || togglingName === tool.name}
                          onCheckedChange={(checked) => void handleToggle(tool.name, checked)}
                        />
                        {togglingName === tool.name && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={checkingHealthName === tool.name}
                          className="h-7 w-7"
                          aria-label={t.tenantAdmin.tools.checkHealth}
                          onClick={() => void handleCheckHealth(tool.name)}
                        >
                          {checkingHealthName === tool.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                        </Button>
                        {isTenantShared ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(tool.name, tool)}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              {t.tenantAdmin.tools.edit}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deletingName === tool.name}
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              aria-label={`${t.common.delete} ${tool.name}`}
                              onClick={() => {
                                if (!confirm(t.tenantAdmin.tools.deleteConfirm)) return;
                                void handleDelete(tool.name);
                              }}
                            >
                              {deletingName === tool.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled
                            className="h-7 w-7 text-muted-foreground"
                            aria-label={t.common.delete}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedToolName === tool.name && (
                    <tr key={`${tool.name}-tools`} className="bg-muted/20">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="text-xs text-muted-foreground mb-2 font-medium">
                          {t.tenantAdmin.tools.toolsCount(expandedTools.length)}
                        </div>
                        {expandedTools.length === 0 ? (
                          <span className="text-xs text-muted-foreground">{t.tenantAdmin.tools.noToolsFound}</span>
                        ) : (
                          <div className="space-y-1">
                            {expandedTools.map((toolItem) => (
                              <Collapsible key={toolItem.name} className="group">
                                <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium hover:underline w-full text-left">
                                  <ChevronRight className="h-3 w-3 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                  {toolItem.name}
                                </CollapsibleTrigger>
                                <CollapsibleContent className="ml-4 mt-1 space-y-1">
                                  <p className="text-xs text-muted-foreground">
                                    {toolItem.description || t.tenantAdmin.tools.noDescription}
                                  </p>
                                  {toolItem.input_schema && Object.keys(toolItem.input_schema).length > 0 && (
                                    <div>
                                      <span className="text-[10px] font-medium text-muted-foreground">
                                        {t.tenantAdmin.tools.inputSchema}
                                      </span>
                                      <pre className="text-[10px] bg-muted p-2 rounded mt-1 overflow-x-auto max-h-32">
                                        {JSON.stringify(toolItem.input_schema, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </CollapsibleContent>
                              </Collapsible>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingName ? t.tenantAdmin.tools.editTitle : t.tenantAdmin.tools.registerTitle}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            {/* Template selector — only when creating (not editing) */}
            {!editingName && (
              <div className="grid gap-1">
                <label className="text-sm font-medium">{t.tenantAdmin.tools.templateLabel}</label>
                <Select value={templateId} onValueChange={applyMcpTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.tenantAdmin.tools.templatePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {MCP_TEMPLATES.map((tmpl) => (
                      <div key={tmpl.id} className="flex flex-col">
                        <SelectItem value={tmpl.id}>
                          {tmpl.label}
                        </SelectItem>
                        {tmpl.description && (
                          <div className="px-8 pb-1.5 text-xs text-muted-foreground -mt-1 pointer-events-none select-none">
                            {tmpl.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-1">
              <label className="text-sm font-medium" htmlFor="tenant-tool-name">
                {t.tenantAdmin.tools.nameLabel}
              </label>
              <Input
                id="tenant-tool-name"
                value={editor.name}
                disabled={Boolean(editingName)}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setEditor((prev) => ({ ...prev, name: e.target.value }))
                }
              />
              <div className="text-xs text-muted-foreground">{t.tenantAdmin.tools.nameInvalid}</div>
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium" htmlFor="tenant-tool-type">
                {t.tenantAdmin.tools.typeLabel}
              </label>
              <Select
                value={editor.config.type}
                onValueChange={(value) =>
                  setEditor((prev) => ({ ...prev, config: { ...prev.config, type: value } }))
                }
              >
                <SelectTrigger id="tenant-tool-type" aria-label={t.tenantAdmin.tools.typeLabel}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="sse">sse</SelectItem>
                  <SelectItem value="http">http</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editor.config.type === "stdio" ? (
              <div className="grid gap-1">
                <label className="text-sm font-medium" htmlFor="tenant-tool-command">
                  {t.tenantAdmin.tools.commandLabel}
                </label>
                <Input
                  id="tenant-tool-command"
                  value={editor.config.command ?? ""}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEditor((prev) => ({
                      ...prev,
                      config: { ...prev.config, command: e.target.value },
                    }))
                  }
                />
              </div>
            ) : (
              <div className="grid gap-1">
                <label className="text-sm font-medium" htmlFor="tenant-tool-url">
                  {t.tenantAdmin.tools.urlLabel}
                </label>
                <Input
                  id="tenant-tool-url"
                  value={editor.config.url ?? ""}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEditor((prev) => ({
                      ...prev,
                      config: { ...prev.config, url: e.target.value },
                    }))
                  }
                />
              </div>
            )}

            {/* Args: KV / Array / JSON mode switch */}
            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t.tenantAdmin.tools.argsLabel}</label>
                <div className="flex items-center gap-1">
                  <Button
                    variant={argsMode === "kv" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setArgsMode("kv")}
                  >
                    {t.tenantAdmin.tools.kvMode}
                  </Button>
                  <Button
                    variant={argsMode === "array" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setArgsMode("array")}
                  >
                    {t.tenantAdmin.tools.arrayMode}
                  </Button>
                  <Button
                    variant={argsMode === "json" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setArgsMode("json")}
                  >
                    {t.tenantAdmin.tools.jsonMode}
                  </Button>
                </div>
              </div>
              {argsMode === "kv" ? (
                <KeyValueTable
                  pairs={argsPairs}
                  onChange={setArgsPairs}
                  keyPlaceholder={t.tenantAdmin.tools.kvKeyPlaceholder}
                  valuePlaceholder={t.tenantAdmin.tools.kvValuePlaceholder}
                  addLabel={t.tenantAdmin.tools.kvAddRow}
                  deleteLabel={t.tenantAdmin.tools.deleteRow}
                />
              ) : argsMode === "array" ? (
                <ArrayEditor
                  items={argsArrayItems}
                  onChange={setArgsArrayItems}
                  placeholder={t.tenantAdmin.tools.argsPlaceholder}
                  addLabel={t.tenantAdmin.tools.kvAddRow}
                  deleteLabel={t.tenantAdmin.tools.deleteRow}
                />
              ) : (
                <Textarea
                  id="tenant-tool-args"
                  rows={4}
                  value={argsJsonText}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setArgsJsonText(e.target.value)}
                  placeholder={t.tenantAdmin.tools.argsPlaceholder}
                />
              )}
            </div>

            {/* Env: KV / Array / JSON mode switch */}
            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t.tenantAdmin.tools.envLabel}</label>
                <div className="flex items-center gap-1">
                  <Button
                    variant={envMode === "kv" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEnvMode("kv")}
                  >
                    {t.tenantAdmin.tools.kvMode}
                  </Button>
                  <Button
                    variant={envMode === "array" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEnvMode("array")}
                  >
                    {t.tenantAdmin.tools.arrayMode}
                  </Button>
                  <Button
                    variant={envMode === "json" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEnvMode("json")}
                  >
                    {t.tenantAdmin.tools.jsonMode}
                  </Button>
                </div>
              </div>
              {envMode === "kv" ? (
                <KeyValueTable
                  pairs={envPairs}
                  onChange={setEnvPairs}
                  keyPlaceholder={t.tenantAdmin.tools.kvKeyPlaceholder}
                  valuePlaceholder={t.tenantAdmin.tools.kvValuePlaceholder}
                  addLabel={t.tenantAdmin.tools.kvAddRow}
                  deleteLabel={t.tenantAdmin.tools.deleteRow}
                />
              ) : envMode === "array" ? (
                <ArrayEditor
                  items={envArrayItems}
                  onChange={setEnvArrayItems}
                  placeholder={t.tenantAdmin.tools.envPlaceholder}
                  addLabel={t.tenantAdmin.tools.kvAddRow}
                  deleteLabel={t.tenantAdmin.tools.deleteRow}
                />
              ) : (
                <Textarea
                  id="tenant-tool-env"
                  rows={4}
                  value={envJsonText}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEnvJsonText(e.target.value)}
                  placeholder={t.tenantAdmin.tools.envPlaceholder}
                />
              )}
            </div>

            {/* Headers: KV / Array / JSON mode switch */}
            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t.tenantAdmin.tools.headersLabel}</label>
                <div className="flex items-center gap-1">
                  <Button
                    variant={headersMode === "kv" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setHeadersMode("kv")}
                  >
                    {t.tenantAdmin.tools.kvMode}
                  </Button>
                  <Button
                    variant={headersMode === "array" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setHeadersMode("array")}
                  >
                    {t.tenantAdmin.tools.arrayMode}
                  </Button>
                  <Button
                    variant={headersMode === "json" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setHeadersMode("json")}
                  >
                    {t.tenantAdmin.tools.jsonMode}
                  </Button>
                </div>
              </div>
              {headersMode === "kv" ? (
                <KeyValueTable
                  pairs={headersPairs}
                  onChange={setHeadersPairs}
                  keyPlaceholder={t.tenantAdmin.tools.kvKeyPlaceholder}
                  valuePlaceholder={t.tenantAdmin.tools.kvValuePlaceholder}
                  addLabel={t.tenantAdmin.tools.kvAddRow}
                  deleteLabel={t.tenantAdmin.tools.deleteRow}
                />
              ) : headersMode === "array" ? (
                <ArrayEditor
                  items={headersArrayItems}
                  onChange={setHeadersArrayItems}
                  placeholder={t.tenantAdmin.tools.headersPlaceholder}
                  addLabel={t.tenantAdmin.tools.kvAddRow}
                  deleteLabel={t.tenantAdmin.tools.deleteRow}
                />
              ) : (
                <Textarea
                  id="tenant-tool-headers"
                  rows={4}
                  value={headersJsonText}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setHeadersJsonText(e.target.value)}
                  placeholder={t.tenantAdmin.tools.headersPlaceholder}
                />
              )}
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium" htmlFor="tenant-tool-oauth">
                {t.tenantAdmin.tools.oauthLabel}
              </label>
              <Textarea
                id="tenant-tool-oauth"
                rows={4}
                value={oauthText}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setOauthText(e.target.value)}
                placeholder={t.tenantAdmin.tools.oauthPlaceholder}
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium" htmlFor="tenant-tool-description">
                {t.tenantAdmin.tools.descriptionLabel}
              </label>
              <Input
                id="tenant-tool-description"
                value={editor.config.description ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setEditor((prev) => ({
                    ...prev,
                    config: { ...prev.config, description: e.target.value },
                  }))
                }
              />
            </div>
          </div>

          {dialogError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {dialogError}
            </div>
          )}

          {testResult && (
            <div
              className={`rounded-md px-4 py-3 text-sm ${
                testResult.success
                  ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <>
                    <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium">{testResult.message}</span>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="font-medium">{testResult.message}</span>
                  </>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.tenantAdmin.tools.cancel}
            </Button>
            <Button variant="outline" onClick={() => void testConnection()} disabled={saving || isPinging}>
              {isPinging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube2 className="mr-2 h-4 w-4" />}
              {t.tenantAdmin.tools.testConnection}
            </Button>
            <Button onClick={() => void save()} disabled={saving || isPinging}>
              {(saving || isPinging) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.tenantAdmin.tools.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
