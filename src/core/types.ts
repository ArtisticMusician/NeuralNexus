export type MemoryCategory = "preference" | "fact" | "decision" | "entity" | "other";

export type MemoryPermission = 
  | "memory:read" 
  | "memory:write" 
  | "memory:update" 
  | "memory:delete" 
  | "admin:tokens" 
  | "admin:users";

export interface AuthContext {
  // `userId` is the HUMAN owner of the memory space / tenant.
  // All recall and store isolation should key off this value.
  userId: string;
  tokenId: string;
  scopes: MemoryPermission[];
  // `agentId` is the AI/client acting on behalf of the human user.
  // Examples: "claude-code", "gemini-cli", "codex", "chatgpt".
  // This is provenance only and must never be used as the tenant boundary.
  agentId?: string;
  apiKeyId?: string;
  apiKeyModelName?: string | null;
  adapterId?: string; // e.g., 'mcp', 'openai-proxy', 'fastify'
}

export interface MemoryEntry {
  id: string;
  text: string;
  category: MemoryCategory;
  vector: number[];
    metadata: {
        last_accessed_at: string;
        created_at: string;
        strength: number;
        source?: string;
        [key: string]: any;
    };
}

export interface RecallRequest {
  query: string;
  limit?: number;
  userid?: string;
  category?: MemoryCategory;
  maxTokens?: number;
}

export interface RecallResponse {
  memories: MemoryEntry[];
  metadata?: {
    search_type: "hybrid" | "vector";
    threshold_applied: number;
    countBeforeFiltering: number;
  };
}

export type MergeStrategy = "recompute" | "average" | "replace";

export interface StoreRequest {
  text: string;
  category?: MemoryCategory;
  userid?: string;
  metadata?: Record<string, any>;
  mergeStrategy?: MergeStrategy;
}

export interface ReinforceRequest {
  memoryId: string;
  strengthAdjustment: number;
}
