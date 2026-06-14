"use client";

import {
  ArrowLeft,
  Bot,
  Save,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getSkillDetail,
  patchTenantSkill,
  patchPersonalSkill,
  generateInstructions,
} from "@/core/skills/api";
import type { SkillDetail } from "@/core/skills/type";

export default function SkillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const skillName = params.name as string;

  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Edit state
  const [instructions, setInstructions] = useState("");
  const [description, setDescription] = useState("");
  const [boundToolsText, setBoundToolsText] = useState("");
  const [strategy, setStrategy] = useState("default");

  // AI generation prompt
  const [genPrompt, setGenPrompt] = useState("");
  const [dirty, setDirty] = useState(false);

  // Test chat state
  const [testInput, setTestInput] = useState("");
  const [testMessages, setTestMessages] = useState<{ role: string; content: string }[]>([]);
  const [testLoading, setTestLoading] = useState(false);

  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!skillName) return;
    setLoading(true);
    getSkillDetail(skillName)
      .then((data) => {
        setSkill(data);
        setInstructions(data.instructions || "");
        setDescription(data.description || "");
        setBoundToolsText((data.bound_tools || []).join(", "));
        setStrategy(data.strategy || "default");
      })
      .catch(() => toast.error("加载 Skill 详情失败"))
      .finally(() => setLoading(false));
  }, [skillName]);

  const handleSave = async () => {
    if (!skill) return;
    setSaving(true);
    try {
      const payload = {
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        bound_tools: boundToolsText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        strategy: strategy || null,
      };
      
      if (skill.scope === "personal") {
        await patchPersonalSkill(skill.name, payload);
      } else {
        await patchTenantSkill(skill.name, payload);
      }
      
      setDirty(false);
      toast.success("保存成功");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleAIGenerate = async () => {
    if (!genPrompt.trim()) {
      toast.error("请输入你想让 Skill 做什么");
      return;
    }
    setAiLoading(true);
    try {
      const result = await generateInstructions(genPrompt.trim());
      setInstructions(result.instructions);
      setDirty(true);
      toast.success("AI 已生成 Instructions，请检查并调整");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setAiLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testInput.trim()) return;
    setTestMessages((prev) => [...prev, { role: "user", content: testInput }]);
    setTestInput("");
    setTestLoading(true);
    // Simulate test — in production this would call a dedicated test endpoint
    try {
      await new Promise((r) => setTimeout(r, 1500));
      setTestMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "（测试模式）Agent 将使用当前 Skill 指令进行诊断。实际生产环境中，此处会展示 Agent 的实时响应。",
        },
      ]);
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex size-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        Skill 未找到
      </div>
    );
  }

  // User can edit if they manage it (either they are admin for tenant skills, or it's their personal skill)
  const canEdit = skill.managed_by_current_user;

  return (
    <div className="flex size-full flex-col bg-zinc-50/50 dark:bg-zinc-950/20 overflow-hidden animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{skill.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge
                variant="secondary"
                className="text-[10px]"
              >
                v{skill.version || 1}
              </Badge>
              {skill.category && (
                <span>{skill.category}</span>
              )}
              {skill.usage_count !== undefined && skill.usage_count > 0 && (
                <span>· 使用 {skill.usage_count} 次</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDirty(true);
              toast.info("即将保存");
            }}
            disabled={!canEdit || saving}
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {/* Main content: left edit + right test */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — Instructions editor */}
        <div className="flex w-3/5 flex-col overflow-y-auto border-r p-6 gap-4">
          {/* Description */}
          <div>
            <label className="text-sm font-medium">描述</label>
            <Input
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
              placeholder="简短描述这个 Skill 做什么"
              disabled={!canEdit}
              className="mt-1.5"
            />
          </div>

          {/* AI auto-generate panel */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI 自动生成 Instructions
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              描述你想让 Agent 掌握什么能力，AI 会自动生成结构化的诊断流程
            </p>
            <div className="flex gap-2">
              <Input
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                placeholder='例如："K8s Pod Crash 诊断，包括 OOMKilled、CrashLoopBackOff、镜像拉取失败等"'
                className="flex-1"
                disabled={!canEdit}
              />
              <Button
                onClick={handleAIGenerate}
                disabled={!canEdit || aiLoading}
                size="sm"
              >
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "生成"
                )}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="flex-1 flex flex-col min-h-0">
            <label className="text-sm font-medium mb-1.5 flex items-center justify-between">
              <span>Instructions</span>
              {dirty && (
                <span className="text-[10px] text-amber-600">未保存</span>
              )}
            </label>
            <Textarea
              ref={instructionsRef}
              value={instructions}
              onChange={(e) => {
                setInstructions(e.target.value);
                setDirty(true);
              }}
              placeholder={`## 诊断流程

### 第一步：检查基本信息
1. 执行 ...
2. 检查 ...

### 第二步：深入分析
1. ...
`}
              className="flex-1 min-h-[400px] font-mono text-sm"
              disabled={!canEdit}
            />
          </div>


          {/* Save button at bottom */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!canEdit || saving || !dirty}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              保存 Skill
            </Button>
          </div>
        </div>

        {/* Right panel — Test chat */}
        <div className="flex w-2/5 flex-col bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">测试对话</span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              使用当前 Skill 指令进行诊断测试
            </span>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {testMessages.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <div className="text-center">
                  <Bot className="mx-auto h-8 w-8 mb-2 opacity-30" />
                  <p>输入一个模拟告警来测试</p>
                  <p className="text-xs mt-1">Agent 将使用当前 Skill 进行诊断</p>
                </div>
              </div>
            )}
            {testMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {testLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-muted px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Test input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Input
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleTest();
                  }
                }}
                placeholder='输入测试告警，例如："K8s Pod CPU 高"'
                className="flex-1"
              />
              <Button onClick={handleTest} disabled={testLoading}>
                发送
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
