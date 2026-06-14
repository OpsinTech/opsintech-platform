"use client";

import { useEffect, useState } from "react";
import {
  SaveIcon,
  Loader2Icon,
  ShieldAlertIcon,
  BellIcon,
  MessageSquareIcon,
  SendIcon,
  CheckCircle2Icon,
  RadioIcon,
  BookOpenIcon,
  HelpCircleIcon,
  ExternalLinkIcon,
  SparklesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { fetchAuthApi } from "@/core/api/auth-client";

interface ImSettings {
  enabled: boolean;
  channels: string[];
  chat_ids: Record<string, string>;
}

const DEFAULT_SETTINGS: ImSettings = { enabled: false, channels: [], chat_ids: {} };

const AVAILABLE_CHANNELS = [
  { key: "feishu", label: "飞书", desc: "Lark / 飞书群机器人" },
  { key: "slack", label: "Slack", desc: "Slack workspace channel" },
  { key: "telegram", label: "Telegram", desc: "Telegram bot chat" },
];

async function getImSettings(): Promise<ImSettings> {
  const resp = await fetchAuthApi("/api/tenant-im/settings");
  if (!resp.ok) throw new Error("Failed to load IM settings");
  return { ...DEFAULT_SETTINGS, ...(await resp.json()) };
}

async function saveImSettings(data: ImSettings): Promise<void> {
  const resp = await fetchAuthApi("/api/tenant-im/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(((await resp.json().catch(() => ({}))) as { detail?: string }).detail || "Failed to save");
}

async function testChannel(channelName: string, chatId: string): Promise<boolean> {
  const resp = await fetchAuthApi("/api/channels/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel_name: channelName, chat_id: chatId }),
  });
  return (await resp.json()).success;
}

async function getChannelStatus(): Promise<Record<string, { enabled: boolean; running: boolean }>> {
  const resp = await fetchAuthApi("/api/channels/");
  return ((await resp.json()).channels || {}) as Record<string, { enabled: boolean; running: boolean }>;
}

export function TenantImSettingsPage() {
  const [settings, setSettings] = useState<ImSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [channelStatus, setChannelStatus] = useState<Record<string, { enabled: boolean; running: boolean }>>({});
  const [showGuide, setShowGuide] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<"feishu" | "slack" | "telegram">("feishu");

  useEffect(() => {
    Promise.all([getImSettings(), getChannelStatus()])
      .then(([s, cs]) => {
        setSettings(s);
        setChannelStatus(cs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveImSettings(settings);
      toast.success("渠道配置已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
    finally {
      setSaving(false);
    }
  };

  const toggleChannel = (key: string) => {
    setSettings((prev) => ({
      ...prev,
      channels: prev.channels.includes(key)
        ? prev.channels.filter((c) => c !== key)
        : [...prev.channels, key],
    }));
  };

  const handleTest = async (channelKey: string) => {
    const chatIdStr = settings.chat_ids[channelKey];
    if (!chatIdStr?.trim()) {
      toast.error("请先填写 Chat ID");
      return;
    }

    setTesting(channelKey);
    const channelLabel = AVAILABLE_CHANNELS.find((c) => c.key === channelKey)?.label || channelKey;
    const targetIds = chatIdStr
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id !== "");

    if (targetIds.length === 0) {
      toast.error("无有效的接收群聊 ID");
      setTesting(null);
      return;
    }

    toast.info(`正在并发向 ${targetIds.length} 个 ${channelLabel} 接收群聊推送测试消息...`);

    let successCount = 0;
    for (const cid of targetIds) {
      try {
        const ok = await testChannel(channelKey, cid);
        if (ok) {
          successCount++;
          toast.success(`[${channelLabel}] 群组 ${cid} 连通测试成功 ✅`);
        } else {
          toast.error(`[${channelLabel}] 群组 ${cid} 连通测试失败 ❌`);
        }
      } catch {
        toast.error(`[${channelLabel}] 群组 ${cid} 发送异常`);
      }
    }

    if (successCount === targetIds.length) {
      toast.success(`🎉 ${channelLabel} 所有配置群组连通性验证全部通过！`);
    } else {
      toast.warning(`⚠️ 测试完成，成功率: ${successCount}/${targetIds.length}，请检查失败的群聊密钥。`);
    }
    setTesting(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2Icon className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <ShieldAlertIcon className="h-12 w-12 text-red-500" />
        <h3 className="mt-4 text-base font-semibold">加载失败</h3>
        <p className="mt-2 text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            <RadioIcon className="h-6 w-6 text-zinc-800 dark:text-zinc-200" />
            渠道管理
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            配置租户的即时通讯渠道凭证。告警通知、降噪日报等模块将引用此处的推送群组
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowGuide(!showGuide)}
          className="gap-2 text-xs font-semibold h-9 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 border-zinc-250 dark:border-zinc-800"
        >
          <BookOpenIcon className="h-3.5 w-3.5" />
          {showGuide ? "折叠配置指南" : "打开对接配置指南"}
          {showGuide ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />}
        </Button>
      </div>

      {/* 📘 INTERACTIVE CONFIGURATION GUIDE */}
      {showGuide && (
        <Card className="border-indigo-150 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/10 via-transparent to-rose-50/5 dark:from-indigo-950/5 dark:to-transparent overflow-hidden shadow-sm animate-fadeIn">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-bold text-indigo-900 dark:text-indigo-400 flex items-center gap-1.5">
              <SparklesIcon className="h-4 w-4" />
              渠道对接连通配置指南
            </CardTitle>
            <CardDescription className="text-xs">
              选择下方不同渠道标签，快速了解如何获取群聊接收凭据 (Chat ID)。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Guide Tabs */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-800 pb-px">
              {(["feishu", "slack", "telegram"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveGuideTab(tab)}
                  className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all -mb-px ${
                    activeGuideTab === tab
                      ? "border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-400"
                      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                >
                  {tab === "feishu" ? "飞书 (Feishu)" : tab === "slack" ? "Slack" : "Telegram"}
                </button>
              ))}
            </div>

            {/* Guide Content */}
            <div className="text-xs text-zinc-650 dark:text-zinc-350 space-y-3 leading-relaxed">
              {activeGuideTab === "feishu" && (
                <div className="space-y-2">
                  <p className="font-semibold text-zinc-850 dark:text-zinc-200">飞书群组 Chat ID 获取步骤：</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-600 dark:text-zinc-400">
                    <li>进入飞书目标群聊，依次点击右上角 <strong className="font-medium text-zinc-800 dark:text-zinc-200">“设置 (...) → 群机器人 → 添加机器人”</strong>。</li>
                    <li>在机器人类别中选择并创建 <strong className="font-medium text-zinc-800 dark:text-zinc-200">“自定义机器人”</strong>，完成创建后飞书会提供一个 Webhook 链接。</li>
                    <li>
                      提取 Webhook 链接中的 <strong className="font-semibold text-zinc-900 dark:text-zinc-100">`chat_id`</strong>，或者将您的企业应用 Bot 邀请加入群聊，在群内发送消息 <code className="px-1.5 py-0.5 rounded bg-zinc-150 dark:bg-zinc-800 font-mono text-[10px]">/status</code> 即可直接获取以 <code className="font-mono font-semibold">oc_</code> 开头的 Chat ID。
                    </li>
                    <li className="text-indigo-600 dark:text-indigo-400 font-semibold">
                      💡 核心要点：飞书群聊 ID 示例为 `oc_1234567890abcdef...`，支持配置多个群组（以英文逗号分隔）。
                    </li>
                  </ol>
                </div>
              )}

              {activeGuideTab === "slack" && (
                <div className="space-y-2">
                  <p className="font-semibold text-zinc-850 dark:text-zinc-200">Slack 接收端 Channel ID 获取步骤：</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-600 dark:text-zinc-400">
                    <li>打开 Slack 客户端，右键点击您希望接收通知的频道。</li>
                    <li>在菜单中选择最后一项 <strong className="font-medium text-zinc-800 dark:text-zinc-200">“View channel details (查看频道详情)”</strong>。</li>
                    <li>
                      在弹出的详情卡片中，滚动到底部，即可看到一串以 <strong className="font-semibold text-zinc-900 dark:text-zinc-100">`C`</strong> 或 <strong className="font-semibold text-zinc-900 dark:text-zinc-100">`G`</strong> 开头的字符串（例如 <code className="px-1.5 py-0.5 rounded bg-zinc-150 dark:bg-zinc-800 font-mono text-[10px] font-semibold">C06ABC123D</code>），这就是该频道的 Channel ID。
                    </li>
                    <li>
                      或者，您可以在 Slack 应用设置中为该 Workspace 生成 <strong className="font-medium text-zinc-800 dark:text-zinc-200">Incoming Webhook</strong> 并关联到指定频道。
                    </li>
                  </ol>
                </div>
              )}

              {activeGuideTab === "telegram" && (
                <div className="space-y-2">
                  <p className="font-semibold text-zinc-850 dark:text-zinc-200">Telegram 目标群组 Chat ID 获取步骤：</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-600 dark:text-zinc-400">
                    <li>
                      在 Telegram 中搜索官方机器人 <strong className="font-medium text-zinc-800 dark:text-zinc-200">@BotFather</strong>，发送指令 <code className="px-1.5 py-0.5 rounded bg-zinc-150 dark:bg-zinc-800 font-mono text-[10px]">/newbot</code> 创建机器人并获取对应的 <strong className="font-medium text-zinc-800 dark:text-zinc-200">API Token</strong>。
                    </li>
                    <li>创建一个目标 Telegram 群聊或频道，将您刚创建的机器人添加为该群组的管理员。</li>
                    <li>在群组中发送一条测试消息。</li>
                    <li>
                      访问地址：<code className="px-1.5 py-0.5 rounded bg-zinc-150 dark:bg-zinc-800 font-mono text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">https://api.telegram.org/bot{"<YourBotToken>"}/getUpdates</code>，在返回的 JSON 中，在 <code className="font-mono">"chat"</code> 块中提取 <code className="font-mono">"id"</code> 字段。
                    </li>
                    <li className="text-rose-600 dark:text-rose-400 font-medium">
                      ⚠️ 注意事项：Telegram 群组 Chat ID 通常为负整数（例如：`-1001234567890`），请务必带上负号。
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ⚙️ CHANNEL CONFIGURATIONS */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50">
                <BellIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">渠道总开关</CardTitle>
                <CardDescription className="text-xs mt-0.5">启用后，下方激活的渠道即可实时接收到系统智能告警通知和系统消息</CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
              disabled={saving}
            />
          </div>
        </CardHeader>

        {settings.enabled && (
          <CardContent className="space-y-6">
            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-2">可用渠道配置</label>
              <p className="text-[11px] text-muted-foreground mb-4">选择此租户使用的即时通讯渠道，并开启或关闭各个接收端</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {AVAILABLE_CHANNELS.map((ch) => {
                  const active = settings.channels.includes(ch.key);
                  const status = channelStatus[ch.key];
                  return (
                    <button
                      key={ch.key}
                      type="button"
                      onClick={() => toggleChannel(ch.key)}
                      disabled={saving}
                      className={`flex items-start gap-3 rounded-xl border p-4.5 text-left transition-all duration-200 ${
                        active
                          ? "border-indigo-300 bg-indigo-50/20 dark:border-indigo-800/40 dark:bg-indigo-950/10 shadow-sm"
                          : "border-zinc-200 bg-background dark:border-zinc-800 hover:border-zinc-300"
                      }`}
                    >
                      <div
                        className={`mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          active ? "border-indigo-600 bg-indigo-600" : "border-zinc-300 dark:border-zinc-700"
                        }`}
                      >
                        {active && <CheckCircle2Icon className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <MessageSquareIcon className={`h-4.5 w-4.5 shrink-0 ${active ? "text-indigo-500" : "text-zinc-450"}`} />
                          <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{ch.label}</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1 leading-normal">{ch.desc}</p>
                        {status && (
                          <div className="mt-3.5 flex items-center gap-1.5 text-[9px] font-semibold">
                            <span className={`h-1.5 w-1.5 rounded-full ${status.running ? "bg-emerald-500 animate-ping" : "bg-zinc-300 dark:bg-zinc-700"}`} />
                            <span className={status.running ? "text-emerald-650 dark:text-emerald-400" : "text-zinc-400"}>
                              {status.running ? "底层服务可用" : "底层服务未启动"}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {settings.channels.length > 0 && (
              <div className="space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/10 dark:bg-zinc-900/5 p-4.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                    群聊 Chat ID 密钥录入
                  </label>
                  <p className="text-[10px] text-zinc-400">
                    配置通知接收群组的凭据 ID。支持配置多个群组（以英文逗号分隔），发生告警时将并发分发到所有地址。
                  </p>
                </div>

                <div className="space-y-4.5">
                  {settings.channels.map((ch) => (
                    <div key={ch} className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-350">
                          {AVAILABLE_CHANNELS.find((c) => c.key === ch)?.label} 群组 ID
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {ch === "feishu" ? "格式：oc_xxx" : ch === "slack" ? "格式：Cxxx" : "格式：-xxx"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={settings.chat_ids[ch] || ""}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              chat_ids: { ...settings.chat_ids, [ch]: e.target.value },
                            })
                          }
                          disabled={saving}
                          className="h-10 text-xs font-mono flex-1 focus-visible:ring-indigo-500/20"
                          placeholder={
                            ch === "feishu"
                              ? "飞书群组oc_id，如: oc_123, oc_456"
                              : ch === "slack"
                              ? "Slack频道ID，如: C0123, C0456"
                              : "Telegram群聊ID，如: -100123, -100456"
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 gap-1.5 text-xs font-semibold px-4 shrink-0 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/20 dark:hover:text-indigo-400 border-zinc-200 dark:border-zinc-800"
                          disabled={testing === ch || !settings.chat_ids[ch]?.trim()}
                          onClick={() => handleTest(ch)}
                        >
                          {testing === ch ? (
                            <>
                              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                              连通测试中
                            </>
                          ) : (
                            <>
                              <SendIcon className="h-3 w-3" />
                              测试连通性
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-150 dark:border-zinc-850 p-4 flex items-start gap-3">
              <HelpCircleIcon className="h-4.5 w-4.5 text-indigo-500 mt-0.5 shrink-0" />
              <div className="text-xs text-zinc-500 leading-normal space-y-1">
                <p className="font-semibold text-zinc-800 dark:text-zinc-200">💡 告警策略推荐配合：</p>
                <p>
                  渠道在此配置完成后，请在{" "}
                  <strong className="font-semibold text-zinc-700 dark:text-zinc-300">告警设置</strong> 标签页下进一步配置通知偏好（如指定级别的过滤、日报推送周期、夜间静默免打扰等），系统将自动加载此处的推送群聊列表。
                </p>
              </div>
            </div>
          </CardContent>
        )}

        <CardFooter className="border-t border-zinc-150 dark:border-zinc-800 pt-4 flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2 h-10 px-6 text-xs font-semibold shadow-sm">
            {saving ? (
              <>
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                正在保存渠道配置...
              </>
            ) : (
              <>
                <SaveIcon className="h-3.5 w-3.5" />
                保存渠道配置
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
