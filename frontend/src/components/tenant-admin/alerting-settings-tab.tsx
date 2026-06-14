"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SaveIcon,
  DatabaseIcon,
  AlertCircleIcon,
  Loader2Icon,
  ShieldAlertIcon,
  BellIcon,
  MessageSquareIcon,
  HelpCircleIcon,
  ClockIcon,
  VolumeXIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  useAlertingSettings,
  useUpdateAlertingSettings,
  type NotificationConfig,
} from "@/core/alerting";

const DEFAULT_NOTIFICATION: NotificationConfig = {
  enabled: false,
  channels: [],
  chat_ids: {},
  selected_chat_ids: {},
  severity_threshold: "major",
  on_resolved: true,
  digest: { enabled: false, schedule: "daily", time: "09:00" },
  quiet_hours: { enabled: false, start: "22:00", end: "07:00" },
};

const AVAILABLE_CHANNELS = [
  { key: "feishu", label: "飞书", desc: "字节跳动旗下协同办公平台" },
  { key: "slack", label: "Slack", desc: "全球流行的团队沟通工具" },
  { key: "telegram", label: "Telegram", desc: "高安全性的即时通讯软件" },
];

export function AlertingSettingsTab() {
  const { data: settings, isLoading, error } = useAlertingSettings();
  const { mutate: updateSettings, isPending: isSaving } = useUpdateAlertingSettings();

  const [days, setDays] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Notification state
  const [notif, setNotif] = useState<NotificationConfig>(DEFAULT_NOTIFICATION);

  useEffect(() => {
    if (settings) {
      setDays(settings.raw_alert_retention_days.toString());
      
      const config = settings.notification_config && Object.keys(settings.notification_config).length > 0
        ? { ...DEFAULT_NOTIFICATION, ...settings.notification_config }
        : DEFAULT_NOTIFICATION;

      // Populate selected_chat_ids with all configured chat_ids by default if missing
      if (!config.selected_chat_ids) {
        config.selected_chat_ids = {};
      }
      
      const chatIds = config.chat_ids || {};
      AVAILABLE_CHANNELS.forEach((ch) => {
        if (!config.selected_chat_ids![ch.key]) {
          const rawIds = chatIds[ch.key] || "";
          config.selected_chat_ids![ch.key] = rawIds
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id !== "");
        }
      });

      setNotif(config);
    }
  }, [settings]);

  const handleInputChange = (val: string) => {
    setDays(val);
    if (!val.trim()) {
      setValidationError("请输入保留天数");
      return;
    }
    const num = parseInt(val, 10);
    if (isNaN(num) || !/^\d+$/.test(val)) {
      setValidationError("请输入有效的整数天数");
      return;
    }
    if (num < 1) {
      setValidationError("最小保留 1 天");
    } else if (num > 365) {
      setValidationError("最大保留 365 天");
    } else {
      setValidationError(null);
    }
  };

  const handleSaveRetention = (e: React.FormEvent) => {
    e.preventDefault();
    if (!days.trim()) {
      setValidationError("请输入保留天数");
      return;
    }
    const num = parseInt(days, 10);
    if (isNaN(num) || num < 1 || num > 365 || !/^\d+$/.test(days)) {
      handleInputChange(days);
      return;
    }
    updateSettings({ raw_alert_retention_days: num, notification_config: notif });
  };

  const handleSaveNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    updateSettings({ raw_alert_retention_days: settings.raw_alert_retention_days, notification_config: notif });
  };

  const toggleChannelSelection = (key: string) => {
    setNotif((prev) => {
      const isSelected = prev.channels.includes(key);
      const channels = isSelected
        ? prev.channels.filter((c) => c !== key)
        : [...prev.channels, key];

      // If enabling channel, select all registered IDs by default
      const selectedChatIds = { ...prev.selected_chat_ids };
      if (!isSelected && selectedChatIds[key]?.length === 0) {
        const rawIds = prev.chat_ids[key] || "";
        selectedChatIds[key] = rawIds
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
      }

      return { ...prev, channels, selected_chat_ids: selectedChatIds };
    });
  };

  const toggleChatIdSelection = (channelKey: string, chatId: string) => {
    setNotif((prev) => {
      const currentSelected = prev.selected_chat_ids?.[channelKey] || [];
      const nextSelected = currentSelected.includes(chatId)
        ? currentSelected.filter((id) => id !== chatId)
        : [...currentSelected, chatId];

      const selectedChatIds = {
        ...prev.selected_chat_ids,
        [channelKey]: nextSelected,
      };

      // Auto-toggle channel status based on whether any chat ID is selected
      let channels = [...prev.channels];
      if (nextSelected.length > 0 && !channels.includes(channelKey)) {
        channels.push(channelKey);
      } else if (nextSelected.length === 0 && channels.includes(channelKey)) {
        channels = channels.filter((c) => c !== channelKey);
      }

      return { ...prev, channels, selected_chat_ids: selectedChatIds };
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-background/30 p-8">
        <Loader2Icon className="h-10 w-10 animate-spin text-zinc-500" />
        <p className="mt-3 text-sm text-muted-foreground animate-pulse">正在载入系统告警配置...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] rounded-xl border border-dashed border-red-200 dark:border-red-800/50 bg-red-50/5 dark:bg-red-950/5 p-8 text-center">
        <ShieldAlertIcon className="h-12 w-12 text-red-500 animate-bounce" />
        <h3 className="mt-4 text-base font-semibold text-zinc-800 dark:text-zinc-200">配置加载失败</h3>
        <p className="mt-2 text-xs text-muted-foreground max-w-sm">
          {error instanceof Error ? error.message : "未检测到可用的租户告警设置，请联系管理员核对。"}
        </p>
      </div>
    );
  }

  const isRetentionValid = days.trim() !== "" && !validationError && !isSaving;
  const isNotificationValid = !isSaving;

  // Extract configured Chat IDs from the global settings (populated via IM Channel Management)
  const configuredChatIds = notif.chat_ids || {};
  const hasConfiguredChannels = AVAILABLE_CHANNELS.some((ch) => configuredChatIds[ch.key]?.trim());

  return (
    <div className="max-w-3xl space-y-8">
      {/* CARD 1: DATA RETENTION POLICY */}
      <Card className="relative overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-md bg-background/40 backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-zinc-400 via-indigo-400 to-zinc-500 dark:from-zinc-700 dark:via-indigo-600 dark:to-zinc-800" />
        <CardHeader className="space-y-1.5 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50">
              <DatabaseIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">告警历史数据保留策略</CardTitle>
              <CardDescription className="text-xs mt-0.5 text-zinc-500 dark:text-zinc-400">配置系统自动清理冗余原始告警数据 and 时序数据的归档周期</CardDescription>
            </div>
          </div>
        </CardHeader>
        <form onSubmit={handleSaveRetention}>
          <CardContent className="space-y-6 pb-6">
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">原始告警记录保留天数</label>
              <div className="flex items-center gap-4">
                <div className="relative w-36">
                  <Input
                    type="text"
                    value={days}
                    onChange={(e) => handleInputChange(e.target.value)}
                    disabled={isSaving}
                    className={`h-11 text-center font-mono text-lg font-bold pr-10 focus:ring-2 ${
                      validationError
                        ? "border-red-500 focus:ring-red-500/20"
                        : "border-zinc-200 dark:border-zinc-800 focus:ring-indigo-500/20"
                    }`}
                    maxLength={3}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground pointer-events-none">天</span>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  可配置天数范围为 <strong className="font-semibold text-zinc-800 dark:text-zinc-200">1 至 365 天</strong>（默认 30 天）。<br />
                  系统将在每日凌晨根据保留期限自动缩减并重组数据库，避免存储空间溢出。
                </div>
              </div>
              {validationError && (
                <div className="flex items-center gap-1.5 text-xs text-red-500 mt-2">
                  <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-3 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-900/10">
            <Button type="submit" disabled={!isRetentionValid} className="gap-2 h-9 px-4 text-xs font-semibold shadow-sm transition-all duration-200">
              {isSaving ? (
                <>
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <SaveIcon className="h-3.5 w-3.5" />
                  保存保留设置
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* CARD 2: IM NOTIFICATION INTEGRATION */}
      <Card className="relative overflow-hidden border-zinc-200 dark:border-zinc-800 shadow-md bg-background/40 backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-rose-400 via-indigo-500 to-violet-500 dark:from-rose-600 dark:via-indigo-600 dark:to-violet-750" />
        <CardHeader className="pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/50">
                <BellIcon className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">IM 智能告警推送配置</CardTitle>
                <CardDescription className="text-xs mt-0.5 text-zinc-500 dark:text-zinc-400">选择接收告警的即时通讯渠道，并配置通知频率与免打扰时间</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground mr-1">
                {notif.enabled ? "已启用推送" : "已关闭推送"}
              </span>
              <Switch
                checked={notif.enabled}
                onCheckedChange={(v) => setNotif({ ...notif, enabled: v })}
                disabled={isSaving}
              />
            </div>
          </div>
        </CardHeader>

        <form onSubmit={handleSaveNotification}>
          <CardContent className="space-y-6 pb-6">
            {!notif.enabled ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/10 dark:bg-zinc-900/5 text-center">
                <BellIcon className="h-8 w-8 text-zinc-400 dark:text-zinc-600 animate-pulse mb-3" />
                <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">IM 告警推送功能已关闭</h4>
                <p className="text-[11px] text-zinc-400 mt-1 max-w-sm">
                  启用上方主开关后，即可配置通知渠道过滤器、降噪日报及免打扰静默期。
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. CHANNEL SELECTION WITH GRANULAR CHAT IDS */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      通知推送渠道与群组选择
                    </label>
                    <Link
                      href="/tenant-admin/im"
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold transition"
                    >
                      渠道与密钥管理 <ExternalLinkIcon className="h-3 w-3" />
                    </Link>
                  </div>

                  {!hasConfiguredChannels ? (
                    <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/5 dark:bg-amber-950/5 text-center">
                      <AlertCircleIcon className="h-6 w-6 text-amber-500 mb-2" />
                      <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-300">未检测到已配置的通知渠道</h4>
                      <p className="text-[10px] text-zinc-400 mt-1 max-w-md">
                        目前您尚未在系统“渠道管理”页面配置任何接收端 Chat ID 密钥。告警推送将处于挂起状态。
                      </p>
                      <Link href="/tenant-admin/im" className="mt-3">
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs font-semibold border-amber-200 text-amber-850 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400">
                          立即前往配置渠道群聊 ↗
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {AVAILABLE_CHANNELS.map((ch) => {
                        const chatIdVal = configuredChatIds[ch.key]?.trim() || "";
                        const isConfigured = chatIdVal !== "";
                        const isChannelSelected = notif.channels.includes(ch.key) && isConfigured;

                        // Parse individual Chat IDs configured for this channel
                        const chatIdsList = chatIdVal
                          .split(",")
                          .map((id) => id.trim())
                          .filter((id) => id !== "");

                        return (
                          <div
                            key={ch.key}
                            className={`relative rounded-xl border transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                              !isConfigured
                                ? "bg-zinc-50/50 border-zinc-150 dark:bg-zinc-900/10 dark:border-zinc-850 opacity-60 min-h-[120px]"
                                : isChannelSelected
                                ? "bg-indigo-50/10 border-indigo-200/60 dark:bg-indigo-950/5 dark:border-indigo-900/40 shadow-sm"
                                : "bg-background/40 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 min-h-[120px]"
                            }`}
                          >
                            {/* Card Header */}
                            <div className="p-4 pb-3 flex items-start justify-between gap-2 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/30 dark:bg-zinc-900/10">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <MessageSquareIcon className={`h-4.5 w-4.5 shrink-0 ${
                                  isChannelSelected ? "text-indigo-500" : "text-zinc-400"
                                }`} />
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-zinc-850 dark:text-zinc-250 truncate">
                                    {ch.label}
                                  </h4>
                                  <p className="text-[9px] text-zinc-400 mt-0.5">
                                    {isConfigured ? `已配置 ${chatIdsList.length} 个群组` : "未配置 Chat ID"}
                                  </p>
                                </div>
                              </div>

                              <Switch
                                checked={isChannelSelected}
                                onCheckedChange={() => toggleChannelSelection(ch.key)}
                                disabled={!isConfigured || isSaving}
                                className="scale-85 shrink-0"
                              />
                            </div>

                            {/* Card Content: Granular Chat ID Selection List */}
                            <div className="p-3.5 flex-1 flex flex-col justify-center space-y-2 bg-background/25">
                              {!isConfigured ? (
                                <div className="flex items-center justify-between text-[10px] py-1.5">
                                  <span className="text-zinc-400">渠道不可用</span>
                                  <Link
                                    href="/tenant-admin/im"
                                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                                  >
                                    前往配置 ↗
                                  </Link>
                                </div>
                              ) : isChannelSelected ? (
                                <div className="space-y-2">
                                  <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider block">
                                    分发接收目标选择
                                  </span>
                                  <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1">
                                    {chatIdsList.map((cid) => {
                                      const isCidChecked = notif.selected_chat_ids?.[ch.key]?.includes(cid) || false;

                                      return (
                                        <label
                                          key={cid}
                                          className={`flex items-center justify-between gap-2 p-1.5 rounded-lg border text-[10px] cursor-pointer transition-colors ${
                                            isCidChecked
                                              ? "bg-indigo-50/40 border-indigo-200/50 text-indigo-950 dark:bg-indigo-950/20 dark:border-indigo-900/50 dark:text-indigo-350"
                                              : "bg-background/80 border-zinc-200 dark:border-zinc-800 text-zinc-550 dark:text-zinc-400 hover:border-zinc-250"
                                          }`}
                                        >
                                          <span className="font-mono truncate flex-1 pr-1">{cid}</span>
                                          <Switch
                                            checked={isCidChecked}
                                            onCheckedChange={() => toggleChatIdSelection(ch.key, cid)}
                                            disabled={isSaving}
                                            className="scale-75 shrink-0"
                                          />
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[10px] text-zinc-400 text-center py-2">
                                  请开启上方开关，激活群聊选择
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. POLICY FILTER AND NOISE CONTROL */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Severity Threshold */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      推送级别过滤门槛
                    </label>
                    <select
                      value={notif.severity_threshold}
                      onChange={(e) =>
                        setNotif({
                          ...notif,
                          severity_threshold: e.target.value as NotificationConfig["severity_threshold"],
                        })
                      }
                      disabled={isSaving}
                      className="w-full h-10 px-3 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-background outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium text-zinc-800 dark:text-zinc-200"
                    >
                      <option value="critical">🔴 仅 Critical（仅阻断性/灾难性核心告警）</option>
                      <option value="major">🟠 Critical + Major（系统严重受损告警 · 推荐）</option>
                      <option value="warning">🟡 全部级别推送（Warning 及以上级别故障推送）</option>
                    </select>
                  </div>

                  {/* Resolution Push Toggle */}
                  <div className="space-y-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">故障恢复时推送通知</span>
                      <p className="text-[10px] text-zinc-400">当告警状态变为 resolved 时，秒级推送绿色标记卡片通知群组</p>
                    </div>
                    <Switch
                      checked={notif.on_resolved}
                      onCheckedChange={(v) => setNotif({ ...notif, on_resolved: v })}
                      disabled={isSaving}
                    />
                  </div>
                </div>

                {/* 3. DIGESTS AND QUIET HOURS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Quiet Hours */}
                  <div className="space-y-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-background/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <VolumeXIcon className="h-4 w-4 text-violet-500" />
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">夜间静默（Quiet Hours）</span>
                      </div>
                      <Switch
                        checked={notif.quiet_hours?.enabled || false}
                        onCheckedChange={(v) =>
                          setNotif({
                            ...notif,
                            quiet_hours: { ...notif.quiet_hours!, enabled: v },
                          })
                        }
                        disabled={isSaving}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-normal">
                      在设定的时间范围内静默推送通知。
                      <span className="text-rose-500 font-semibold"> Critical 级别的灾难告警将不受此规则限制，依然强行推送</span>以保证核心可用性。
                    </p>
                    {notif.quiet_hours?.enabled && (
                      <div className="flex items-center gap-2.5 pt-1.5 animate-fadeIn">
                        <Input
                          type="time"
                          value={notif.quiet_hours?.start || "22:00"}
                          onChange={(e) =>
                            setNotif({
                              ...notif,
                              quiet_hours: { ...notif.quiet_hours!, start: e.target.value },
                            })
                          }
                          disabled={isSaving}
                          className="h-8.5 text-xs text-center font-mono w-28"
                        />
                        <span className="text-xs text-zinc-450">至</span>
                        <Input
                          type="time"
                          value={notif.quiet_hours?.end || "07:00"}
                          onChange={(e) =>
                            setNotif({
                              ...notif,
                              quiet_hours: { ...notif.quiet_hours!, end: e.target.value },
                            })
                          }
                          disabled={isSaving}
                          className="h-8.5 text-xs text-center font-mono w-28"
                        />
                      </div>
                    )}
                  </div>

                  {/* Daily Digests */}
                  <div className="space-y-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-background/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ClockIcon className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">降噪日报（Daily Digests）</span>
                      </div>
                      <Switch
                        checked={notif.digest?.enabled || false}
                        onCheckedChange={(v) =>
                          setNotif({
                            ...notif,
                            digest: { ...notif.digest!, enabled: v },
                          })
                        }
                        disabled={isSaving}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-450 leading-normal">
                      每天定时向指定的通道群组推送降噪健康汇总卡片，包含今日新建告警总数、恢复比例及当前处理中的活跃事件总览。
                    </p>
                    {notif.digest?.enabled && (
                      <div className="flex items-center gap-2.5 pt-1.5 animate-fadeIn">
                        <select
                          value={notif.digest?.schedule || "daily"}
                          onChange={(e) =>
                            setNotif({
                              ...notif,
                              digest: {
                                ...notif.digest!,
                                schedule: e.target.value as "daily" | "weekly",
                              },
                            })
                          }
                          disabled={isSaving}
                          className="h-8.5 px-2 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-background outline-none"
                        >
                          <option value="daily">每日汇总</option>
                          <option value="weekly">每周汇总</option>
                        </select>
                        <Input
                          type="time"
                          value={notif.digest?.time || "09:00"}
                          onChange={(e) =>
                            setNotif({
                              ...notif,
                              digest: { ...notif.digest!, time: e.target.value },
                            })
                          }
                          disabled={isSaving}
                          className="h-8.5 text-xs text-center font-mono w-28"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-3 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-900/10">
            <Button
              type="submit"
              disabled={!isNotificationValid}
              className="gap-2 h-9 px-4 text-xs font-semibold shadow-sm transition-all duration-200"
            >
              {isSaving ? (
                <>
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <SaveIcon className="h-3.5 w-3.5" />
                  保存通知设置
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
