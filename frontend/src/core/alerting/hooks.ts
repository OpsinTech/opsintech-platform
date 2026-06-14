"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useCurrentTenant } from "@/core/tenants/hooks";

import {
  createAlertRule,
  createAlertSource,
  deleteAlertRule,
  deleteAlertSource,
  getIncident,
  listAlertRules,
  listAlertSources,
  listIncidents,
  suppressIncident,
  unsuppressIncident,
  analyzeIncident,
  cancelDiagnosis,
  updateAlertRule,
  updateAlertSource,
  getAlertingSettings,
  updateAlertingSettings,
  getIncidentStats,
  getChannelsStatus,
  testNotification,
  type ListIncidentsParams,
  type ListIncidentsResponse,
} from "./api";
import type { AlertRule, AlertRuleCreate, AlertRuleUpdate, AlertSource, AlertSourceCreate, AlertSourceUpdate, AlertingSettings, IncidentDetail, IncidentStats, ChannelStatusResponse, TestNotificationRequest, TestNotificationResponse } from "./types";

export function useIncidents(params: ListIncidentsParams = {}) {
  const { data: currentTenant } = useCurrentTenant();
  const tenantId = currentTenant?.tenant_id ?? null;

  return useQuery<ListIncidentsResponse>({
    queryKey: ["incidents", "list", { tenantId, ...params }],
    queryFn: () => listIncidents(params),
    enabled: !!tenantId,
    refetchOnWindowFocus: false,
    staleTime: 10_000, // 告警可以保留10秒缓存
  });
}

export function useIncidentDetail(incidentId: string | null | undefined) {
  const { data: currentTenant } = useCurrentTenant();
  const tenantId = currentTenant?.tenant_id ?? null;

  return useQuery<IncidentDetail>({
    queryKey: ["incidents", "detail", { tenantId, incidentId }],
    queryFn: () => getIncident(incidentId!),
    enabled: !!tenantId && !!incidentId,
    refetchOnWindowFocus: false,
  });
}

export function useSuppressIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (incidentId: string) => suppressIncident(incidentId),
    onSuccess: (data, incidentId) => {
      toast.success("告警事件已成功标记静默");
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({
        queryKey: ["incidents", "detail", { incidentId }],
        exact: false,
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "标记静默失败，请重试");
    },
  });
}

export function useUnsuppressIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (incidentId: string) => unsuppressIncident(incidentId),
    onSuccess: (data, incidentId) => {
      toast.success("告警事件已成功恢复为活跃状态");
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({
        queryKey: ["incidents", "detail", { incidentId }],
        exact: false,
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "取消静默失败，请重试");
    },
  });
}

export function useAnalyzeIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (incidentId: string) => analyzeIncident(incidentId),
    onSuccess: (data, incidentId) => {
      toast.success("AI 告警解读任务已成功在后台拉起，分析完成后数据将自动呈现");
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({
        queryKey: ["incidents", "detail", { incidentId }],
        exact: false,
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "发起 AI 告警解读失败，请重试");
    },
  });
}

export function useCancelDiagnosis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (incidentId: string) => cancelDiagnosis(incidentId),
    onSuccess: (_data, incidentId) => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({
        queryKey: ["incidents", "detail", { incidentId }],
        exact: false,
      });
    },
  });
}

export function useAlertSources() {
  const { data: currentTenant } = useCurrentTenant();
  const tenantId = currentTenant?.tenant_id ?? null;

  return useQuery<AlertSource[]>({
    queryKey: ["alertSources", "list", { tenantId }],
    queryFn: listAlertSources,
    enabled: !!tenantId,
    refetchOnWindowFocus: false,
  });
}

export function useCreateAlertSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AlertSourceCreate) => createAlertSource(data),
    onSuccess: () => {
      toast.success("告警源创建成功");
      void queryClient.invalidateQueries({ queryKey: ["alertSources"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "创建告警源失败，请重试");
    },
  });
}

