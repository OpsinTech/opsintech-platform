export interface Model {
  id: string;
  name: string;
  model: string;
  display_name: string;
  description?: string | null;
  supports_thinking?: boolean;
  supports_reasoning_effort?: boolean;
  supports_vision?: boolean;
  supports_text2image?: boolean;
  enabled?: boolean;
  model_type?: string | null;
}

export interface RegisterModelInput {
  name: string;
  model: string;
  use?: string;
  display_name?: string;
  description?: string;
  supports_thinking?: boolean;
  supports_reasoning_effort?: boolean;
  supports_vision?: boolean;
  supports_text2image?: boolean;
  enabled?: boolean;
  use_responses_api?: boolean;
  output_version?: string;
  max_tokens?: number;
  base_url?: string;
  api_key?: string;
  verify_ssl?: boolean;
  model_type?: string | null;
}

// New types for "available" models endpoint with scope and permissions metadata
export interface AvailableModelResponse extends Model {
  scope: string; // "global" | "tenant" | "user"
  source: string; // Model source classification
  managed_by_current_user: boolean; // Whether current user can manage this model
  effective_permissions: string[]; // ["read", "write", "delete", "share", ...]
}

export interface AvailableModelsListResponse {
  models: AvailableModelResponse[];
}

export interface TestConnectionInput {
  model: string;
  use?: string;
  base_url?: string;
  api_key?: string;
  max_tokens?: number;
  verify_ssl?: boolean;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
}
