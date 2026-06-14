import { fetchAuthApi } from "@/core/api/auth-client";

import type {
  AlertRule,
  AlertRuleCreate,
  AlertRuleUpdate,
  AlertSource,
  AlertSourceCreate,
  AlertSourceUpdate,
  AlertingSettings,
  IncidentDetail,
  IncidentSummary,
  IncidentStats,
  ChannelStatusResponse,
  TestNotificationRequest,
  TestNotificationResponse,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (isObject(payload)) {
    const detail = payload.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    const message = payload.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

export interface ListIncidentsParams {
  status?: string;
  severity?: string;
  service?: string;
  limit?: number;
  offset?: number;
}

export interface ListIncidentsResponse {
  incidents: IncidentSummary[];
  total: number;
}

export async function listIncidents(params: ListIncidentsParams = {}): Promise<ListIncidentsResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.severity) query.set("severity", params.severity);
  if (params.service) query.set("service", params.service);
  if (params.limit !== undefined) query.set("limit", params.limit.toString());
  if (params.offset !== undefined) query.set("offset", params.offset.toString());

  const queryString = query.toString();
  const response = await fetchAuthApi(`/api/incidents${queryString ? `?${queryString}` : ""}`);

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "加载告警事件失败"));
  }

  return json as ListIncidentsResponse;
}

export async function getIncident(incidentId: string): Promise<IncidentDetail> {
  const response = await fetchAuthApi(`/api/incidents/${encodeURIComponent(incidentId)}`);

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "加载告警详情失败"));
  }

  return json as IncidentDetail;
}

export interface DiagnoseResponse {
  status: string;
  incident_id: string;
  thread_id: string;
  agent_name: string;
  response: string;
}

export async function diagnoseIncident(incidentId: string): Promise<DiagnoseResponse> {
  const response = await fetchAuthApi(`/api/incidents/${encodeURIComponent(incidentId)}/diagnose`, {
    method: "POST",
  });

  if (!response.ok) {
    let detail = `Diagnosis failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (payload.detail) detail = payload.detail;
    } catch {}
    throw new Error(detail);
  }

  return (await response.json()) as DiagnoseResponse;
}

export async function cancelDiagnosis(incidentId: string): Promise<{ status: string }> {
  const response = await fetchAuthApi(`/api/incidents/${encodeURIComponent(incidentId)}/diagnose/cancel`, {
    method: "POST",
  });
  return (await response.json()) as { status: string };
}

export async function suppressIncident(incidentId: string): Promise<{ status: string; incident_id: string }> {
  const response = await fetchAuthApi(`/api/incidents/${encodeURIComponent(incidentId)}/suppress`, {
    method: "POST",
  });

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "静默告警事件失败"));
  }

  return json as { status: string; incident_id: string };
}

export async function unsuppressIncident(incidentId: string): Promise<{ status: string; incident_id: string }> {
  const response = await fetchAuthApi(`/api/incidents/${encodeURIComponent(incidentId)}/unsuppress`, {
    method: "POST",
  });

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "恢复告警事件失败"));
  }

  return json as { status: string; incident_id: string };
}

export async function analyzeIncident(incidentId: string): Promise<{ status: string; incident_id: string }> {
  const response = await fetchAuthApi(`/api/incidents/${encodeURIComponent(incidentId)}/analyze`, {
    method: "POST",
  });

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "发起 AI 诊断分析失败"));
  }

  return json as { status: string; incident_id: string };
}



export async function listAlertSources(): Promise<AlertSource[]> {
  const response = await fetchAuthApi("/api/alert-sources");

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "加载告警源失败"));
  }

  return json as AlertSource[];
}

export async function createAlertSource(data: AlertSourceCreate): Promise<AlertSource> {
  const response = await fetchAuthApi("/api/alert-sources", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "创建告警源失败"));
  }

  return json as AlertSource;
}

export async function updateAlertSource(sourceId: string, data: AlertSourceUpdate): Promise<AlertSource> {
  const response = await fetchAuthApi(`/api/alert-sources/${encodeURIComponent(sourceId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  let json: unknown = null;
  try { json = await response.json(); } catch { json = null; }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "更新告警源失败"));
  }

  return json as AlertSource;
}

export async function deleteAlertSource(sourceId: string): Promise<void> {
  const response = await fetchAuthApi(`/api/alert-sources/${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    let json: unknown = null;
    try { json = await response.json(); } catch { json = null; }
    throw new Error(getErrorMessage(json, "删除告警源失败"));
  }
}



export async function listAlertRules(ruleType?: string): Promise<AlertRule[]> {
  const query = ruleType ? `?rule_type=${encodeURIComponent(ruleType)}` : "";
  const response = await fetchAuthApi(`/api/alert-rules${query}`);

  let json: unknown = null;
  try { json = await response.json(); } catch { json = null; }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "加载告警规则失败"));
  }

  return json as AlertRule[];
}

export async function createAlertRule(data: AlertRuleCreate): Promise<AlertRule> {
  const response = await fetchAuthApi("/api/alert-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  let json: unknown = null;
  try { json = await response.json(); } catch { json = null; }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "创建告警规则失败"));
  }

  return json as AlertRule;
}

export async function updateAlertRule(ruleId: string, data: AlertRuleUpdate): Promise<AlertRule> {
  const response = await fetchAuthApi(`/api/alert-rules/${encodeURIComponent(ruleId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  let json: unknown = null;
  try { json = await response.json(); } catch { json = null; }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "更新告警规则失败"));
  }

  return json as AlertRule;
}

export async function deleteAlertRule(ruleId: string): Promise<void> {
  const response = await fetchAuthApi(`/api/alert-rules/${encodeURIComponent(ruleId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    let json: unknown = null;
    try { json = await response.json(); } catch { json = null; }
    throw new Error(getErrorMessage(json, "删除告警规则失败"));
  }
}

export async function getAlertingSettings(): Promise<AlertingSettings> {
  const response = await fetchAuthApi("/api/alerting-settings");

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "加载告警设置失败"));
  }

  return json as AlertingSettings;
}

export async function updateAlertingSettings(data: AlertingSettings): Promise<AlertingSettings> {
  const response = await fetchAuthApi("/api/alerting-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "保存告警设置失败"));
  }

  return json as AlertingSettings;
}

export async function getIncidentStats(): Promise<IncidentStats> {
  const response = await fetchAuthApi("/api/incidents/stats");

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "加载告警统计数据失败"));
  }

  return json as IncidentStats;
}

export async function getChannelsStatus(): Promise<ChannelStatusResponse> {
  const response = await fetchAuthApi("/api/channels/");

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "获取通道状态失败"));
  }

  return json as ChannelStatusResponse;
}

export async function testNotification(data: TestNotificationRequest): Promise<TestNotificationResponse> {
  const response = await fetchAuthApi("/api/channels/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(json, "测试通道发送失败"));
  }

  return json as TestNotificationResponse;
}

