import axios, { AxiosInstance } from "axios";

export type MemoryCategory = "preference" | "fact" | "decision" | "entity" | "other";

export interface MemoryEntry {
  id: string;
  text: string;
  category: MemoryCategory;
  vector: number[];
  metadata: {
    last_accessed: number;
    created_at: number;
    strength: number;
    source?: string;
    decayed_score?: number;
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
}

export interface StoreRequest {
  text: string;
  category?: MemoryCategory;
  userid?: string;
  metadata?: Record<string, any>;
}

export interface ReinforceRequest {
  memoryId: string;
  strengthAdjustment?: number;
}

export interface ClientOptions {
  baseUrl?: string;
  apiKey?: string;
  userid?: string;
}

/**
 * NeuralNexusClient: The official TypeScript client for interacting with 
 * the Neural Nexus JS SDK Memory API.
 */
export class NeuralNexusClient {
  private api: AxiosInstance;
  private defaultuserid?: string;

  constructor(options: ClientOptions = {}) {
    const baseUrl = (options.baseUrl || "http://localhost:3000").replace(/\/$/, "");
    this.defaultuserid = options.userid;

    this.api = axios.create({
      baseURL: baseUrl,
      headers: {
        "Content-Type": "application/json",
        ...(options.apiKey ? { "X-API-Key": options.apiKey } : {}),
      },
    });
  }

  /**
   * Search long-term memory for relevant entries.
   */
  async recall(request: RecallRequest): Promise<RecallResponse> {
    const payload = {
      userid: this.defaultuserid,
      ...request,
    };
    const response = await this.api.post<RecallResponse>("/recall", payload);
    return response.data;
  }

  /**
   * Store a new memory or update an existing similar one.
   */
  async store(request: StoreRequest): Promise<{ status: string }> {
    const payload = {
      userid: this.defaultuserid,
      ...request,
    };
    const response = await this.api.post<{ status: string }>("/store", payload);
    return response.data;
  }

  /**
   * Manually increase the strength of a specific memory.
   */
  async reinforce(request: ReinforceRequest): Promise<{ status: string }> {
    const response = await this.api.post<{ status: string }>("/reinforce", {
      memory_id: request.memoryId,
      strength_adjustment: request.strengthAdjustment,
    });
    return response.data;
  }

  /**
   * Retrieve the memory replacement audit logs.
   */
  async getAuditLogs(limit: number = 50): Promise<any[]> {
    const response = await this.api.get<any[]>("/audit", { params: { limit } });
    return response.data;
  }

  /**
   * Check the health of the Neural Nexus server.
   */
  async health(): Promise<{ status: string }> {
    const response = await this.api.get<{ status: string }>("/health");
    return response.data;
  }

  /**
   * Export all memories (admin functionality).
   */
  async export(userid?: string): Promise<string> {
    const response = await this.api.get<string>("/admin/export", {
      params: { userid: userid || this.defaultuserid },
      responseType: "text",
    });
    return response.data;
  }

  /**
   * Import memories from a JSONL/NDJSON string (admin functionality).
   */
  async import(data: string): Promise<{ status: string; count: number }> {
    const response = await this.api.post<{ status: string; count: number }>(
      "/admin/import",
      data,
      { headers: { "Content-Type": "text/plain" } }
    );
    return response.data;
  }
}