export function useUpdateAlertSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceId, data }: { sourceId: string; data: AlertSourceUpdate }) =>
      updateAlertSource(sourceId, data),
    onSuccess: () => {
      toast.success("告警源已更新");
      void queryClient.invalidateQueries({ queryKey: ["alertSources"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "更新告警源失败，请重试");
    },
  });
}

export function useDeleteAlertSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceId: string) => deleteAlertSource(sourceId),
    onSuccess: () => {
      toast.success("告警源已删除");
      void queryClient.invalidateQueries({ queryKey: ["alertSources"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "删除告警源失败，请重试");
    },
  });
}

// ---------------------------------------------------------------------------
// Alert Rules hooks
// ---------------------------------------------------------------------------

export function useAlertRules(ruleType?: string) {
  const { data: currentTenant } = useCurrentTenant();
  const tenantId = currentTenant?.tenant_id ?? null;

  return useQuery<AlertRule[]>({
    queryKey: ["alertRules", "list", { tenantId, ruleType }],
    queryFn: () => listAlertRules(ruleType),
    enabled: !!tenantId,
    refetchOnWindowFocus: false,
  });
}

export function useCreateAlertRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AlertRuleCreate) => createAlertRule(data),
    onSuccess: () => {
      toast.success("告警规则创建成功");
      void queryClient.invalidateQueries({ queryKey: ["alertRules"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "创建告警规则失败，请重试");
    },
  });
}

export function useUpdateAlertRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: AlertRuleUpdate }) =>
      updateAlertRule(ruleId, data),
    onSuccess: () => {
      toast.success("告警规则已更新");
      void queryClient.invalidateQueries({ queryKey: ["alertRules"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "更新告警规则失败，请重试");
    },
  });
}

export function useDeleteAlertRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ruleId: string) => deleteAlertRule(ruleId),
    onSuccess: () => {
      toast.success("告警规则已删除");
      void queryClient.invalidateQueries({ queryKey: ["alertRules"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "删除告警规则失败，请重试");
    },
  });
}

export function useAlertingSettings() {
  const { data: currentTenant } = useCurrentTenant();
  const tenantId = currentTenant?.tenant_id ?? null;

  return useQuery<AlertingSettings>({
    queryKey: ["alertingSettings", { tenantId }],
    queryFn: getAlertingSettings,
    enabled: !!tenantId,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateAlertingSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AlertingSettings) => updateAlertingSettings(data),
    onSuccess: () => {
      toast.success("告警设置已保存");
      void queryClient.invalidateQueries({ queryKey: ["alertingSettings"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "保存告警设置失败，请重试");
    },
  });
}

export function useIncidentStats() {
  const { data: currentTenant } = useCurrentTenant();
  const tenantId = currentTenant?.tenant_id ?? null;

  return useQuery<IncidentStats>({
    queryKey: ["incidents", "stats", { tenantId }],
    queryFn: getIncidentStats,
    enabled: !!tenantId,
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });
}

export function useChannelsStatus() {
  const { data: currentTenant } = useCurrentTenant();
  const tenantId = currentTenant?.tenant_id ?? null;

  return useQuery<ChannelStatusResponse>({
    queryKey: ["channels", "status", { tenantId }],
    queryFn: getChannelsStatus,
    enabled: !!tenantId,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
}

export function useTestNotification() {
  return useMutation({
    mutationFn: (data: TestNotificationRequest) => testNotification(data),
    onSuccess: (res, variables) => {
      const channelLabel = variables.channel_name === "feishu" ? "飞书" : variables.channel_name === "slack" ? "Slack" : "Telegram";
      if (res.success) {
        toast.success(`测试消息已成功发送至 ${channelLabel}！请前往对应群组查看。`);
      } else {
        toast.error(`${channelLabel} 测试消息推送失败: ${res.message}`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "测试通道发送错误，请重试");
    },
  });
}

