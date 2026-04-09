import { EmbeddingService } from "./EmbeddingService.js";
import { type IVectorStore } from "./IVectorStore.js";
import { createVectorStore } from "./vectorStoreFactory.js";
import { DecayEngine } from "./DecayEngine.js";
import { ReplacementAuditService } from "./ReplacementAuditService.js";
import { CategoryService } from "./CategoryService.js";
import { type MemoryConfig } from "./config.js";
import { IMemoryConsolidator, DefaultConsolidator } from "./MemoryConsolidator.js";
import { AuthService } from "./AuthService.js";
import {
    type MemoryCategory,
    type MemoryEntry,
    type RecallRequest,
    type RecallResponse,
    type StoreRequest,
    type ReinforceRequest,
    type AuthContext,
    type MemoryPermission
} from "./types.js";
import { v4 as uuidv4 } from "uuid";
import AsyncLock from "async-lock";
import { ajv, formatValidationError } from "../schemas/index.js";
import { MemoryEntrySchema, AuditEntrySchema } from "../schemas/v1/internal.js";
import { memoryStoredCounter, recallDurationHistogram, recallCountCounter } from "./metrics.js";
import { StatsService } from "./StatsService.js";

const validateMemoryEntry = ajv.compile(MemoryEntrySchema);
const validateAuditEntry = ajv.compile(AuditEntrySchema);

/**
 * NeuralNexusCore: The central Orchestration Layer.
 * It coordinates between Embedding, Storage, Decay, and Audit services.
 * It enforces Atomic Locking and Semantic Deduplication.
 * It also handles Protocol-level Authentication and Authorization.
 */
export class NeuralNexusCore {
    private embedding: EmbeddingService;
    private storage: IVectorStore;
    private decay: DecayEngine;
    public audit: ReplacementAuditService;
    private categoryService: CategoryService;
    private consolidator: IMemoryConsolidator;
    private auth: AuthService;
    private stats: StatsService;
    public lock: AsyncLock;

    constructor(public config: MemoryConfig, options?: { vectorStore?: IVectorStore }) {
        this.embedding = new EmbeddingService(config.embedding.model, config.embedding.device);
        this.storage = options?.vectorStore ?? createVectorStore(config);
        this.decay = new DecayEngine();
        this.audit = new ReplacementAuditService(config.replacementLog.enabled, config.replacementLog.sqlitePath);
        this.categoryService = new CategoryService();
        this.consolidator = new DefaultConsolidator(2000);
        this.auth = new AuthService(
            config.auth.enabled,
            config.auth.secret,
            config.auth.sqlitePath,
            config.auth.tokenExpiry,
            config.apiKey  // nexusPassword used to bootstrap admin user
        );
        this.stats = new StatsService(
            config.replacementLog.sqlitePath.replace('replacements.sqlite', 'stats.sqlite')
        );
        this.lock = new AsyncLock();
    }

    /**
     * Helper to validate permissions based on AuthContext.
     */
    private validatePermissions(context: AuthContext, requiredScope: MemoryPermission) {
        if (!this.config.auth.enabled) return;
        if (!context.scopes.includes(requiredScope)) {
            throw new Error(`Forbidden: Missing required scope '${requiredScope}'`);
        }
    }

    public getAuthService() {
        return this.auth;
    }

    public async getStats() {
        let pointsCount = 0, qdrantStatus = 'unknown', qdrantError: string | null = null;
        let indexedVectorsCount = 0, segmentsCount = 0;
        try {
            const s = await this.storage.getCollectionStats();
            pointsCount = s.pointsCount;
            qdrantStatus = s.status;
            indexedVectorsCount = s.indexedVectorsCount;
            segmentsCount = s.segmentsCount;
        } catch (err: any) {
            qdrantStatus = 'error';
            qdrantError = err?.message ?? 'Unknown error';
        }

        const s = this.stats.getSnapshot();
        const hasRecalls = s.recallsTotal > 0;
        return {
            pointsCount,
            qdrantStatus,
            qdrantError,
            indexedVectorsCount,
            segmentsCount,
            storesTotal: s.storesTotal,
            recallsTotal: s.recallsTotal,
            avgRecallMs: hasRecalls ? Math.round(s.totalRecallMs / s.recallsTotal) : 0,
            fastestRecallMs: hasRecalls ? s.fastestRecallMs : 0,
            slowestRecallMs: s.slowestRecallMs,
            embeddingLoadTimeMs: this.embedding.loadTimeMs,
        };
    }

