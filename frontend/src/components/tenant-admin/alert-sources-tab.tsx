"use client";

import { useState } from "react";
import {
  PlusIcon,
  CopyIcon,
  CheckIcon,
  Trash2Icon,
  PencilIcon,
  ShieldAlertIcon,
  KeyIcon,
  Settings2Icon,
  RefreshCwIcon,
  BookOpenIcon,
  TerminalIcon
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useAlertSources,
  useCreateAlertSource,
  useUpdateAlertSource,
  useDeleteAlertSource,
  type AlertSource,
  type AlertSourceUpdate,
} from "@/core/alerting";
import { useAvailableModels } from "@/core/models/hooks";
import { useAgents } from "@/core/agents";

// 定义预设映射的类型
type PresetType = "generic" | "grafana" | "prometheus";

interface MappingTemplate {
  title: string;
  summary: string;
  severity: string;
  service: string;
  environment: string;
  status: string;
}

const PRESET_MAPPINGS: Record<PresetType, MappingTemplate> = {
  generic: {
    title: "$.title",
    summary: "$.summary",
    severity: "$.severity",
    service: "$.service",
    environment: "$.environment",
    status: "$.status",
  },
  grafana: {
    title: "$.title",
    summary: "$.message",
    severity: "$.state",
    service: "$.ruleName",
    environment: "$.tags.env",
    status: "$.state",
  },
  prometheus: {
    title: "$.commonAnnotations.summary",
    summary: "$.commonAnnotations.description",
    severity: "$.commonLabels.severity",
    service: "$.commonLabels.service",
    environment: "$.commonLabels.environment",
    status: "$.status",
  }
};

