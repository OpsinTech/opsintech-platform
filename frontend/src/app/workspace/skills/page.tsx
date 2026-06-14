"use client";

import { Bot, Plus, SearchIcon, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/core/auth/hooks";
import { useI18n } from "@/core/i18n/hooks";
import { isPlatformAdminRole } from "@/core/permissions/roles";
import { useAvailableSkills, useCreatePersonalSkill, useImportPersonalSkill } from "@/core/skills/hooks";
import type { AvailableSkillResponse } from "@/core/skills/type";

export default function SkillsCenterPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { data: session } = useSession();
  const { skills, isLoading, error } = useAvailableSkills();
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "personal" | "tenant" | "global">("all");

  // Create Skill state
  const [createOpen, setCreateOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"manual" | "import">("manual");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [boundToolsText, setBoundToolsText] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [strategy, setStrategy] = useState("default");
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { mutateAsync: createPersonalSkill, isPending: isCreating } = useCreatePersonalSkill();
  const { mutateAsync: importPersonalSkill, isPending: isImporting } = useImportPersonalSkill();

  const isAdmin = isPlatformAdminRole(session?.user?.role) || session?.user?.role === "tenant_admin";

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "personal" && s.scope === "personal") ||
        (filter === "tenant" && s.scope === "tenant") ||
        (filter === "global" && s.scope === "global");
      const matchesSearch =
        searchTerm === "" ||
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.description || "").toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [skills, searchTerm, filter]);

  const parseBoundTools = () =>
    boundToolsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const handleArchiveSelect = (file: File | null) => {
    if (!file) {
      setArchiveFile(null);
      return;
    }
    if (file.name.endsWith(".skill") || file.name.endsWith(".zip")) {
      setArchiveFile(file);
      return;
    }
    setArchiveFile(null);
    toast.error("只支持 .skill 或 .zip 格式");
  };

  const openArchivePicker = () => {
    fileInputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleArchiveSelect(e.dataTransfer.files?.[0] ?? null);
  };

  const handleCreate = async () => {
    try {
      if (dialogMode === "import") {
        if (!archiveFile) {
          toast.error("请选择要导入的技能包文件");
          return;
        }
        await importPersonalSkill(archiveFile);
        toast.success("导入成功");
        setCreateOpen(false);
        return;
      }

      if (!newName.trim()) {
        toast.error("请输入 Skill 英文名称");
        return;
      }
      if (!/^[a-z0-9_]+$/.test(newName)) {
        toast.error("名称只能包含小写字母、数字和下划线");
        return;
      }
      if (!newDescription.trim()) {
        toast.error("请输入描述");
        return;
      }

      await createPersonalSkill({
        name: newName,
        description: newDescription.trim(),
        instructions: instructions.trim() || null,
        enabled: true,
        bound_tools: parseBoundTools(),
        prompt_template: promptTemplate || null,
        strategy,
      });
      toast.success("创建成功");
      setCreateOpen(false);
      
      // Reset form
      setNewName("");
      setNewDescription("");
      setInstructions("");
      setBoundToolsText("");
      setPromptTemplate("");
      setStrategy("default");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleOpenCreate = () => {
    setDialogMode("manual");
    setNewName("");
    setNewDescription("");
    setInstructions("");
    setBoundToolsText("");
    setPromptTemplate("");
    setStrategy("default");
    setArchiveFile(null);
    setCreateOpen(true);
  };

  return (
    <div className="flex size-full flex-col bg-zinc-50/50 dark:bg-zinc-950/20 overflow-hidden p-6 gap-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.sidebarNav.skillsPlaza}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            浏览和使用前人沉淀的诊断 SOP，或分享你提炼的经验
          </p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="relative w-80">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索 Skill..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="personal">我的 Skill</TabsTrigger>
            <TabsTrigger value="tenant">团队 Skill</TabsTrigger>
            <TabsTrigger value="global">内置</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            新建私有 Skill
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => router.push("/tenant-admin/skills")}>
              管理后台
            </Button>
          )}
        </div>
      </div>

      {/* Skill Grid */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center text-destructive">
            加载失败：{error.message}
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Bot className="h-10 w-10 opacity-30" />
            <p>暂无 Skill</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSkills.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                onClick={() => router.push(`/workspace/skills/${skill.name}`)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>新建私有 Skill</DialogTitle>
            <DialogDescription>
              创建一个仅你自己可见的个人草稿箱，测试完备后也可分享。
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={dialogMode}
            onValueChange={(value) => {
              setDialogMode(value as "manual" | "import");
              setArchiveFile(null);
              setIsDragging(false);
            }}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">{t.common.create}</TabsTrigger>
              <TabsTrigger value="import">{t.tenantAdmin.skills.import}</TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="mt-0 max-h-[60vh] overflow-y-auto px-1 py-2">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label htmlFor="name" className="text-sm font-medium">{t.tenantAdmin.skills.nameLabel} <span className="text-destructive">*</span></label>
                  <Input
                    id="name"
                    placeholder={t.tenantAdmin.skills.namePlaceholder}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">仅限小写字母、数字和下划线，作为系统内部标识</p>
                </div>
                <div className="grid gap-2">
                  <label htmlFor="description" className="text-sm font-medium">{t.tenantAdmin.skills.descriptionLabel} <span className="text-destructive">*</span></label>
                  <Input
                    id="description"
                    placeholder={t.tenantAdmin.skills.descriptionPlaceholder}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="instructions" className="text-sm font-medium">{t.tenantAdmin.skills.instructionsLabel}</label>
                  <Textarea
                    id="instructions"
                    className="min-h-32"
                    placeholder={t.tenantAdmin.skills.instructionsPlaceholder}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="bound-tools" className="text-sm font-medium">{t.tenantAdmin.skills.toolsLabel}</label>
                  <Input
                    id="bound-tools"
                    placeholder={t.tenantAdmin.skills.toolsPlaceholder}
                    value={boundToolsText}
                    onChange={(e) => setBoundToolsText(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="strategy" className="text-sm font-medium">{t.tenantAdmin.skills.strategyLabel}</label>
                  <Input
                    id="strategy"
                    placeholder={t.tenantAdmin.skills.strategyPlaceholder}
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="prompt-template" className="text-sm font-medium">{t.tenantAdmin.skills.promptTemplateLabel}</label>
                  <Textarea
                    id="prompt-template"
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
                      <p className="mt-1 text-sm text-muted-foreground">{t.tenantAdmin.skills.importFileHint}</p>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <Button type="button" variant="outline" onClick={(e) => {
                        e.stopPropagation();
                        openArchivePicker();
                      }}>
                        {t.tenantAdmin.skills.importFileLabel}
                      </Button>
                      {archiveFile && (
                        <span className="text-sm font-medium text-primary">{archiveFile.name}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={isCreating || isImporting || (dialogMode === "import" && !archiveFile)}
            >
              {(isCreating || isImporting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialogMode === "import" ? t.tenantAdmin.skills.import : t.tenantAdmin.skills.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkillCard({
  skill,
  onClick,
}: {
  skill: AvailableSkillResponse;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm truncate">{skill.name}</h3>
            {skill.scope === "global" && (
              <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-700 dark:text-blue-400">
                内置
              </span>
            )}
            {skill.scope === "tenant" && (
              <span className="shrink-0 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-700 dark:text-purple-400">
                团队共享
              </span>
            )}
            {skill.scope === "personal" && (
              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                私有
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
            {skill.description || "暂无描述"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 text-[10px] text-muted-foreground">
        {skill.bound_tools && skill.bound_tools.length > 0 && (
          <span>🔧 {skill.bound_tools.length} 个工具</span>
        )}
        {skill.version !== undefined && skill.version > 0 && (
          <span>v{skill.version}</span>
        )}
        <span className={skill.enabled !== false ? "text-green-600" : "text-muted-foreground"}>
          {skill.enabled !== false ? "● 已启用" : "○ 已禁用"}
        </span>
      </div>
    </div>
  );
}