    public async getCategoryBreakdown(): Promise<Record<string, number>> {
        const categories = Object.keys(this.config.categoryParams);
        try {
            return await this.storage.getCategoryBreakdown(categories);
        } catch {
            return {};
        }
    }

    public async getMergeCount(): Promise<number> {
        try {
            const logs = await this.audit.getLogs(10000);
            return logs.length;
        } catch {
            return 0;
        }
    }

    public setConsolidator(consolidator: IMemoryConsolidator) {
        this.consolidator = consolidator;
    }

    public getEmbedding() {
        return this.embedding;
    }

    /**
     * Initialize all sub-services.
     */
    async initialize() {
        await this.embedding.initialize();
        const dim = this.embedding.getDim();
        if (dim === null) {
            throw new Error("NeuralNexusCore: Could not determine embedding dimension.");
        }
        await this.storage.initialize(dim);
        await this.audit.initialize();
        await this.auth.initialize();
        await this.stats.initialize();
    }

    /**
     * Recall relevant memories using Hybrid Search (Vector + Keyword) and Decay scoring.
     */
    async recall(request: RecallRequest, context: AuthContext): Promise<RecallResponse> {
        const startMs = Date.now();
        this.validatePermissions(context, "memory:read");

        // Ownership rule:
        // - `userid` is always the HUMAN owner / tenant.
        // - `agentid` records which AI/client stored the memory.
        // Tenant isolation must always use `userid`, never `agentid`.
        const userid = context.userId;
        
        const vector = await this.embedding.createVector(request.query);
        const results = await this.storage.find({
            vector,
            limit: request.limit || this.config.search.limit,
            userid,
            query: request.query,
            rrfK: this.config.search.rrfK,
            alpha: this.config.search.hybridAlpha ?? 0.7
        });

        // Filter by recall threshold
        const countBeforeFiltering = results.length;
        const threshold = this.config.thresholds.recall;
        const validResults = results.filter(res => (res.score ?? 0) >= threshold);

        const memories: MemoryEntry[] = validResults.map((res: any) => {
            const payload = res.payload || {};
            const score = res.score ?? res.payload?._original_score ?? 0;
            const catParams = this.config.categoryParams || { other: { lambda: 1e-10 } };
            const params = catParams[payload.category] ?? catParams.other ?? { lambda: 1e-10 };
            const lambda = params.lambda;

            const decayedScore = this.decay.calculateScore(
                score,
                payload.last_accessed_at ? new Date(payload.last_accessed_at).getTime() : (payload.last_accessed || 0),
                lambda,
                payload.strength ?? 1,
                this.config.decay.timeUnit || "ms",
                payload.created_at ? new Date(payload.created_at).getTime() : 0
            );

            return {
                id: res.id.toString(),
                text: payload.text,
                category: payload.category,
                vector: res.vector ?? [],
                metadata: {
                    ...payload,
                    decayed_score: decayedScore,
                    search_score: score,
                    score_type: request.query ? "rrf" : "cosine"
                }
            };
        });

        memories.sort((a, b) => ((b.metadata.decayed_score as number) || 0) - ((a.metadata.decayed_score as number) || 0));

        const response: RecallResponse = {
            memories,
            metadata: {
                search_type: request.query ? "hybrid" : "vector",
                threshold_applied: threshold,
                countBeforeFiltering
            }
        };

        const durationMs = Date.now() - startMs;
        const labels = { user_id: context.userId, adapter_id: context.adapterId || 'unknown' };
        recallCountCounter.add(1, labels);
        recallDurationHistogram.record(durationMs / 1000, labels);
        this.stats.recordRecall(durationMs).catch(() => {});

        if (request.maxTokens) {
            return this.applyTokenBudget(memories, request.maxTokens);
        }

        return response;
    }