export function AlertSourcesTab() {
  const { data: sources = [], isLoading, refetch, isFetching } = useAlertSources();
  const { mutateAsync: createSource, isPending: creating } = useCreateAlertSource();
  const { mutateAsync: updateSource, isPending: updating } = useUpdateAlertSource();
  const { mutateAsync: deleteSource, isPending: deleting } = useDeleteAlertSource();
  const { models } = useAvailableModels();
  const { agents } = useAgents();

  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [editSourceId, setEditSourceId] = useState<string | null>(null);
  const [activeSourceForDocs, setActiveSourceForDocs] = useState<AlertSource | null>(null);

  // 表单状态
  const [name, setName] = useState("");
  const [type, setType] = useState("webhook");
  const [authMode, setAuthMode] = useState<"none" | "token">("token");
  const [tokenHeader, setTokenHeader] = useState("X-Alert-Token");
  const [token, setToken] = useState("");

  // AI analysis state
  const [aiAnalysisEnabled, setAiAnalysisEnabled] = useState(false);
  const [aiAnalysisSeverities, setAiAnalysisSeverities] = useState<string[]>(["critical", "major"]);
  const [aiAnalysisModel, setAiAnalysisModel] = useState<string>("");
  const [diagnosisAgentId, setDiagnosisAgentId] = useState<string>("");

  const SEVERITY_OPTIONS = ["critical", "major", "minor", "warning", "info"];
  const SEVERITY_LABELS: Record<string, string> = {
    critical: "严重 (Critical)",
    major: "重要 (Major)",
    minor: "一般 (Minor)",
    warning: "警告 (Warning)",
    info: "通知 (Info)",
  };

  const toggleSeverity = (sev: string) => {
    setAiAnalysisSeverities((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]
    );
  };

  // 映射状态
  const [mapping, setMapping] = useState<MappingTemplate>(PRESET_MAPPINGS.generic);
  const [selectedPreset, setSelectedPreset] = useState<PresetType>("generic");

  // 复制状态记录器
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getIngestUrl = (sourceId: string) => {
    if (typeof window === "undefined") return `/api/alerts/ingest/${sourceId}`;
    return `${window.location.protocol}//${window.location.host}/api/alerts/ingest/${sourceId}`;
  };

  const getProviderDoc = (type: string, url: string, authHeader: string, token: string) => {
    const authLine = token ? ` \\\n  -H "${authHeader}: ${token}"` : "";

    switch (type.toLowerCase()) {
      case "grafana":
        return {
          instructions: "在 Grafana 中添加一个新的 contact point（Webhook 类型），将下方的推送地址配置为 URL，HTTP Method 选择为 POST，格式选为 JSON，保存即可。系统内置的 GrafanaProvider 会全自动解析 payload 里的指标、级别与关联面板地址。",
          yaml: null,
          curl: `curl -X POST "${url}" \\\n  -H "Content-Type: application/json"${authLine} \\\n  -d '{\n    "status": "firing",\n    "alerts": [\n      {\n        "status": "firing",\n        "labels": {\n          "alertname": "High CPU utilization",\n          "service": "postgres",\n          "environment": "production",\n          "severity": "critical"\n        },\n        "annotations": {\n          "summary": "High CPU utilization on DB",\n          "description": "Database CPU is above 90% for 5 minutes"\n        },\n        "dashboardURL": "http://localhost:3000/d/abc",\n        "panelURL": "http://localhost:3000/d/abc?panelId=1",\n        "generatorURL": "http://localhost:3000/alerts/rule/1"\n      }\n    ],\n    "commonLabels": {\n      "cluster": "prod-us"\n    }\n  }'`
        };
      case "alertmanager":
        return {
          instructions: "在 Prometheus Alertmanager 的 alertmanager.yml 配置文件中添加一个 webhook_configs 接收器，指向下方推送地址。系统内置的 AlertmanagerProvider 会自动映射标准化警报字段。",
          yaml: `receivers:\n  - name: 'opsintech-receiver'\n    webhook_configs:\n      - url: '${url}'\n        send_resolved: true`,
          curl: `curl -X POST "${url}" \\\n  -H "Content-Type: application/json"${authLine} \\\n  -d '{\n    "status": "firing",\n    "alerts": [\n      {\n        "status": "firing",\n        "labels": {\n          "alertname": "InstanceDown",\n          "service": "api-gateway",\n          "environment": "production",\n          "severity": "critical"\n        },\n        "annotations": {\n          "summary": "Instance is down",\n          "description": "The api-gateway instance has been down for > 5 minutes"\n        },\n        "fingerprint": "12345abcdef"\n      }\n    ],\n    "externalURL": "http://alertmanager.local"\n  }'`
        };
      case "cloudwatch":
        return {
          instructions: "在 AWS SNS 控制台中创建一个 HTTPS 类型的订阅，将下方推送地址配置为 Endpoint 终结点。平台会自动确认 SNS 的 SubscriptionConfirmation 并在之后自动将 CloudWatch 报警信号清洗合并为 Incident 告警事件。",
          yaml: null,
          curl: `curl -X POST "${url}" \\\n  -H "Content-Type: application/json"${authLine} \\\n  -d '{\n    "Type": "Notification",\n    "MessageId": "cw-sns-notification-id",\n    "Message": "{\\"AlarmName\\":\\"High-CPU-Usage\\",\\"NewStateValue\\":\\"ALARM\\",\\"NewStateReason\\":\\"Threshold Crossed\\",\\"Region\\":\\"us-west-2\\",\\"Trigger\\":{\\"MetricName\\":\\"CPUUtilization\\",\\"Namespace\\":\\"AWS/EC2\\",\\"Threshold\\":80.0,\\"ComparisonOperator\\":\\"GreaterThanThreshold\\",\\"Dimensions\\":[{\\"name\\":\\"InstanceId\\",\\"value\\":\\"i-123456789\\"}]}}"\n  }'`
        };
      case "datadog":
        return {
          instructions: "在 Datadog Webhooks Integration 中配置一个指向下方推送地址的新 Webhook。由于 Datadog 监控器报警格式灵活，建议在 Custom Payload 中包含 ID、级别、标题与关联标签，平台将全自动提取清洗指标。",
          yaml: null,
          curl: `curl -X POST "${url}" \\\n  -H "Content-Type: application/json"${authLine} \\\n  -d '{\n    "id": "datadog-monitor-123456",\n    "event_title": "High error rate on checkout service",\n    "event_msg": "The error rate on checkout service is 5.4% which is above the warning threshold of 3%",\n    "alert_transition": "triggered",\n    "alert_type": "error",\n    "tags": "service:checkout,env:production,team:billing"\n  }'`
        };
      default:
        return {
          instructions: "通用 Webhook 接入。当第三方平台推送 JSON Payload 时，平台将依照您在此接入源中配置的「JSONPath 字段映射关系」提取清洗字段值，完成标准化。若无映射则默认不予处理。",
          yaml: null,
          curl: `curl -X POST "${url}" \\\n  -H "Content-Type: application/json"${authLine} \\\n  -d '{\n    "title": "Database connection latency too high",\n    "summary": "Service postgres on production has response time > 500ms over 3 minutes",\n    "severity": "critical",\n    "service": "postgres",\n    "environment": "production",\n    "status": "firing"\n  }'`
        };
    }
  };

  const docInfo = activeSourceForDocs
    ? getProviderDoc(
      activeSourceForDocs.type,
      getIngestUrl(activeSourceForDocs.id),
      (activeSourceForDocs.config_json?.token_header as string) || "X-Alert-Token",
      (activeSourceForDocs.config_json?.token as string) || ""
    )
    : null;

  // 生成随机 Token
  const generateRandomToken = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "ops_tok_";
    for (let i = 0; i < 24; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setToken(result);
  };

  // 切换预设
  const handlePresetChange = (preset: PresetType) => {
    setSelectedPreset(preset);
    setMapping(PRESET_MAPPINGS[preset]);
  };

  // 打开编辑弹窗，从已有 source 填充表单
  const handleOpenEditDialog = (source: AlertSource) => {
    setEditSourceId(source.id);
    setName(source.name);
    setType(source.type);
    setAuthMode((source.auth_mode as "none" | "token") || "token");
    setTokenHeader((source.config_json?.token_header as string) || "X-Alert-Token");
    setToken((source.config_json?.token as string) || "");

    // Populate AI analysis fields
    setAiAnalysisEnabled(source.ai_analysis_enabled);
    setAiAnalysisSeverities(source.ai_analysis_severities?.length ? source.ai_analysis_severities : ["critical", "major"]);
    setAiAnalysisModel(source.ai_analysis_model || "");
    setDiagnosisAgentId(source.diagnosis_agent_id || "");

    // Populate field mapping
    const fieldMapping = source.config_json?.field_mapping as MappingTemplate | undefined;
    if (fieldMapping && fieldMapping.title) {
      setMapping(fieldMapping);
      setSelectedPreset("generic"); // custom mapping
    } else {
      setSelectedPreset("generic");
      setMapping(PRESET_MAPPINGS.generic);
    }

    setIsNewDialogOpen(true);
  };

  // 打开新建弹窗时初始化表单
  const handleOpenNewDialog = () => {
    setEditSourceId(null);
    setName("");
    setType("webhook");
    setAuthMode("token");
    setTokenHeader("X-Alert-Token");
    const firstModel = models.find((m) => m.enabled !== false);
    setAiAnalysisEnabled(false);
    setAiAnalysisSeverities(["critical", "major"]);
    setAiAnalysisModel(firstModel?.name ?? "");
    setDiagnosisAgentId("");

    // 初始化一个 Token
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let initialToken = "ops_tok_";
    for (let i = 0; i < 24; i++) {
      initialToken += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setToken(initialToken);

    setSelectedPreset("generic");
    setMapping(PRESET_MAPPINGS.generic);
    setIsNewDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("请输入告警源名称");
      return;
    }

    try {
      const configJson = {
        auth_mode: authMode,
        token_header: authMode === "token" ? tokenHeader : undefined,
        token: authMode === "token" ? token : undefined,
        field_mapping: type === "webhook" ? mapping : undefined,
      };

      await createSource({
        name,
        type,
        auth_mode: authMode,
        config_json: configJson,
        ai_analysis_enabled: aiAnalysisEnabled,
        ai_analysis_severities: aiAnalysisEnabled ? aiAnalysisSeverities : [],
        ai_analysis_model: aiAnalysisModel || null,
        diagnosis_agent_id: diagnosisAgentId || null,
      });

      setIsNewDialogOpen(false);
    } catch {
      // 错误由 Hook 处理
    }
  };

  const handleUpdate = async () => {
    if (!editSourceId || !name.trim()) {
      toast.error("请输入告警源名称");
      return;
    }

    try {
      const configJson: Record<string, unknown> = {
        auth_mode: authMode,
        token_header: authMode === "token" ? tokenHeader : undefined,
        token: authMode === "token" ? token : undefined,
        field_mapping: type === "webhook" ? mapping : undefined,
      };

      await updateSource({
        sourceId: editSourceId,
        data: {
          name,
          type,
          auth_mode: authMode,
          config_json: configJson,
          ai_analysis_enabled: aiAnalysisEnabled,
          ai_analysis_severities: aiAnalysisEnabled ? aiAnalysisSeverities : [],
          ai_analysis_model: aiAnalysisModel || null,
          diagnosis_agent_id: diagnosisAgentId || null,
        },
      });

      setIsNewDialogOpen(false);
      setEditSourceId(null);
      toast.success("告警源已更新");
    } catch {
      // 错误由 Hook 处理
    }
  };

  return (
    <div className="space-y-5">
      {/* 描述与控制栏 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">告警接入源</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            配置运维平台向外公开接收的 webhook 地址，支持与 Grafana、Prometheus 等系统的报警无缝集成。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
          >
            <RefreshCwIcon className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            刷新
          </Button>

          <Button
            size="sm"
            className="h-9 gap-1.5 bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-100 font-medium"
            onClick={handleOpenNewDialog}
          >
            <PlusIcon className="h-4 w-4" />
            新建接入源
          </Button>
        </div>
      </div>

      {/* 告警源列表 */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div key={idx} className="h-44 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-background/50 animate-pulse" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 py-16 text-center bg-background/30">
          <ShieldAlertIcon className="h-10 w-10 text-zinc-400" />
          <h3 className="mt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">暂无配置告警接入源</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm leading-relaxed px-4">
            创建新的告警源以获取专属 webhook 接收路径，把生产环境的警报打入本系统。
          </p>
          <Button size="sm" onClick={handleOpenNewDialog} className="mt-4 gap-1.5 h-8">
            <PlusIcon className="h-3.5 w-3.5" /> 开启第一次接入
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sources.map((source) => {
            const ingestUrl = getIngestUrl(source.id);
            const sourceToken = (source.config_json?.token as string) || "";
            const sourceTokenHeader = (source.config_json?.token_header as string) || "X-Alert-Token";

            return (
              <div
                key={source.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-zinc-200 bg-background p-5 shadow-sm transition hover:shadow-md dark:border-zinc-800"
              >
                <div>
                  {/* 首行名称与状态 */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-50 group-hover:underline">
                        {source.name}
                      </h3>
                      <p className="text-[10px] font-mono text-zinc-400 mt-0.5">ID: {source.id}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="px-2 py-0.5 text-[9px] rounded font-medium bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 uppercase">
                        {source.type}
                      </Badge>
                      <span className={`inline-flex h-2 w-2 rounded-full ${source.status === "active" ? "bg-emerald-500" : "bg-zinc-400"}`} />
                    </div>
                  </div>

                  {/* 鉴权模式说明 */}
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <KeyIcon className="h-3.5 w-3.5 text-zinc-400" />
                    <span>
                      鉴权: {source.auth_mode === "token" ? `Token 认证 (${sourceTokenHeader})` : "免鉴权 (开放)"}
                    </span>
                  </div>

                  {/* 快捷 URL 复制栏 */}
                  <div className="mt-4 flex items-center gap-1 rounded-lg border border-zinc-100 bg-zinc-50/50 p-1.5 dark:border-zinc-900 dark:bg-zinc-900/10">
                    <span className="flex-1 truncate font-mono text-[10px] text-zinc-500 pl-1">
                      {ingestUrl}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-zinc-200 dark:hover:bg-zinc-800 shrink-0"
                      onClick={() => handleCopy(ingestUrl, `${source.id}-url`)}
                    >
                      {copiedId === `${source.id}-url` ? (
                        <CheckIcon className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <CopyIcon className="h-3 w-3 text-zinc-400" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* 底部卡片控制条 */}
                <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-900">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={source.status === "active"}
                      onCheckedChange={(checked) =>
                        updateSource({ sourceId: source.id, data: { status: checked ? "active" : "disabled" } })
                      }
                      disabled={updating}
                    />
                    <span className="text-[10px] text-zinc-400">
                      {source.status === "active" ? "已启用" : "已禁用"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-zinc-400 hover:text-primary"
                      onClick={() => handleOpenEditDialog(source)}
                      title="编辑"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-primary font-medium hover:text-primary/90"
                      onClick={() => setActiveSourceForDocs(source)}
                    >
                      <BookOpenIcon className="h-3.5 w-3.5" />
                      文档
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-zinc-400 hover:text-rose-500"
                      onClick={() => {
                        if (confirm(`确定删除告警源「${source.name}」？`)) {
                          deleteSource(source.id);
                        }
                      }}
                      disabled={deleting}
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 弹窗：新建告警源 */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-2xl overflow-y-auto max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlertIcon className="h-5 w-5 text-indigo-500" />
              {editSourceId ? "编辑告警接入源" : "创建新告警接入源"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* 基础配置 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">告警源名称</label>
                <Input
                  placeholder="e.g. 核心生产 Kubernetes 告警"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9.5 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">类型 (Provider Type)</label>
                <select
                  aria-label="告警源类型"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full h-9.5 px-3 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-background outline-none cursor-pointer"
                >
                  <option value="webhook">Webhook (通用 JSON)</option>
                  <option value="alertmanager">Prometheus Alertmanager</option>
                  <option value="grafana">Grafana Alerting</option>
                  <option value="cloudwatch">AWS CloudWatch</option>
                  <option value="datadog">Datadog Monitor</option>
                </select>
              </div>
            </div>

            {/* 鉴权设置 */}
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <KeyIcon className="h-4 w-4 text-zinc-500" />
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">接收端安全鉴权 (Authentication)</span>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode("token")}
                    className={`px-3 py-1 text-[11px] font-medium rounded-md border transition ${authMode === "token"
                      ? "bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                      : "bg-background text-zinc-600 border-zinc-200 dark:text-zinc-400 dark:border-zinc-800"
                      }`}
                  >
                    Token 认证
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("none")}
                    className={`px-3 py-1 text-[11px] font-medium rounded-md border transition ${authMode === "none"
                      ? "bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                      : "bg-background text-zinc-600 border-zinc-200 dark:text-zinc-400 dark:border-zinc-800"
                      }`}
                  >
                    开放 (免鉴权)
                  </button>
                </div>
              </div>

              {authMode === "token" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-zinc-500">HTTP 请求头字段 (Header Key)</label>
                    <Input
                      value={tokenHeader}
                      onChange={(e) => setTokenHeader(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-zinc-500">验证密钥 (Header Value / Token)</label>
                    <div className="flex gap-1.5">
                      <Input
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className="h-8 text-xs font-mono flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-[10px] shrink-0 font-medium px-2"
                        onClick={generateRandomToken}
                      >
                        重新生成
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* AI 智能解读 */}
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Settings2Icon className="h-4 w-4 text-zinc-500" />
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    AI 智能解读 (Alert Translator)
                  </span>
                </div>
                <Switch
                  checked={aiAnalysisEnabled}
                  onCheckedChange={setAiAnalysisEnabled}
                />
              </div>

              {aiAnalysisEnabled && (
                <div className="pt-2 space-y-3">
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      选择需要 AI 自动解读的告警级别：
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SEVERITY_OPTIONS.map((sev) => (
                        <label
                          key={sev}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium cursor-pointer transition ${aiAnalysisSeverities.includes(sev)
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/20 dark:border-indigo-900/50"
                            : "bg-background text-zinc-500 border-zinc-200 dark:text-zinc-400 dark:border-zinc-800"
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={aiAnalysisSeverities.includes(sev)}
                            onChange={() => toggleSeverity(sev)}
                            className="sr-only"
                          />
                          {SEVERITY_LABELS[sev] ?? sev}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      AI 解读模型：
                    </p>
                    <select
                      aria-label="AI 解读模型"
                      value={aiAnalysisModel}
                      onChange={(e) => setAiAnalysisModel(e.target.value)}
                      className="w-full h-9 px-3 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-background outline-none cursor-pointer"
                    >
                      {models
                        .filter((m) => m.enabled !== false)
                        .map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.display_name ?? m.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      深度诊断智能体（可选）：
                    </p>
                    <select
                      aria-label="深度诊断智能体"
                      value={diagnosisAgentId}
                      onChange={(e) => setDiagnosisAgentId(e.target.value)}
                      className="w-full h-9 px-3 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-background outline-none cursor-pointer"
                    >
                      <option value="">不使用</option>
                      {agents
                        .filter((a) => a.enabled && a.is_shared)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* JSONPath 字段归一化配置 (仅通用 Webhook 支持映射) */}
            {type === "webhook" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-1.5">
                    <Settings2Icon className="h-4 w-4 text-zinc-500" />
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      图形化 JSONPath 字段映射 (Field Normalization)
                    </span>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePresetChange("generic")}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${selectedPreset === "generic"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/20 dark:border-indigo-900/50"
                        : "bg-background text-zinc-500 border-zinc-200"
                        }`}
                    >
                      通用模板
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetChange("grafana")}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${selectedPreset === "grafana"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/20 dark:border-indigo-900/50"
                        : "bg-background text-zinc-500 border-zinc-200"
                        }`}
                    >
                      Grafana
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetChange("prometheus")}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${selectedPreset === "prometheus"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/20 dark:border-indigo-900/50"
                        : "bg-background text-zinc-500 border-zinc-200"
                        }`}
                    >
                      Prometheus
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground leading-normal mt-1">
                  平台会将您推送的任意 JSON 警报标准化归因。输入 JSONPath 点规则（如 <code>$.alert.name</code>）指定如何抽取标准数据：
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-2 bg-zinc-50/50 dark:bg-zinc-900/20 p-4 rounded-xl border">
                  {/* 标题 */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-semibold">事件标题 (Title)</span>
                      <span className="text-rose-500 text-[10px]">*</span>
                    </div>
                    <Input
                      value={mapping.title}
                      onChange={(e) => setMapping({ ...mapping, title: e.target.value })}
                      className="h-8 text-xs font-mono bg-background"
                      placeholder="$.title"
                    />
                  </div>

                  {/* 概述 */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold">详细描述 (Summary)</span>
                    <Input
                      value={mapping.summary}
                      onChange={(e) => setMapping({ ...mapping, summary: e.target.value })}
                      className="h-8 text-xs font-mono bg-background"
                      placeholder="$.summary"
                    />
                  </div>

                  {/* 严重度 */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold">严重度 (Severity)</span>
                    <Input
                      value={mapping.severity}
                      onChange={(e) => setMapping({ ...mapping, severity: e.target.value })}
                      className="h-8 text-xs font-mono bg-background"
                      placeholder="$.severity"
                    />
                  </div>

                  {/* 服务名 */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold">归属服务名 (Service)</span>
                    <Input
                      value={mapping.service}
                      onChange={(e) => setMapping({ ...mapping, service: e.target.value })}
                      className="h-8 text-xs font-mono bg-background"
                      placeholder="$.service"
                    />
                  </div>

                  {/* 环境名 */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold">归属环境 (Environment)</span>
                    <Input
                      value={mapping.environment}
                      onChange={(e) => setMapping({ ...mapping, environment: e.target.value })}
                      className="h-8 text-xs font-mono bg-background"
                      placeholder="$.environment"
                    />
                  </div>

                  {/* 状态 */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold">警报状态 (Status: firing/resolved)</span>
                    <Input
                      value={mapping.status}
                      onChange={(e) => setMapping({ ...mapping, status: e.target.value })}
                      className="h-8 text-xs font-mono bg-background"
                      placeholder="$.status"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-6 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => { setIsNewDialogOpen(false); setEditSourceId(null); }} disabled={creating || updating}>
              取消
            </Button>
            {editSourceId ? (
              <Button size="sm" onClick={handleUpdate} disabled={updating} className="bg-primary text-primary-foreground">
                {updating ? "保存中..." : "保存修改"}
              </Button>
            ) : (
              <Button size="sm" onClick={handleCreate} disabled={creating} className="bg-primary text-primary-foreground">
                {creating ? "创建中..." : "保存并启用"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 弹窗：集成文档 */}
      <Dialog open={!!activeSourceForDocs} onOpenChange={(open) => !open && setActiveSourceForDocs(null)}>
        <DialogContent className="max-w-2xl overflow-y-auto overflow-x-hidden max-h-[85vh] w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-950 dark:text-zinc-50">
              <BookOpenIcon className="h-5 w-5 text-indigo-500" />
              接入集成指南: {activeSourceForDocs?.name}
            </DialogTitle>
          </DialogHeader>

          {activeSourceForDocs && docInfo && (
            <div className="space-y-5 py-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 w-full min-w-0 overflow-hidden">
              <div>
                <p className="text-zinc-800 dark:text-zinc-200 font-semibold mb-1">1. 推送地址 (Ingest Webhook URL)</p>
                <div className="flex items-center gap-1 rounded-lg border bg-zinc-50 dark:bg-zinc-900/40 p-2 font-mono text-[11px] mt-1.5">
                  <span className="flex-1 truncate text-zinc-600 dark:text-zinc-300">
                    {getIngestUrl(activeSourceForDocs.id)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleCopy(getIngestUrl(activeSourceForDocs.id), "docs-url")}
                  >
                    {copiedId === "docs-url" ? (
                      <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <CopyIcon className="h-3.5 w-3.5 text-zinc-400" />
                    )}
                  </Button>
                </div>
              </div>

              {activeSourceForDocs.auth_mode === "token" && (
                <div>
                  <p className="text-zinc-800 dark:text-zinc-200 font-semibold mb-1">2. 认证请求头 (Authentication Header)</p>
                  <p className="text-muted-foreground mt-0.5">您需要在警报推送的 HTTP Post 请求头中附带验证头字段与值：</p>

                  <div className="grid grid-cols-2 gap-2 mt-2 bg-zinc-50/50 dark:bg-zinc-900/20 p-3 rounded-lg border text-left">
                    <div>
                      <span className="text-[10px] text-zinc-400 block">Header Key</span>
                      <code className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                        {(activeSourceForDocs.config_json?.token_header as string) || "X-Alert-Token"}
                      </code>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 block">Header Value (Token)</span>
                      <code className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        {(activeSourceForDocs.config_json?.token as string) || ""}
                      </code>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-zinc-800 dark:text-zinc-200 font-semibold mb-1 flex items-center gap-1.5">
                  <TerminalIcon className="h-4 w-4 text-zinc-500" />
                  3. 接入配置步骤 (Integration Setup)
                </p>
                <p className="text-muted-foreground mt-0.5">{docInfo.instructions}</p>

                {docInfo.yaml && (
                  <div className="mt-3">
                    <p className="text-[11px] text-zinc-500 font-semibold mb-1">Alertmanager 配置片段 (YAML):</p>
                    <div className="relative rounded-lg border bg-zinc-950 p-4 font-mono text-[10.5px] leading-relaxed text-zinc-100 w-full max-w-full overflow-hidden">
                      <pre className="overflow-x-auto whitespace-pre pr-8 pb-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">{docInfo.yaml}</pre>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-2 h-7 w-7 p-0 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 hover:text-zinc-50 rounded"
                        onClick={() => handleCopy(docInfo.yaml || "", "docs-yaml")}
                      >
                        {copiedId === "docs-yaml" ? (
                          <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <CopyIcon className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <p className="text-[11px] text-zinc-500 font-semibold mb-1">CURL 模拟警报测试指令 (Shell Command):</p>
                  <div className="relative rounded-lg border bg-zinc-950 p-4 font-mono text-[10.5px] leading-relaxed text-zinc-100 w-full max-w-full overflow-hidden">
                    <pre className="overflow-x-auto whitespace-pre pr-8 pb-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">{docInfo.curl}</pre>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2 h-7 w-7 p-0 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 hover:text-zinc-50 rounded"
                      onClick={() => handleCopy(docInfo.curl, "docs-curl")}
                    >
                      {copiedId === "docs-curl" ? (
                        <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <CopyIcon className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 border-t pt-4">
            <Button size="sm" onClick={() => setActiveSourceForDocs(null)} className="bg-primary text-primary-foreground">
              我已了解
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
