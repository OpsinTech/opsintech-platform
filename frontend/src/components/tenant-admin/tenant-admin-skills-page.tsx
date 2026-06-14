"use client";

import { Pencil, Plus, Trash2, Upload, SearchIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/core/i18n/hooks";
import {
  useAvailableSkills,
  useCreateTenantSkill,
  useDeleteTenantSkill,
  useImportTenantSkill,
  usePatchTenantSkill,
  useUpdateTenantSkill,
} from "@/core/skills/hooks";
import type { AvailableSkillResponse } from "@/core/skills/type";

export function TenantAdminSkillsPage() {
  const { t } = useI18n();
  const { skills, isLoading, error } = useAvailableSkills();
  const { mutateAsync: updateTenantSkill } = useUpdateTenantSkill();
  const { mutateAsync: deleteTenantSkill } = useDeleteTenantSkill();
  const { mutateAsync: createTenantSkill } = useCreateTenantSkill();
  const { mutateAsync: importTenantSkill, isPending: isImportingSkill } = useImportTenantSkill();
  const { mutateAsync: patchTenantSkill } = usePatchTenantSkill();
  const [open, setOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"manual" | "import">("manual");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [boundToolsText, setBoundToolsText] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [strategy, setStrategy] = useState("default");
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const builtInSkills = useMemo(() => skills.filter((item) => item.scope === "global"), [skills]);
  const customSkills = useMemo(() => skills.filter((item) => item.scope === "tenant"), [skills]);

  const filteredBuiltInSkills = useMemo(() => {
    return builtInSkills.filter((skill) => {
      // 搜索过滤
      const matchesSearch = searchTerm === "" || 
        skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (skill.description && skill.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (skill.bound_tools?.join(", ").toLowerCase().includes(searchTerm.toLowerCase()));
      
      // 状态过滤
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "enabled" && skill.enabled !== false) ||
        (statusFilter === "disabled" && skill.enabled === false);
      
      return matchesSearch && matchesStatus;
    });
  }, [builtInSkills, searchTerm, statusFilter]);

  const filteredCustomSkills = useMemo(() => {
    return customSkills.filter((skill) => {
      // 搜索过滤
      const matchesSearch = searchTerm === "" || 
        skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (skill.description && skill.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (skill.bound_tools?.join(", ").toLowerCase().includes(searchTerm.toLowerCase()));
      
      // 状态过滤
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "enabled" && skill.enabled !== false) ||
        (statusFilter === "disabled" && skill.enabled === false);
      
      return matchesSearch && matchesStatus;
    });
  }, [customSkills, searchTerm, statusFilter]);

  const openCreate = () => {
    setDialogMode("manual");
    setEditingName(null);
    setSkillName("");
    setSkillDescription("");
    setInstructions("");
    setBoundToolsText("");
    setPromptTemplate("");
    setStrategy("default");
    setArchiveFile(null);
    setImportError(null);
    setOpen(true);
  };

  const openEdit = (skill: {
    name: string;
    description?: string;
    instructions?: string | null;
    bound_tools?: string[];
    prompt_template?: string | null;
    strategy?: string | null;
  }) => {
    setDialogMode("manual");
    setEditingName(skill.name);
    setSkillName(skill.name);
    setSkillDescription(skill.description ?? "");
    setInstructions(skill.instructions ?? "");
    setBoundToolsText((skill.bound_tools ?? []).join(", "));
    setPromptTemplate(skill.prompt_template ?? "");
    setStrategy(skill.strategy ?? "default");
    setArchiveFile(null);
    setImportError(null);
    setOpen(true);
  };

  const parseBoundTools = () =>
    boundToolsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const handleArchiveSelect = (file: File | null) => {
    setImportError(null);
    if (!file) {
      setArchiveFile(null);
      return;
    }
    if (file.name.endsWith(".skill") || file.name.endsWith(".zip")) {
      setArchiveFile(file);
      return;
    }
    setArchiveFile(null);
    toast.error(t.tenantAdmin.skills.fileInvalid);
  };

  const openArchivePicker = () => {
    fileInputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleArchiveSelect(e.dataTransfer.files?.[0] ?? null);
  };

  const save = async () => {
    try {
      setImportError(null);
      if (dialogMode === "import" && !editingName) {
        if (!archiveFile) {
          toast.error(t.tenantAdmin.skills.fileRequired);
          return;
        }
        await importTenantSkill(archiveFile);
        toast.success(t.tenantAdmin.skills.importSuccess);
        setOpen(false);
        return;
      }

      if (!skillName.trim()) {
        toast.error(t.tenantAdmin.skills.nameRequired);
        return;
      }
      if (!skillDescription.trim()) {
        toast.error(t.tenantAdmin.skills.descriptionRequired);
        return;
      }

      if (editingName) {
        await patchTenantSkill({
          skillName: editingName,
          description: skillDescription.trim(),
          instructions: instructions.trim() || null,
          bound_tools: parseBoundTools(),
          prompt_template: promptTemplate || null,
          strategy,
        });
        toast.success(t.tenantAdmin.skills.updateSuccess);
      } else {
        await createTenantSkill({
          name: skillName.trim(),
          description: skillDescription.trim(),
          instructions: instructions.trim() || null,
          enabled: true,
          bound_tools: parseBoundTools(),
          prompt_template: promptTemplate || null,
          strategy,
        });
        toast.success(t.tenantAdmin.skills.createSuccess);
      }
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.tenantAdmin.skills.importError;
      if (dialogMode === "import" && !editingName) {
        setImportError(message);
      }
      toast.error(message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.tenantAdmin.skills.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.tenantAdmin.skills.description}
          </p>
        </div>
      </div>

      <Tabs defaultValue="builtin" className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <TabsList>
              <TabsTrigger value="builtin">{t.tenantAdmin.skills.tabs.builtin} ({filteredBuiltInSkills.length})</TabsTrigger>
              <TabsTrigger value="custom">{t.tenantAdmin.skills.tabs.custom} ({filteredCustomSkills.length})</TabsTrigger>
            </TabsList>
            <div className="relative w-full max-w-xs">
              <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t.tenantAdmin.skills.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 max-w-xs"
              />
            </div>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-9 w-[120px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">{t.tenantAdmin.skills.statusAll}</option>
              <option value="enabled">{t.tenantAdmin.skills.statusEnabled}</option>
              <option value="disabled">{t.tenantAdmin.skills.statusDisabled}</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">
              {t.tenantAdmin.skills.count(filteredBuiltInSkills.length + filteredCustomSkills.length)}
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              {t.tenantAdmin.skills.create}
            </Button>
          </div>
        </div>

        <TabsContent value="builtin" className="mt-0">
          <SkillSection
            title=""
            description=""
            skills={filteredBuiltInSkills}
            isLoading={isLoading}
            error={error}
            onToggle={(skillName, enabled) => void updateTenantSkill({ skillName, enabled })}
          />
        </TabsContent>

        <TabsContent value="custom" className="mt-0">
          <SkillSection
            title=""
            description=""
            skills={filteredCustomSkills}
            isLoading={isLoading}
            error={error}
            allowEditing
            onToggle={(skillName, enabled) => void updateTenantSkill({ skillName, enabled })}
            onEdit={openEdit}
            onDelete={(skillName) => {
              if (!confirm(`${t.tenantAdmin.skills.deleteConfirm} ${skillName}?`)) return;
              void deleteTenantSkill(skillName)
                .then(() => toast.success(t.tenantAdmin.skills.deleteSuccess))
                .catch((err) => toast.error(err instanceof Error ? err.message : t.tenantAdmin.skills.importError));
            }}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingName ? t.tenantAdmin.skills.editTitle : dialogMode === "import" ? t.tenantAdmin.skills.importTitle : t.tenantAdmin.skills.createTitle}</DialogTitle>
            <DialogDescription>
              {editingName
                ? ""
                : t.tenantAdmin.skills.importDesc}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={dialogMode}
            onValueChange={(value) => {
              setDialogMode(value as "manual" | "import");
              setArchiveFile(null);
              setIsDragging(false);
              setImportError(null);
            }}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">{t.common.create}</TabsTrigger>
              <TabsTrigger value="import" disabled={Boolean(editingName)}>
                {t.tenantAdmin.skills.import}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="mt-0 max-h-[60vh] overflow-y-auto px-1 py-2">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label htmlFor="tenant-skill-name" className="text-sm font-medium">{t.tenantAdmin.skills.nameLabel} <span className="text-destructive">*</span></label>
                  <Input
                    id="tenant-skill-name"
                    placeholder={t.tenantAdmin.skills.namePlaceholder}
                    value={skillName}
                    disabled={Boolean(editingName)}
                    onChange={(e) => setSkillName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="tenant-skill-description" className="text-sm font-medium">{t.tenantAdmin.skills.descriptionLabel} <span className="text-destructive">*</span></label>
                  <Input
                    id="tenant-skill-description"
                    placeholder={t.tenantAdmin.skills.descriptionPlaceholder}
                    value={skillDescription}
                    onChange={(e) => setSkillDescription(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="tenant-skill-instructions" className="text-sm font-medium">{t.tenantAdmin.skills.instructionsLabel}</label>
                  <Textarea
                    id="tenant-skill-instructions"
                    className="min-h-32"
                    placeholder={t.tenantAdmin.skills.instructionsPlaceholder}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="tenant-skill-bound-tools" className="text-sm font-medium">{t.tenantAdmin.skills.toolsLabel}</label>
                  <Input
                    id="tenant-skill-bound-tools"
                    placeholder={t.tenantAdmin.skills.toolsPlaceholder}
                    value={boundToolsText}
                    onChange={(e) => setBoundToolsText(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="tenant-skill-strategy" className="text-sm font-medium">{t.tenantAdmin.skills.strategyLabel}</label>
                  <Input
                    id="tenant-skill-strategy"
                    placeholder={t.tenantAdmin.skills.strategyPlaceholder}
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="tenant-skill-prompt-template" className="text-sm font-medium">{t.tenantAdmin.skills.promptTemplateLabel}</label>
                  <Textarea
                    id="tenant-skill-prompt-template"
                    className="min-h-24"
                    placeholder={t.tenantAdmin.skills.promptTemplatePlaceholder}
                    value={promptTemplate}
                    onChange={(e) => setPromptTemplate(e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="import" className="mt-0">
              <div className="grid gap-3 py-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  aria-label={t.tenantAdmin.skills.importFileLabel}
                  accept=".skill,.zip,application/zip"
                  className="hidden"
                  onChange={(e) => {
                    handleArchiveSelect(e.target.files?.[0] ?? null);
                    e.currentTarget.value = "";
                  }}
                />
                <div
                  className={`cursor-pointer rounded-lg border-2 border-dashed p-8 transition-colors ${
                    isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={openArchivePicker}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openArchivePicker();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <div className="rounded-full bg-muted p-3">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{t.tenantAdmin.skills.importFileLabel}</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t.tenantAdmin.skills.importFileHint}
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openArchivePicker();
                        }}
                      >
                        {t.tenantAdmin.skills.importFileLabel}
                      </Button>
                      {archiveFile && (
                        <span className="text-sm font-medium text-primary">
                          {archiveFile.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={isImportingSkill || (dialogMode === "import" && !editingName && !archiveFile)}
            >
              {dialogMode === "import" && !editingName
                ? isImportingSkill
                  ? t.tenantAdmin.skills.saving
                  : t.tenantAdmin.skills.import
                : t.tenantAdmin.skills.save}
            </Button>
          </DialogFooter>
          {dialogMode === "import" && !editingName && importError && (
            <p className="text-sm text-destructive">{importError}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkillSection({
  title,
  description,
  skills,
  isLoading,
  error,
  allowEditing = false,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  description: string;
  skills: AvailableSkillResponse[];
  isLoading: boolean;
  error: Error | null;
  allowEditing?: boolean;
  onToggle: (skillName: string, enabled: boolean) => void;
  onEdit?: (skill: AvailableSkillResponse) => void;
  onDelete?: (skillName: string) => void;
}) {
  const { t } = useI18n();
  const rows = skills.length;
  const hasOperations = allowEditing;

  return (
    <div className="space-y-3">
      <div>{title ? <h3 className="text-sm font-semibold">{title}</h3> : null}<p className="text-sm text-muted-foreground">{description}</p></div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="w-[20%] px-4 py-3 font-medium">{t.tenantAdmin.skills.nameLabel}</th>
              <th className="w-[35%] px-4 py-3 font-medium">{t.tenantAdmin.skills.descriptionLabel}</th>
              <th className="w-[20%] px-4 py-3 font-medium">{t.tenantAdmin.skills.toolsLabel}</th>
              <th className="w-[15%] px-4 py-3 font-medium">{t.tenantAdmin.skills.strategyLabel}</th>
              <th className="w-[10%] px-4 py-3 font-medium">{t.tenantAdmin.skills.statusAll}</th>
              {hasOperations && <th className="w-[10%] px-4 py-3 text-right font-medium">操作</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={hasOperations ? 6 : 5}>
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    {t.tenantAdmin.skills.loading}
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td className="px-4 py-8 text-center text-destructive" colSpan={hasOperations ? 6 : 5}>
                  {error.message}
                </td>
              </tr>
            ) : rows === 0 ? (
              <tr>
                <td className="px-4 py-12 text-center text-muted-foreground" colSpan={hasOperations ? 6 : 5}>
                  {t.tenantAdmin.skills.empty}
                </td>
              </tr>
            ) : (
              skills.map((skill) => {
                const canManage = skill.managed_by_current_user !== false;
                const boundTools = (skill.bound_tools ?? []).join(", ") || "-";
                const strategyText = skill.strategy ?? "default";

                return (
                  <tr key={skill.name} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 align-top">
                      <a
                        href={`/workspace/skills/${skill.name}`}
                        className="truncate font-medium text-foreground hover:text-primary transition-colors"
                        title={skill.name}
                        onClick={(e) => {
                          e.preventDefault();
                          window.open(`/workspace/skills/${skill.name}`, "_blank");
                        }}
                      >
                        {skill.name}
                      </a>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="line-clamp-2 truncate text-muted-foreground" title={skill.description}>
                        {skill.description}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="line-clamp-2 truncate text-muted-foreground" title={boundTools}>
                        {boundTools}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="truncate text-muted-foreground" title={strategyText}>
                        {strategyText}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Switch
                        checked={skill.enabled}
                        disabled={!canManage}
                        onCheckedChange={(checked) => onToggle(skill.name, checked)}
                      />
                    </td>
                    {hasOperations && (
                      <td className="px-4 py-3 align-top">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" className="h-8 px-3 text-xs" disabled={!canManage} onClick={() => onEdit?.(skill)}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            {t.tenantAdmin.skills.edit}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            disabled={!canManage}
                            aria-label={`${t.tenantAdmin.skills.delete} ${skill.name}`}
                            onClick={() => onDelete?.(skill.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