    /**
     * Store or Update a memory with semantic deduplication and atomic locking.
     */
    async store(request: StoreRequest, context: AuthContext): Promise<void> {
        this.validatePermissions(context, "memory:write");
        
        // Tenant Isolation: Force userid from context
        const userid = context.userId;
        const vector = await this.embedding.createVector(request.text);

        await this.lock.acquire(`store:${userid}`, async () => {
            const existing = await this.storage.find({ vector, limit: 1, userid });
            const threshold = this.config.thresholds.similarity;

            const match = existing[0];
            const similarity = match?.payload?._original_score ?? match?.score ?? 0;

            if (match && similarity >= threshold) {
                // handleMerge already uses userid internally
                return this.handleMerge(match, request, userid, vector);
            }

            const id = uuidv4();
            const payload = {
                id,
                text: request.text,
                category: request.category || this.detectCategory(request.text),
                last_accessed_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                strength: 1,
                userid: userid,
                agentid: context.agentId ?? null,
                stored_by_key_id: context.apiKeyId ?? null,
                stored_by_model: context.apiKeyModelName ?? null,
                metadata: request.metadata
            };

            const isValid = validateMemoryEntry(payload);
            if (!isValid) {
                const err = formatValidationError(validateMemoryEntry.errors);
                throw new Error(`Internal Validation Failed - Memory Entry: ${err}`);
            }

            await this.storage.store(id, vector, payload);
        });

        memoryStoredCounter.add(1, { user_id: context.userId, adapter_id: context.adapterId });
        this.stats.recordStore().catch(() => {});
    }

    /**
     * Reinforce a memory's strength atomically.
     */
    async reinforce(request: ReinforceRequest, context: AuthContext): Promise<void> {
        this.validatePermissions(context, "memory:update");
        
        await this.lock.acquire(`reinforce:${request.memoryId}`, async () => {
            const point = await this.storage.getPoint(request.memoryId);
            if (!point) {
                 return;
            }

            // Tenant Isolation: Ensure point belongs to user
            if ((point.payload as any).userid !== context.userId) {
                throw new Error("Forbidden: Access denied to this memory resource.");
            }

            const currentStrength = (point.payload as any).strength || 1;
            const newStrength = currentStrength + (request.strengthAdjustment || 0.05);

            await this.storage.updatePayload(request.memoryId, {
                strength: newStrength,
                last_accessed_at: new Date().toISOString()
            });
        });
    }

    async deleteMemory(memoryId: string, context: AuthContext): Promise<boolean> {
        this.validatePermissions(context, "memory:delete");

        const point = await this.storage.getPoint(memoryId);
        if (!point) {
            return false;
        }

        if ((point.payload as any).userid !== context.userId) {
            throw new Error("Forbidden: Access denied to this memory resource.");
        }

        return this.storage.delete(memoryId);
    }

    async getAuditLogs(context: AuthContext, limit?: number) {
        // Only admins can see audit logs for now, or we could filter by userid in audit table
        this.validatePermissions(context, "admin:users");
        return await this.audit.getLogs(limit);
    }

    async exportMemories(context: AuthContext) {
        this.validatePermissions(context, "memory:read");
        const points = await this.storage.scrollAll(context.userId);
        return points.map((p) => ({
            id: p.id,
            vector: p.vector,
            payload: p.payload,
        }));
    }

