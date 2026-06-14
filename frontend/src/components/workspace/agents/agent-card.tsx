"use client";

import {
  BotIcon,
  PenLineIcon,
  Trash2Icon,
  LinkIcon,
  CpuIcon,
  UserIcon,
  InfoIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { useDeleteAgent, useToggleAgent, useSkills } from "@/core/agents";
import type { Agent } from "@/core/agents";
import { useI18n } from "@/core/i18n/hooks";

interface AgentCardProps {
  agent: Agent;
  onEdit?: () => void;
}

export function AgentCard({ agent, onEdit }: AgentCardProps) {
  const { t } = useI18n();
  const deleteAgent = useDeleteAgent();
  const toggleAgent = useToggleAgent();
  const { skills } = useSkills();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Dynamic calculations for capabilities based on user mockup
  const mcpCount = agent.tool_groups?.length ?? 0;
  
  const publicCount = (agent.skills ?? []).filter((sName) => {
    const match = skills.find((s) => s.name === sName);
    return match && match.category === "public";
  }).length;

  const customCount = (agent.skills ?? []).filter((sName) => {
    const match = skills.find((s) => s.name === sName);
    return match && match.category === "custom";
  }).length;

  // Tooltip name lists
  const mcpNames = agent.tool_groups ?? [];
  const publicNames = (agent.skills ?? []).filter((sName) => {
    const match = skills.find((s) => s.name === sName);
    return match && match.category === "public";
  });
  const customNames = (agent.skills ?? []).filter((sName) => {
    const match = skills.find((s) => s.name === sName);
    return match && match.category === "custom";
  });

  async function handleDelete() {
    try {
      await deleteAgent.mutateAsync(agent.name);
      toast.success(t.agents.deleteSuccess);
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleToggle(enabled: boolean) {
    try {
      await toggleAgent.mutateAsync({ name: agent.name, enabled });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const handleCopyPrompt = () => {
    if (agent.system_prompt) {
      navigator.clipboard.writeText(agent.system_prompt);
      setCopied(true);
      toast.success("系统提示词已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <Card 
        className={`group flex flex-col h-full rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-300 relative overflow-hidden p-0 gap-0 ${
          agent.enabled 
            ? "border-zinc-200/80 dark:border-zinc-800/80 hover:-translate-y-0.5 hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 bg-gradient-to-b from-white to-zinc-50/10 dark:from-zinc-900 dark:to-zinc-900/20" 
            : "border-zinc-200/40 dark:border-zinc-800/40 bg-zinc-50/30 dark:bg-zinc-950/10 opacity-60 hover:opacity-75"
        }`}
      >
        {/* Glow decoration for active agent on hover */}
        {agent.enabled && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        )}

        {/* Card Header Row - Highly compact */}
        <CardHeader className="pb-1.5 pt-3 px-4 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div 
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 ${
                  agent.enabled
                    ? "bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 text-indigo-650 dark:text-indigo-400 border-indigo-100/50 dark:border-indigo-900/20 group-hover:scale-105"
                    : "bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500 border-zinc-200/50 dark:border-zinc-700/50"
                }`}
              >
                <BotIcon className={`h-5 w-5 transition-transform duration-500 ${agent.enabled ? "group-hover:rotate-6" : ""}`} />
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate text-sm font-semibold tracking-tight leading-none text-zinc-900 dark:text-zinc-100">
                  {agent.name}
                </CardTitle>
              </div>
            </div>
            <Switch
              checked={agent.enabled}
              onCheckedChange={handleToggle}
              disabled={toggleAgent.isPending}
              className="scale-90 data-[state=checked]:bg-indigo-600 dark:data-[state=checked]:bg-indigo-500"
            />
          </div>
        </CardHeader>

        {/* Card Body content - Slimmer vertical stack */}
        <CardContent className="px-4 pb-2.5 pt-0 flex-1 flex flex-col gap-2.5">
          
          {/* Clickable Description Area - Low profile & flat */}
          <div 
            className="flex items-start gap-2 text-[11px] text-muted-foreground relative overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/40 dark:bg-zinc-900/25 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer group/desc min-h-[42px]"
            onClick={() => setDescOpen(true)}
            title="点击查看系统提示词"
          >
            <InfoIcon className="h-3.5 w-3.5 text-indigo-500/80 shrink-0 mt-0.5 group-hover/desc:scale-110 transition-transform duration-200" />
            <p className="line-clamp-2 leading-relaxed text-zinc-600 dark:text-zinc-400 font-normal">
              {agent.description || t.agents.noDescription}
            </p>
          </div>

          {/* Symmetrical Capabilities Metrics Row - Merged & flat */}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {agent.model ? (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-default items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-purple-50/50 text-purple-650 border-purple-100/50 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30 transition-colors">
                      <CpuIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-[80px]">{agent.model}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    推理模型：{agent.model}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-zinc-50/30 text-zinc-400 border-zinc-200/20 dark:bg-zinc-900/10 dark:text-zinc-500 dark:border-zinc-800/30 transition-colors">
                <CpuIcon className="h-3 w-3 shrink-0" />
                <span>默认</span>
              </span>
            )}
            {mcpCount > 0 ? (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-default items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-blue-50/50 text-blue-650 border-blue-100/50 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30 transition-colors">
                      <LinkIcon className="h-3 w-3 shrink-0" />
                      <span>MCP:{mcpCount}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[240px]">
                    <p className="font-medium mb-0.5">MCP 工具 ({mcpCount})</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {mcpNames.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-zinc-50/30 text-zinc-400 border-zinc-200/20 dark:bg-zinc-900/10 dark:text-zinc-500 dark:border-zinc-800/30 transition-colors">
                <LinkIcon className="h-3 w-3 shrink-0" />
                <span>MCP:0</span>
              </span>
            )}
            {publicCount > 0 ? (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-default items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-amber-50/50 text-amber-650 border-amber-100/50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30 transition-colors">
                      <CpuIcon className="h-3 w-3 shrink-0" />
                      <span>内置:{publicCount}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[240px]">
                    <p className="font-medium mb-0.5">内置技能 ({publicCount})</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {publicNames.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-zinc-50/30 text-zinc-400 border-zinc-200/20 dark:bg-zinc-900/10 dark:text-zinc-500 dark:border-zinc-800/30 transition-colors">
                <CpuIcon className="h-3 w-3 shrink-0" />
                <span>内置:0</span>
              </span>
            )}
            {customCount > 0 ? (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-default items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-emerald-50/50 text-emerald-650 border-emerald-100/50 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30 transition-colors">
                      <UserIcon className="h-3 w-3 shrink-0" />
                      <span>自定义:{customCount}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[240px]">
                    <p className="font-medium mb-0.5">自定义技能 ({customCount})</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {customNames.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border bg-zinc-50/30 text-zinc-400 border-zinc-200/20 dark:bg-zinc-900/10 dark:text-zinc-500 dark:border-zinc-800/30 transition-colors">
                <UserIcon className="h-3 w-3 shrink-0" />
                <span>自定义:0</span>
              </span>
            )}
          </div>

          {/* Tags List Badges - Super compact, no section labels */}
          {agent.tags && agent.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 min-h-[18px]">
              {agent.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-[9px] py-0 px-1.5 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20 text-zinc-500 dark:text-zinc-400 font-normal rounded-md"
                >
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>

        {/* Footer actions - Compact & sleek floating style */}
        <CardFooter className="px-4 pb-3.5 pt-1.5 flex items-center gap-2 mt-auto shrink-0 border-t-0">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 rounded-lg h-8 text-[11px] font-medium border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 flex items-center justify-center gap-1 transition-all shadow-xs"
            onClick={onEdit}
          >
            <PenLineIcon className="h-3 w-3" />
            {t.agents.editLabel}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg h-8 w-8 border-zinc-200 text-zinc-400 hover:text-red-650 hover:bg-red-50/30 hover:border-red-150 dark:border-zinc-800 dark:text-zinc-500 dark:hover:text-red-400 dark:hover:bg-red-950/20 dark:hover:border-red-900/30 flex items-center justify-center transition-all p-0 shadow-xs shrink-0"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon className="h-3 w-3" />
          </Button>
        </CardFooter>
      </Card>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.agents.delete}</DialogTitle>
            <DialogDescription>{t.agents.deleteConfirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteAgent.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteAgent.isPending}
            >
              {deleteAgent.isPending ? t.common.loading : t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Description & System Prompt Details Dialog */}
      <Dialog open={descOpen} onOpenChange={setDescOpen}>
        <DialogContent className="sm:max-w-lg p-6 bg-card text-card-foreground">
          <DialogHeader className="space-y-1 pb-2 border-b">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <BotIcon className="h-5 w-5 text-indigo-500" />
              {agent.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-3 text-sm">
            {/* Description */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">智能体描述</h4>
              <p className="text-foreground leading-relaxed text-sm">
                {agent.description || t.agents.noDescription}
              </p>
            </div>

            {/* Dashed Divider */}
            <div className="border-t border-dashed border-border/80 my-4" />

            {/* System Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">系统提示词</h4>
                {agent.system_prompt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 text-[10px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 flex items-center gap-1"
                    onClick={handleCopyPrompt}
                  >
                    {copied ? (
                      <>
                        <CheckIcon className="h-3 w-3 text-green-500 animate-in fade-in zoom-in duration-200" />
                        <span>已复制</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="h-3 w-3" />
                        <span>复制提示词</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
              {agent.system_prompt ? (
                <div className="bg-zinc-50 dark:bg-zinc-900 border border-border/60 rounded-lg p-3 max-h-[280px] overflow-y-auto font-mono text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {agent.system_prompt}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">暂无系统提示词</p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2 border-t mt-4 sm:justify-end">
            <Button size="sm" onClick={() => setDescOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
