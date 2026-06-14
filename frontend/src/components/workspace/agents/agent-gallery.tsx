"use client";

import { BotIcon, PlusIcon, SearchIcon, RotateCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgents } from "@/core/agents";
import { useI18n } from "@/core/i18n/hooks";

import { AgentCard } from "./agent-card";
import { CreateAgentDialog } from "./create-agent-dialog";
import { EditAgentDialog } from "./edit-agent-dialog";

export function AgentGallery() {
  const { t } = useI18n();
  const { agents, isLoading, refetch } = useAgents();
  const router = useRouter();

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");

  // Dialogs State
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAgentName, setEditingAgentName] = useState<string | null>(null);

  // Filtered agents list searching name, prompt, description, and tags
  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        agent.name.toLowerCase().includes(q) ||
        (agent.description ?? "").toLowerCase().includes(q) ||
        (agent.system_prompt ?? "").toLowerCase().includes(q) ||
        (agent.tags ?? []).some(tag => tag.toLowerCase().includes(q))
      );
    });
  }, [agents, searchQuery]);

  const handleNewAgent = () => {
    setCreateOpen(true);
  };

  const handleReset = () => {
    setSearchQuery("");
  };

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success("刷新成功");
    } catch {
      toast.error("刷新失败");
    }
  };

  return (
    <div className="flex size-full flex-col bg-zinc-50/50 dark:bg-zinc-950/20 overflow-hidden p-6 gap-4 animate-in fade-in duration-300">
      
      {/* Standard OpsinTech Page Header - Consistent with tools & skills manager */}
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.agentGallery.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.agentGallery.description}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar directly below the header */}
      <div className="border border-border/85 rounded-lg bg-card px-6 py-3.5 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-sm shrink-0">
        
        {/* Left Search Box & Reset */}
        <div className="flex w-full sm:w-auto items-center gap-2">
          <div className="relative w-full sm:w-80">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索名称、提示词或标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-background"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-9 px-4 shrink-0 text-xs font-medium border-border/80"
          >
            重置
          </Button>
        </div>

        {/* Right Refresh & Create */}
        <div className="flex w-full sm:w-auto items-center justify-end gap-3.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="h-9 px-4 shrink-0 text-xs font-medium border-border/80 flex items-center gap-1.5"
          >
            <RotateCwIcon className="h-3.5 w-3.5" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={handleNewAgent}
            className="h-9 px-4 bg-primary hover:bg-primary/95 text-primary-foreground font-medium shrink-0 text-xs flex items-center gap-1.5"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            新建智能体
          </Button>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 overflow-y-auto min-h-0 pt-1">
        {isLoading ? (
          <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
            正在加载智能体...
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center border rounded-xl bg-card p-8">
            <div className="bg-primary/5 text-primary flex h-14 w-14 items-center justify-center rounded-full">
              <BotIcon className="h-7 w-7" />
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">
                {searchQuery ? "未找到匹配的智能体" : "暂无自定义智能体"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {searchQuery 
                  ? "请尝试调整您的搜索关键词或过滤标签" 
                  : "立即创建一个新的智能体开始使用吧"}
              </p>
            </div>
            {!searchQuery && (
              <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={handleNewAgent}>
                <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
                新建智能体
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-in fade-in duration-300">
            {filteredAgents.map((agent) => (
              <AgentCard 
                key={agent.name} 
                agent={agent} 
                onEdit={() => setEditingAgentName(agent.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Slide-over Modals / Popup Dialogs */}
      <CreateAgentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={refetch}
      />

      <EditAgentDialog
        agentName={editingAgentName}
        open={editingAgentName !== null}
        onOpenChange={(open) => {
          if (!open) setEditingAgentName(null);
        }}
        onSuccess={refetch}
      />
    </div>
  );
}
