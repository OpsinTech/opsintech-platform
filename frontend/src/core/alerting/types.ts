export interface Signal {
  id: string;
  source: string;
  service: string | null;
  severity: string;
  status: string;
  title: string;
  fingerprint: string;
  occurred_at: string | null;
  labels_json?: Record<string, unknown> | null;
  raw_payload?: Record<string, unknown> | null;
}

export interface IncidentSummary {
  id: string;
  incident_key: string;
  title: string | null;
  severity: string;
  priority: string;
  status: string;
  service: string | null;
  environment: string | null;
  signal_count: number;
  first_seen_at: string;
  last_seen_at: string;
  agent_id: string | null;
  diagnosis_status: string | null;
}

export interface IncidentDetail {
  id: string;
  incident_key: string;
  title: string | null;
  summary: string | null;
  severity: string;
  priority: string;
  status: string;
  service: string | null;
  environment: string | null;
  signal_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  suppressed: boolean;
  ai_summary: string | null;
  ai_impact: string | null;
  ai_suggestion: string | null;
  ai_analysis_enabled: boolean;
  agent_id: string | null;
  thread_id: string | null;
  diagnosis_agent_configured: boolean;
  diagnosis_status: string | null;
  diagnosis_result: string | null;
  diagnosis_error: string | null;
  owner_team_id: string | null;
  signals: Signal[];
  related_incidents: IncidentSummary[];
  recent_changes: ChangeEvent[];
  created_at: string;
  updated_at: string;
}

export interface ChangeEvent {
  id: string;
  change_type: string;
  summary: string | null;
  service: string | null;
  environment: string | null;
  changed_by: string | null;
  changed_at: string;
}

export interface AlertSource {
  id: string;
  name: string;
  type: string;
  status: string;
  auth_mode: string;
  config_json: Record<string, unknown>;
  ai_analysis_enabled: boolean;
  ai_analysis_severities: string[];
  ai_analysis_model: string | null;
  diagnosis_agent_id: string | null;
  created_at: string;
}

export interface AlertSourceCreate {
  name: string;
  type: string;
  auth_mode: string;
  config_json: Record<string, unknown>;
  ai_analysis_enabled?: boolean;
  ai_analysis_severities?: string[];
  ai_analysis_model?: string | null;
  diagnosis_agent_id?: string | null;
}

export interface AlertSourceUpdate {
  name?: string;
  type?: string;
  status?: string;
  auth_mode?: string;
  config_json?: Record<string, unknown>;
  ai_analysis_enabled?: boolean;
  ai_analysis_severities?: string[];
  ai_analysis_model?: string | null;
  diagnosis_agent_id?: string | null;
}

export interface AlertRule {
  id: string;
  name: string;
  rule_type: "suppression" | "aggregation" | "dedup";
  enabled: boolean;
  condition_json: AlertRuleCondition;
  action_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AlertRuleCondition {
  conditions: AlertRuleConditionItem[];
  logic: "and" | "or";
}

export interface AlertRuleConditionItem {
  field: string;
  op: "eq" | "neq" | "in" | "not_in" | "contains" | "starts_with" | "regex" | "gt" | "lt";
  value: unknown;
}

export interface AlertRuleCreate {
  name: string;
  rule_type: "suppression" | "aggregation" | "dedup";
  enabled?: boolean;
  condition_json: AlertRuleCondition;
  action_json: Record<string, unknown>;
}

export interface AlertRuleUpdate {
  name?: string;
  rule_type?: string;
  enabled?: boolean;
  condition_json?: AlertRuleCondition;
  action_json?: Record<string, unknown>;
}

export interface IngestResponse {
  ingest_id: string | null;
  incident_key: string | null;
  is_new_incident: boolean;
  disposition: "created" | "merged" | "suppressed";
}

export interface AlertingSettings {
  raw_alert_retention_days: number;
  notification_config: NotificationConfig;
}

export interface NotificationConfig {
  enabled: boolean;
  channels: string[];
  chat_ids: Record<string, string>;
  selected_chat_ids?: Record<string, string[]>;
  severity_threshold: "critical" | "major" | "warning";
  on_resolved: boolean;
  digest?: { enabled: boolean; schedule: "daily" | "weekly"; time: string };
  quiet_hours?: { enabled: boolean; start: string; end: string };
}

export interface IncidentStats {
  firing: number;
  resolved: number;
  suppressed: number;
  total: number;
  severity_distribution: Record<string, number>;
  top_services: { service: string; count: number }[];
  recent_incidents: IncidentSummary[];
}

export interface ChannelStatus {
  enabled: boolean;
  running: boolean;
}

export interface ChannelStatusResponse {
  service_running: boolean;
  channels: Record<string, ChannelStatus>;
}

export interface TestNotificationRequest {
  channel_name: string;
  chat_id: string;
}

export interface TestNotificationResponse {
  success: boolean;
  message: string;
}

