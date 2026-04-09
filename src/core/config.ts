import { type MemoryCategory } from "./types.js";

export type VectorStoreProvider = "qdrant";

export type MemoryConfig = {
  embedding: {
    model: string;
    device: "cuda" | "cpu";
  };
  vectorStore: {
    provider: VectorStoreProvider;
    url: string;
    collection: string;
    apiKey?: string;
  };
  autoCapture?: boolean;
  autoRecall?: boolean;
  dedupThreshold?: number;
  dedupMethod?: "jaccard" | "cosine" | "substring";
  consolidation?: boolean;
  consolidationThreshold?: number;
  replacementLog: {
    enabled: boolean;
    sqlitePath: string;
  };
  auth: {
    enabled: boolean;
    secret: string;
    sqlitePath: string;
    tokenExpiry: string; // e.g., '1d', '30d'
  };
  apiKey?: string;
  // --- Standard Logic Tunables ---
  thresholds: {
    similarity: number;
    recall: number;
  };
  decay: {
    defaultLambda: number;
    timeUnit?: "ms" | "seconds" | "minutes" | "hours" | "days";
  };
  search: {
    limit: number;
    rrfK: number;
    hybridAlpha?: number;
  };
  categoryParams: Record<string, { lambda: number; reinforce: boolean }>;
};

export const MEMORY_CATEGORIES = ["preference", "fact", "decision", "entity", "other"] as const;

const DEFAULT_MODEL = "Xenova/bge-small-en-v1.5";
const DEFAULT_QDRANT_URL = "http://localhost:5304";
const DEFAULT_COLLECTION = "neural_nexus_memories";
const DEFAULT_REPLACEMENT_LOG_PATH = "./data/neural_nexus_replacements.sqlite";

export const DEFAULT_CATEGORY_PARAMS: Record<string, { lambda: number; reinforce: boolean }> = {
  preference: { lambda: 0, reinforce: false },
  fact: { lambda: 1e-10, reinforce: true },
  entity: { lambda: 5e-11, reinforce: true },
  decision: { lambda: 2e-10, reinforce: true },
  other: { lambda: 5e-10, reinforce: false },
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveEnvVars(value: string): string {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => process.env[envVar] ?? "");
}

export function normalizeMemoryConfig(input: unknown): MemoryConfig {
  const cfg = asObject(input) ?? {};
  const embedding = asObject(cfg.embedding) ?? {};
  const vectorStoreRaw = asObject(cfg.vectorStore) ?? {};
  const qdrantLegacy = asObject(cfg.qdrant) ?? {};
  const replacementLog = asObject(cfg.replacementLog) ?? {};
  const thresholds = asObject(cfg.thresholds) ?? {};
  const decay = asObject(cfg.decay) ?? {};
  const search = asObject(cfg.search) ?? {};
  const auth = asObject(cfg.auth) ?? {};

  const rawModel = typeof embedding.model === "string" ? embedding.model.trim() : "";

  // --- Vector Store config (with backward-compatible qdrant block) ---
  let vectorStore: MemoryConfig["vectorStore"];

  const hasVectorStore = Object.keys(vectorStoreRaw).length > 0;

  if (hasVectorStore) {
    const provider = typeof vectorStoreRaw.provider === "string" ? vectorStoreRaw.provider.trim() : "qdrant";
    const url = typeof vectorStoreRaw.url === "string" ? resolveEnvVars(vectorStoreRaw.url).trim() : "";
    const collection = typeof vectorStoreRaw.collection === "string" ? vectorStoreRaw.collection.trim() : "";
    const apiKey = typeof vectorStoreRaw.apiKey === "string" ? resolveEnvVars(vectorStoreRaw.apiKey).trim() : "";

    vectorStore = {
      provider: provider as VectorStoreProvider,
      url: url || DEFAULT_QDRANT_URL,
      collection: collection || DEFAULT_COLLECTION,
      apiKey: apiKey || undefined,
    };
  } else {
    vectorStore = {
      provider: "qdrant",
      url: DEFAULT_QDRANT_URL,
      collection: DEFAULT_COLLECTION,
      apiKey: undefined,
    };
  }

  const rawSqlitePath =
    typeof replacementLog.sqlitePath === "string"
      ? resolveEnvVars(replacementLog.sqlitePath).trim()
      : "";

  const authSqlitePath = 
    typeof auth.sqlitePath === "string"
      ? resolveEnvVars(auth.sqlitePath).trim()
      : "./data/neural_nexus_auth.sqlite";

  const authSecret = typeof auth.secret === "string" ? resolveEnvVars(auth.secret).trim() : (process.env.AUTH_SECRET || "default_nexus_secret_change_me");

  return {
    embedding: {
      model: rawModel || DEFAULT_MODEL,
      device: embedding.device === "cpu" ? "cpu" : "cuda",
    },
    vectorStore,
    autoCapture: cfg.autoCapture !== false,
    autoRecall: cfg.autoRecall !== false,
    dedupThreshold: parseFloat(String(cfg.dedupThreshold ?? (process.env.DEDUP_THRESHOLD || "0.5"))),
    dedupMethod: (cfg.dedupMethod || process.env.DEDUP_METHOD || "jaccard") as any,
    consolidation: cfg.consolidation !== false,
    consolidationThreshold:
      typeof cfg.consolidationThreshold === "number" && cfg.consolidationThreshold > 0
        ? Math.floor(cfg.consolidationThreshold)
        : 4,
    replacementLog: {
      enabled: replacementLog.enabled !== false,
      sqlitePath: rawSqlitePath || DEFAULT_REPLACEMENT_LOG_PATH,
    },
    auth: {
      enabled: auth.enabled === true, // Default to disabled for backward compatibility
      secret: authSecret,
      sqlitePath: authSqlitePath,
      tokenExpiry: typeof auth.tokenExpiry === "string" ? auth.tokenExpiry : "30d"
    },
    apiKey: typeof cfg.apiKey === "string" ? resolveEnvVars(cfg.apiKey).trim() : undefined,
    thresholds: {
      similarity: parseFloat(String(thresholds.similarity ?? (process.env.SIMILARITY_THRESHOLD || "0.95"))),
      recall: parseFloat(String(thresholds.recall ?? (process.env.RECALL_THRESHOLD || "0.01"))),
    },
    decay: {
      defaultLambda: parseFloat(String(decay.defaultLambda ?? (process.env.DECAY_LAMBDA || "1e-10"))),
      timeUnit: (decay.timeUnit || process.env.DECAY_TIME_UNIT || "ms") as any,
    },
    search: {
      limit: Math.max(1, parseInt(String(search.limit ?? (process.env.SEARCH_LIMIT || "10")))),
      rrfK: Math.max(1, parseInt(String(search.rrfK ?? (process.env.RRF_K || "60")))),
      hybridAlpha: Math.min(1, Math.max(0, parseFloat(String(search.hybridAlpha ?? (process.env.HYBRID_ALPHA || "0.7"))))),
    },
    categoryParams: (asObject(cfg.categoryParams) as any) ?? DEFAULT_CATEGORY_PARAMS,
  };
}

