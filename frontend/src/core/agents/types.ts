export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string | null;
  tool_groups: string[] | null;
  system_prompt?: string | null;
  /** @deprecated Use system_prompt */
  soul?: string | null;
  skills: string[];
  enabled: boolean;
  tags: string[];
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_shared?: boolean;
}

export interface Skill {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  model?: string | null;
  tool_groups?: string[] | null;
  system_prompt?: string;
  /** @deprecated Use system_prompt */
  soul?: string;
  skills?: string[];
  tags?: string[];
  enabled?: boolean;
  is_shared?: boolean;
}

export interface UpdateAgentRequest {
  description?: string | null;
  model?: string | null;
  tool_groups?: string[] | null;
  system_prompt?: string | null;
  /** @deprecated Use system_prompt */
  soul?: string | null;
  skills?: string[] | null;
  enabled?: boolean | null;
  tags?: string[] | null;
  is_shared?: boolean | null;
}