    async importMemories(memories: any[], context: AuthContext) {
        this.validatePermissions(context, "memory:write");
        if (!Array.isArray(memories)) throw new Error("Invalid import format");

        const CHUNK_SIZE = 50;
        for (let i = 0; i < memories.length; i += CHUNK_SIZE) {
            const chunk = memories.slice(i, i + CHUNK_SIZE);
            const points = chunk.map((m) => {
                const entryId = m.id || uuidv4();
                const payload = {
                    id: entryId,
                    text: m.payload?.text || "",
                    category: m.payload?.category || "other",
                    last_accessed_at: new Date(m.payload?.last_accessed || Date.now()).toISOString(),
                    created_at: new Date(m.payload?.created_at || Date.now()).toISOString(),
                    updated_at: new Date().toISOString(),
                    strength: m.payload?.strength || 1,
                    userid: context.userId, // Force current user
                    metadata: {} 
                };
                
                const isValid = validateMemoryEntry(payload);
                if (!isValid) {
                     console.warn(`Skipping malformed imported memory ${entryId}:`, formatValidationError(validateMemoryEntry.errors));
                     return null;
                }

                return {
                    id: entryId,
                    vector: m.vector || [],
                    payload,
                };
            }).filter(p => p !== null);
            await this.storage.storeBatch(points as any[]);
        }
    }

    // --- Public Helper Logic (Used by adapters and for testing) ---

    public async applyTokenBudget(memories: MemoryEntry[], maxTokens: number): Promise<RecallResponse> {
        const budgeted: MemoryEntry[] = [];
        let currentCount = 0;
        for (const m of memories) {
            const tokens = await this.embedding.countTokens(m.text);
            if (currentCount + tokens <= maxTokens) {
                budgeted.push(m);
                currentCount += tokens;
            } else break;
        }
        return { memories: budgeted };
    }

    public detectCategory(text: string): MemoryCategory {
        return this.categoryService.detectCategory(text);
    }

    /**
     * Refines a list of retrieved memories against a chat history context
     * using the configured deduplication strategy (Jaccard, Cosine, or Substring).
     */
    public async refineContext(memories: MemoryEntry[], historyText: string): Promise<MemoryEntry[]> {
        const method = this.config.dedupMethod || "jaccard";
        const threshold = this.config.dedupThreshold ?? 0.5;
        const lowerHistory = historyText.toLowerCase();

        // Hoist expensive computations out of the per-memory loop
        let historyVector: number[] | undefined;
        if (method === "cosine") {
            historyVector = await this.embedding.createVector(historyText);
        }

        let historyTokens: Set<string> | undefined;
        if (method === "jaccard") {
            historyTokens = new Set(lowerHistory.split(/\s+/).filter((t: string) => t.length > 3));
        }

        const results = await Promise.all(memories.map(async (m: any) => {
            if (method === "substring") {
                return !lowerHistory.includes((m.text as string).toLowerCase()) ? m : null;
            }

            if (method === "jaccard") {
                const memoryTokens: Set<string> = new Set((m.text as string).toLowerCase().split(/\s+/).filter((t: string) => t.length > 3));
                let intersection = 0;
                memoryTokens.forEach((t: string) => { if (historyTokens!.has(t)) intersection++; });
                const unionSize = new Set<string>([...historyTokens!, ...memoryTokens]).size;
                const jaccard = unionSize === 0 ? 0 : intersection / unionSize;
                return jaccard < threshold ? m : null;
            }

            if (method === "cosine") {
                const similarity = this.embedding.cosineSimilarity(m.vector, historyVector!);
                return similarity < threshold ? m : null;
            }

            return m;
        }));

        return results.filter(m => m !== null) as MemoryEntry[];
    }

    public static normalizeWhitespace(value: string): string {
        return value.replace(/\s+/g, " ").trim();
    }

    public extractText(content: unknown): string | null {
        if (typeof content === "string") {
            const normalized = NeuralNexusCore.normalizeWhitespace(content);
            return normalized.length > 0 ? normalized : null;
        }

        if (Array.isArray(content)) {
            const parts: string[] = [];
            for (const part of content) {
                if (!part || typeof part !== "object") {
                    continue;
                }
                const maybeText = (part as { text?: unknown }).text;
                if (typeof maybeText === "string" && maybeText.trim()) {
                    parts.push(maybeText.trim());
                }
            }
            if (parts.length > 0) {
                return NeuralNexusCore.normalizeWhitespace(parts.join(" "));
            }
        }

        return null;
    }

