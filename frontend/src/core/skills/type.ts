export interface Skill {
  name: string;
  description: string;
  category: string;
  license: string | null;
  enabled: boolean;
  bound_tools?: string[];
  prompt_template?: string | null;
  strategy?: string | null;
  instructions?: string | null;
  created_by?: string | null;
  version?: number;
  changelog?: string | null;
  usage_count?: number;
  references?: Record<string, string> | null;
}


export interface AvailableSkillResponse extends Skill {
  scope: string; // "global" | "tenant"
  source: string; // Skill source classification
  managed_by_current_user: boolean; // Whether current user can manage this skill
  effective_permissions: string[]; // ["read", "write", "delete", "share", ...]
}

export interface SkillDetail extends Skill {
  references?: Record<string, string> | null;
}

export interface AvailableSkillsListResponse {
  skills: AvailableSkillResponse[];
}

export interface GenerateInstructionsRequest {
  prompt: string;
}

export interface GenerateInstructionsResponse {
  instructions: string;
}

export interface ToolCallSummary {
  tool: string;
  description: string;
}

export interface SummarizeDiagnosisRequest {
  incident_title?: string | null;
  incident_service?: string | null;
  incident_severity?: string;
  incident_environment?: string | null;
  diagnosis_result: string;
  diagnosis_steps?: string[];
  tool_calls_summary?: ToolCallSummary[];
  user_notes?: string | null;
}

export interface SummarizeDiagnosisResponse {
  suggested_name: string;
  suggested_description: string;
  instructions: string;
  suggested_tools: string[];
  suggested_category: string;
}