    public userMessages(messages: unknown[]): string[] {
        const texts: string[] = [];

        for (const msg of messages) {
            if (!msg || typeof msg !== "object") {
                continue;
            }

            const typed = msg as any;
            if (typed.role !== "user") {
                continue;
            }

            const text = this.extractText(typed.content);
            if (text) {
                texts.push(text);
            }
        }

        return texts;
    }

    public extractCandidate(messages: unknown[]): string | null {
        const userTexts = this.userMessages(messages);
        const last = userTexts[userTexts.length - 1];
        if (!last || last.length < 25) {
            return null;
        }
        return last.slice(0, 1200);
    }

    public consolidate(messages: unknown[], threshold: number): string | null {
        const userTexts = this.userMessages(messages);
        if (userTexts.length === 0) {
            return null;
        }

        if (userTexts.length < threshold) {
            return this.extractCandidate(messages);
        }

        const deduped: string[] = [];
        const seen = new Set<string>();

        for (const text of userTexts.slice(-12)) {
            if (text.length < 10) {
                continue;
            }
            const key = text.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            deduped.push(text);
        }

        if (deduped.length === 0) {
            return null;
        }

        return NeuralNexusCore.normalizeWhitespace(deduped.join(" ")).slice(0, 1200);
    }

    // --- Internal Logic ---

    private async handleMerge(bestMatch: any, request: StoreRequest, userid: string, incomingVector: number[]) {
        const id = bestMatch.id.toString();
        const strategy = request.mergeStrategy || "recompute";

        let finalVector = incomingVector;
        let finalText = request.text;

        if (strategy === "average" && bestMatch.vector?.length === incomingVector.length) {
            finalVector = bestMatch.vector.map((val: number, i: number) => (val + incomingVector[i]) / 2);
            finalText = await this.consolidator.consolidate({
                oldText: bestMatch.payload.text,
                newText: request.text,
                category: request.category || bestMatch.payload.category
            });
        } else if (strategy === "replace") {
            // Use incomingVector and request.text (defaults)
        } else {
            // "recompute" strategy (default)
            finalText = await this.consolidator.consolidate({
                oldText: bestMatch.payload.text,
                newText: request.text,
                category: request.category || bestMatch.payload.category
            });
            finalVector = await this.embedding.createVector(finalText);
        }

        const updatedPayload = {
            id,
            text: finalText,
            category: request.category || bestMatch.payload.category,
            last_accessed_at: new Date().toISOString(),
            created_at: bestMatch.payload.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            strength: Math.min((bestMatch.payload.strength || 1) + 0.1, 1),
            userid: userid,
            agentid: bestMatch.payload.agentid ?? null,
            stored_by_key_id: bestMatch.payload.stored_by_key_id ?? null,
            stored_by_model: bestMatch.payload.stored_by_model ?? null,
            metadata: request.metadata || {}
        };

        const isMemValid = validateMemoryEntry(updatedPayload);
        if (!isMemValid) throw new Error("Merged memory validation failed: " + formatValidationError(validateMemoryEntry.errors));

        await this.storage.store(id, finalVector, updatedPayload);

        const auditData = {
            id: 0, // SQLite auto-increments, 0 is ignored or temporary for schema check
            old_text: bestMatch.payload.text,
            new_text: finalText,
            similarity_score: bestMatch.payload?._original_score ?? bestMatch.score ?? 0,
            timestamp: new Date().toISOString(),
            userid: userid
        };

        if (validateAuditEntry(auditData)) {
            await this.audit.logReplacement({
                memoryId: id,
                category: request.category || bestMatch.payload.category,
                oldText: bestMatch.payload.text,
                newText: finalText,
                similarityScore: bestMatch.payload?._original_score ?? bestMatch.score ?? 0,
                replacedAt: Date.now()
            });
        } else {
             console.warn("Audit Log Validation Failed:", formatValidationError(validateAuditEntry.errors));
        }
    }
}
