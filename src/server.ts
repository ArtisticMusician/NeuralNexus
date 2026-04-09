import fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import addFormats from "ajv-formats";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createInterface } from "readline";
import { Readable, Transform, TransformCallback } from "stream";
import { NeuralNexusCore } from "./core/NeuralNexusCore.js";
import { normalizeMemoryConfig, MEMORY_CATEGORIES } from "./core/config.js";
import { Schemas } from "./schemas/index.js";
import "dotenv/config";

import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { spawn, exec } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Number of records to accumulate before flushing to the store. */
const IMPORT_BATCH_SIZE = 500;

/** Maximum bytes allowed in a single JSONL line (10 MB). */
const MAX_LINE_BYTES = 10 * 1024 * 1024;

/**
 * Sits between the raw request stream and readline.
 * Counts bytes since the last newline; if any single line
 * exceeds `maxLineBytes`, it destroys the pipeline with an
 * error *before* readline can finish buffering it.
 */
class LineLengthGuard extends Transform {
    private bytesSinceNewline = 0;

    constructor(private readonly maxLineBytes: number) {
        super();
    }

    _transform(
        chunk: Buffer,
        _encoding: string,
        callback: TransformCallback,
    ): void {
        for (let i = 0; i < chunk.length; i++) {
            if (chunk[i] === 0x0a) {
                this.bytesSinceNewline = 0;
            } else {
                this.bytesSinceNewline++;
                if (this.bytesSinceNewline > this.maxLineBytes) {
                    callback(
                        new Error(
                            `Line exceeds the ${this.maxLineBytes}-byte limit. ` +
                            `Use newline-delimited JSON (one object per line).`,
                        ),
                    );
                    return;
                }
            }
        }

        this.push(chunk);
        callback();
    }
}

export const server = fastify({
    logger: true,
    ajv: {
        customOptions: {
            strict: true,
            removeAdditional: false,
            coerceTypes: false,
            allErrors: true,
            useDefaults: true
        },
        plugins: [
            // @ts-ignore — ajv-formats type mismatch with this fastify version
            addFormats
        ]
    }
});

// Configure CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000,http://localhost:6969").split(",");
await server.register(cors, {
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) {
            cb(null, true);
            return;
        }
        cb(new Error("Not allowed by CORS"), false);
    },
});

// Serve Dashboard - Look in multiple locations for resilience
const possiblePaths = [
    join(process.cwd(), "dashboard", "dist", "dashboard"),
    join(process.cwd(), "dist", "dashboard"),
    join(__dirname, "..", "dashboard"),
    join(__dirname, "..", "..", "dashboard"),
    join(process.cwd(), "dashboard"),
];
let dashboardPath = possiblePaths[0];
for (const p of possiblePaths) {
    if (existsSync(p)) {
        dashboardPath = p;
        break;
    }
}

server.register(fastifyStatic, {
    root: dashboardPath,
    prefix: "/",
});

// Initialize Error Handler
import { formatValidationError } from "./schemas/index.js";

server.setErrorHandler((error: any, request, reply) => {
    if (error.validation) {
        const message = formatValidationError(error.validation);
        reply.status(400).send({
            error: "Bad Request",
            message: `Validation failed: ${message}`,
            details: error.validation
        });
        return;
    }

    const status = error.statusCode ?? error.status ?? 500;
    const message = error.message ?? "Internal Server Error";
    reply.status(status).send({ error: message });
});

// Streaming content-type parsers: pass the raw Readable through
// so the route handler can consume it incrementally.
server.addContentTypeParser(
    ["application/x-ndjson", "application/jsonl", "text/plain"],
    function (
        _request: any,
        payload: any,
        done: (err: Error | null, body?: any) => void,
    ) {
        done(null, payload);
    },
);

// Initialize Core Configuration
const config = normalizeMemoryConfig({
    embedding: {
        model: process.env.EMBEDDING_MODEL,
        device: process.env.EMBEDDING_DEVICE || "cpu",
    },
    vectorStore: {
        provider: process.env.VECTOR_STORE_PROVIDER as any || "qdrant",
        url: process.env.QDRANT_URL,
        collection: process.env.QDRANT_COLLECTION,
        apiKey: process.env.QDRANT_API_KEY,
    },
    replacementLog: {
        enabled: process.env.REPLACEMENT_LOG_ENABLED !== "false",
        sqlitePath: process.env.REPLACEMENT_LOG_PATH,
    },
    auth: {
        enabled: process.env.AUTH_ENABLED === "true",
        secret: process.env.AUTH_SECRET,
        sqlitePath: process.env.AUTH_SQLITE_PATH,
        tokenExpiry: process.env.AUTH_TOKEN_EXPIRY
    },
    apiKey: process.env.NEXUS_PASSWORD,
});

export const core = new NeuralNexusCore(config);

const ENV_PATH = join(process.cwd(), ".env");

async function updateEnvValues(updates: Record<string, string>): Promise<void> {
    let content = "";
    try {
        content = await readFile(ENV_PATH, "utf8");
    } catch {
        content = "";
    }

    const lines = content.length > 0 ? content.split(/\r?\n/) : [];
    const touched = new Set<string>();

    const nextLines = lines.map(line => {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match) return line;

        const key = match[1];
        if (!(key in updates)) return line;

        touched.add(key);
        return `${key}=${updates[key]}`;
    });

    for (const [key, value] of Object.entries(updates)) {
        if (!touched.has(key)) {
            nextLines.push(`${key}=${value}`);
        }
    }

    await writeFile(ENV_PATH, `${nextLines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

function parsePort(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback;
}

function getConfiguredApiPort(): number {
    return parsePort(process.env.PORT, 8008);
}

function getConfiguredProxyPort(): number {
    return parsePort(process.env.OPENAI_PROXY_PORT, 3001);
}

function getConfiguredQdrantUrl(): string {
    return process.env.QDRANT_URL || core.config.vectorStore.url || "http://localhost:5304";
}

function getConfiguredQdrantPort(): number {
    try {
        return parsePort(new URL(getConfiguredQdrantUrl()).port || 5304, 5304);
    } catch {
        return 5304;
    }
}

/**
 * Authentication Hook: Secures the API.
 * Priority: DB-based API key → JWT Bearer token → anonymous fallback
 *
 * Important terminology:
 * - `userId` is the HUMAN owner / tenant for memories.
 * - `agentId` is the AI/client acting on behalf of that human.
 *
 * API keys authenticate an agent, but they must resolve to the HUMAN owner
 * who created the key. Tenant isolation must always use the human `userId`.
 */
server.addHook("preHandler", async (request, reply) => {
    const url = request.url.split("?")[0];
    if (url === "/health" || url === "/auth/login") return;

    // 1. DB-backed API Key check (for LLM integrations)
    const rawApiKey = request.headers["x-api-key"] || (request.query as any)["api_key"];
    if (rawApiKey && typeof rawApiKey === "string") {
        const authService = core.getAuthService();
        const keyRecord = await authService.verifyApiKey(rawApiKey);
        if (keyRecord) {
            (request as any).auth = {
                userId: keyRecord.user_id || `apikey:${keyRecord.id}`,
                tokenId: keyRecord.id,
                agentId: keyRecord.name,
                apiKeyId: keyRecord.id,
                apiKeyModelName: keyRecord.model_name,
                scopes: ["memory:read", "memory:write", "memory:update", "memory:delete"],
                adapterId: "fastify-api-key"
            };
            return;
        }
        // Key provided but not valid — deny immediately
        return reply.status(401).send({ error: "Unauthorized: Invalid API key" });
    }

    // 2. JWT Bearer token (dashboard sessions and JWT-based integrations)
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
            const authService = core.getAuthService();
            const context = await authService.verifyToken(token, "fastify", request.ip);
            (request as any).auth = context;
            return;
        } catch (err: any) {
            return reply.status(401).send({ error: "Unauthorized", message: err.message });
        }
    }

    // 3. Anonymous fallback (only when auth is fully disabled and no API key configured)
    if (!config.auth.enabled && !config.apiKey) {
        const headerUserId = request.headers["userid"] || request.headers["x-userid"];
        const headerAgentId = request.headers["agentid"] || request.headers["x-agentid"];
        const userId = (Array.isArray(headerUserId) ? headerUserId[0] : headerUserId) || "anonymous";
        const agentId = (Array.isArray(headerAgentId) ? headerAgentId[0] : headerAgentId) || "anonymous-agent";
        (request as any).auth = {
            userId,
            agentId,
            tokenId: "unauthenticated",
            scopes: ["memory:read", "memory:write", "memory:update", "memory:delete"],
            adapterId: "fastify-anonymous"
        };
        return;
    }

    return reply.status(401).send({ error: "Unauthorized: Valid JWT or API key required" });
});

server.addHook("onReady", async () => {
    await core.initialize();
    server.log.info("Neural Nexus Core initialized");
});

// --- Endpoints ---

// Dashboard login — returns a JWT for dashboard sessions
server.post("/auth/login", async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };
    if (!username || !password) return reply.status(400).send({ error: "Username and password required" });
    try {
        const authService = core.getAuthService();
        const token = await authService.login(username, password);
        return { token };
    } catch (err: any) {
        return reply.status(401).send({ error: err.message });
    }
});

server.post("/auth/register", async (request, reply) => {
    const { username } = request.body as { username: string };
    if (!username) return reply.status(400).send({ error: "Username required" });
    const authService = core.getAuthService();
    const userId = await authService.createUser(username);
    return { userId, status: "created" };
});

server.post("/auth/token", async (request, reply) => {
    const { userId, description, scopes } = request.body as { userId: string, description: string, scopes: any[] };
    const authService = core.getAuthService();
    const token = await authService.createToken(userId, scopes, description || "Manual Token");
    return { token };
});

server.get("/auth/tokens", async (request, reply) => {
    const context = (request as any).auth;
    const { userId } = request.query as { userId?: string };
    if (!context.scopes.includes("admin:tokens") && context.userId !== userId) {
        return reply.status(403).send({ error: "Forbidden: Cannot list tokens for other users." });
    }
    const authService = core.getAuthService();
    const tokens = await authService.listTokens(userId || context.userId);
    return { tokens };
});

server.delete("/auth/tokens/:tokenId", async (request, reply) => {
    const context = (request as any).auth;
    const { tokenId } = request.params as { tokenId: string };
    if (!context.scopes.includes("admin:tokens")) {
        return reply.status(403).send({ error: "Forbidden: Admin required to revoke tokens." });
    }
    const authService = core.getAuthService();
    await authService.revokeToken(tokenId);
    return { status: "revoked", tokenId };
});

// ── API Key management ────────────────────────────────────────────────────────

server.get("/admin/api-keys", async (request, reply) => {
    const authService = core.getAuthService();
    const keys = await authService.listApiKeys();
    return { keys };
});

server.post("/admin/api-keys", async (request, reply) => {
    const context = (request as any).auth;
    const { name, model_name } = request.body as { name: string; model_name?: string };
    if (!name) return reply.status(400).send({ error: "Name required" });
    const authService = core.getAuthService();
    const result = await authService.createApiKey(name, model_name, context.userId);
    return reply.status(201).send(result);
});

server.delete("/admin/api-keys/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const authService = core.getAuthService();
    await authService.deleteApiKey(id);
    return { status: "deleted", id };
});

server.post("/admin/api-keys/:id/revoke", async (request, reply) => {
    const { id } = request.params as { id: string };
    const authService = core.getAuthService();
    await authService.revokeApiKey(id);
    return { status: "revoked", id };
});

// ── User management ───────────────────────────────────────────────────────────

server.get("/admin/users", async (request, reply) => {
    const authService = core.getAuthService();
    const users = await authService.listUsers();
    return { users };
});

server.post("/admin/users", async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };
    if (!username || !password) return reply.status(400).send({ error: "Username and password required" });
    const authService = core.getAuthService();
    const userId = await authService.createUser(username, password);
    return reply.status(201).send({ userId, status: "created" });
});

server.delete("/admin/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const authService = core.getAuthService();
    await authService.deleteUser(id);
    return { status: "deleted", id };
});

server.post("/recall", {
    schema: {
        body: Schemas.V1.API.RecallRequestBodySchema
    }
}, async (request, reply) => {
    const body = request.body as any;
    const context = (request as any).auth;

    const results = await core.recall({
        query: body.query,
        limit: body.limit,
        maxTokens: body.max_tokens || body.maxTokens,
    }, context);

    if (context.apiKeyId) {
        core.getAuthService().incrementApiKeyRecall(context.apiKeyId).catch(() => {});
    }

    return results;
});

server.post("/store", {
    schema: {
        body: Schemas.V1.API.StoreRequestBodySchema
    }
}, async (request, reply) => {
    const body = request.body as any;
    const context = (request as any).auth;

    await core.store({
        text: body.text,
        category: body.category,
        metadata: body.metadata,
    }, context);

    if (context.apiKeyId) {
        core.getAuthService().incrementApiKeyStore(context.apiKeyId).catch(() => {});
    }

    return reply.status(201).send({ status: "stored" });
});

server.post("/reinforce", {
    schema: {
        body: Schemas.V1.API.ReinforceRequestBodySchema
    }
}, async (request, reply) => {
    const body = request.body as any;
    const context = (request as any).auth;

    await core.reinforce({
        memoryId: body.memory_id || body.memoryId,
        strengthAdjustment: body.strength_adjustment ?? 0.05,
    }, context);

    return { status: "reinforced" };
});

server.get("/audit", {
    schema: {
        querystring: Schemas.V1.API.AuditQueryStringSchema
    }
}, async (request) => {
    const query = request.query as any;
    const context = (request as any).auth;
    const limit = query.limit ? parseInt(query.limit) : 50;
    return await core.getAuditLogs(context, limit);
});

server.get("/health", async () => {
    const stats = await core.getStats();

    const qdrantOk  = stats.qdrantStatus === 'ok' || stats.qdrantStatus === 'green';
    const overallOk = qdrantOk;

    return {
        status: overallOk ? "ok" : "degraded",
        uptime: process.uptime(),
        version: "1.0.0",
        components: {
            server: { status: "ok", version: "1.0.0", error: null },
            qdrant: {
                status: qdrantOk ? "ok" : "error",
                version: "1.9.0",
                collectionStatus: stats.qdrantStatus,
                error: stats.qdrantError ? `${stats.qdrantError} (${getConfiguredQdrantUrl()})` : null,
            },
        },
        vectorStore: core.config.vectorStore.provider,
        ...stats,
    };
});

server.get("/memories", async (request, reply) => {
    const limit = Math.min(parseInt((request.query as any)?.limit || "200"), 1000);
    const context = (request as any).auth;
    const showAllUsers = String((request.query as any)?.all_users || "") === "true";
    const points = showAllUsers && context.scopes.includes("admin:users")
        ? await (core as any).storage.scrollAllUsers()
        : await (core as any).storage.scrollAll(context.userId);
    const memories = points
        .map((p: any) => ({
            id: p.id,
            text: p.payload?.text,
            category: p.payload?.category,
            created_at: p.payload?.created_at,
            last_accessed_at: p.payload?.last_accessed_at,
            strength: p.payload?.strength,
            score: null,
            agentid: p.payload?.agentid,
            stored_by_model: p.payload?.stored_by_model,
            stored_by_key_id: p.payload?.stored_by_key_id,
            userid: p.payload?.userid,
        }))
        .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, limit);
    return { memories };
});

server.post("/admin/memories/reassign", async (request, reply) => {
    const context = (request as any).auth;
    if (!context.scopes.includes("admin:users")) {
        return reply.status(403).send({ error: "Forbidden: Admin required to reassign memories." });
    }

    const body = request.body as {
        ids?: string[];
        userid?: string;
        agentid?: string;
    };

    const ids = Array.isArray(body?.ids) ? body.ids.filter(id => typeof id === "string" && id.trim().length > 0) : [];
    const nextUserId = typeof body?.userid === "string" ? body.userid.trim() : "";
    const nextAgentId = typeof body?.agentid === "string" ? body.agentid.trim() : "";

    if (!ids.length) {
        return reply.status(400).send({ error: "At least one memory id is required." });
    }
    if (!nextUserId) {
        return reply.status(400).send({ error: "Target userid is required." });
    }

    const updated: string[] = [];
    for (const id of ids) {
        const point = await (core as any).storage.getPoint(id);
        if (!point) continue;

        // Admin repair tool:
        // - `userid` is the human owner / tenant the memory belongs to.
        // - `agentid` is provenance for the AI/client that stored it.
        // This endpoint exists specifically so admins can repair legacy records
        // that were written before ownership and provenance were split cleanly.
        const payload = {
            userid: nextUserId,
            ...(nextAgentId ? { agentid: nextAgentId } : {})
        };

        await (core as any).storage.updatePayload(String(point.id), payload);
        updated.push(id);
    }

    return {
        status: "ok",
        updatedCount: updated.length,
        ids: updated,
    };
});

server.get("/config", async () => {
    return {
        thresholds: {
            similarity: core.config.thresholds.similarity,
            recall: core.config.thresholds.recall,
        },
        search: {
            hybridAlpha: core.config.search.hybridAlpha,
            limit: core.config.search.limit,
            rrfK: core.config.search.rrfK,
        },
        embedding: {
            model: core.config.embedding.model,
            device: core.config.embedding.device,
        },
        vectorStore: {
            provider: core.config.vectorStore.provider,
            url: core.config.vectorStore.url,
            collection: core.config.vectorStore.collection,
        },
        decay: {
            defaultLambda: core.config.decay.defaultLambda,
            timeUnit: core.config.decay.timeUnit,
        },
        dedupThreshold: core.config.dedupThreshold,
        dedupMethod: core.config.dedupMethod,
        consolidation: core.config.consolidation,
        consolidationThreshold: core.config.consolidationThreshold,
        ports: {
            api: getConfiguredApiPort(),
            proxy: getConfiguredProxyPort(),
            qdrant: getConfiguredQdrantPort(),
        },
    };
});

server.post("/config", async (request, reply) => {
    const body = request.body as any;

    const similarity = Number(body?.thresholds?.similarity);
    const recall = Number(body?.thresholds?.recall);
    const hybridAlpha = Number(body?.search?.hybridAlpha);
    const decayLambda = Number(body?.decay?.defaultLambda);
    const apiPort = Number(body?.ports?.api);
    const proxyPort = Number(body?.ports?.proxy);
    const qdrantPort = Number(body?.ports?.qdrant);

    const isFiniteInRange = (value: number, min: number, max: number) =>
        Number.isFinite(value) && value >= min && value <= max;
    const isValidPort = (value: number) => Number.isInteger(value) && value >= 1 && value <= 65535;

    if (!isFiniteInRange(similarity, 0, 1)) {
        return reply.status(400).send({ error: "Invalid similarity threshold" });
    }
    if (!isFiniteInRange(recall, 0, 1)) {
        return reply.status(400).send({ error: "Invalid recall threshold" });
    }
    if (!isFiniteInRange(hybridAlpha, 0, 1)) {
        return reply.status(400).send({ error: "Invalid hybrid alpha" });
    }
    if (!Number.isFinite(decayLambda) || decayLambda < 0) {
        return reply.status(400).send({ error: "Invalid decay rate" });
    }
    if (!isValidPort(apiPort)) {
        return reply.status(400).send({ error: "Invalid API port" });
    }
    if (!isValidPort(proxyPort)) {
        return reply.status(400).send({ error: "Invalid proxy port" });
    }
    if (!isValidPort(qdrantPort)) {
        return reply.status(400).send({ error: "Invalid vector database port" });
    }

    const uniquePorts = new Set([apiPort, proxyPort, qdrantPort]);
    if (uniquePorts.size < 3) {
        return reply.status(400).send({ error: "Each configured port must be unique." });
    }

    core.config.thresholds.similarity = similarity;
    core.config.thresholds.recall = recall;
    core.config.search.hybridAlpha = hybridAlpha;
    core.config.decay.defaultLambda = decayLambda;
    core.config.vectorStore.url = `http://localhost:${qdrantPort}`;

    process.env.SIMILARITY_THRESHOLD = String(similarity);
    process.env.RECALL_THRESHOLD = String(recall);
    process.env.HYBRID_ALPHA = String(hybridAlpha);
    process.env.DECAY_LAMBDA = String(decayLambda);
    process.env.PORT = String(apiPort);
    process.env.OPENAI_PROXY_PORT = String(proxyPort);
    process.env.QDRANT_URL = `http://localhost:${qdrantPort}`;

    await updateEnvValues({
        SIMILARITY_THRESHOLD: String(similarity),
        RECALL_THRESHOLD: String(recall),
        HYBRID_ALPHA: String(hybridAlpha),
        DECAY_LAMBDA: String(decayLambda),
        PORT: String(apiPort),
        OPENAI_PROXY_PORT: String(proxyPort),
        QDRANT_URL: `http://localhost:${qdrantPort}`,
    });

    return {
        status: "saved",
        thresholds: core.config.thresholds,
        search: {
            hybridAlpha: core.config.search.hybridAlpha,
        },
        decay: {
            defaultLambda: core.config.decay.defaultLambda,
        },
        ports: {
            api: apiPort,
            proxy: proxyPort,
            qdrant: qdrantPort,
        },
        restartRequired: true,
    };
});

server.get("/categories", async () => {
    return { categories: MEMORY_CATEGORIES };
});

server.get("/admin/stats/categories", async (_request, reply) => {
    const breakdown = await core.getCategoryBreakdown();
    return { categories: breakdown };
});

server.get("/admin/stats/merges", async (_request, reply) => {
    const count = await core.getMergeCount();
    const recent = await core.audit.getLogs(20);
    return { mergeCount: count, recent };
});

server.post("/admin/restart-qdrant", async (_request, reply) => {
    try {
        const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
        spawn(npmCmd, ["run", "nexus"], {
            cwd: process.cwd(),
            detached: true,
            stdio: "ignore",
            shell: false,
        }).unref();

        return { status: "restarting", command: "npm run nexus" };
    } catch (err: any) {
        return reply.status(500).send({ error: err.message });
    }
});

// Admin Endpoints
server.get("/admin/export", {
    schema: {
        querystring: Schemas.V1.API.ExportQueryStringSchema
    }
}, async (request, reply) => {
    const context = (request as any).auth;
    const memories = await core.exportMemories(context);

    reply.header(
        "Content-Disposition",
        "attachment; filename=nexus_export.jsonl",
    );
    reply.header("Content-Type", "application/x-ndjson");

    return memories.map((m) => JSON.stringify(m)).join("\n");
});

server.post("/admin/import", async (request, reply) => {
    let totalImported = 0;
    let parseErrors = 0;
    let batch: any[] = [];
    const context = (request as any).auth;

    /** Flush the current batch to persistent storage. */
    const flushBatch = async (): Promise<void> => {
        if (batch.length === 0) return;
        const toImport = batch;
        batch = [];
        await core.importMemories(toImport, context);
        totalImported += toImport.length;
    };

    // ── Path A: Streaming (NDJSON / JSONL / text/plain) ──────────
    if (request.body && typeof (request.body as any).pipe === "function") {
        const raw = request.body as Readable;
        const guard = new LineLengthGuard(MAX_LINE_BYTES);
        const guarded = raw.pipe(guard);

        const rl = createInterface({
            input: guarded,
            crlfDelay: Infinity,
        });

        try {
            for await (const rawLine of rl) {
                const trimmed = rawLine.trim();
                if (!trimmed || trimmed === "[" || trimmed === "]") continue;

                const cleaned = trimmed.endsWith(",")
                    ? trimmed.slice(0, -1)
                    : trimmed;

                try {
                    batch.push(JSON.parse(cleaned));
                } catch {
                    parseErrors++;
                    server.log.warn(
                        `Import: skipping malformed line (error #${parseErrors})`,
                    );
                    if (parseErrors > 100) {
                        raw.destroy();
                        return reply.status(400).send({
                            error: "Too many parse errors — aborting import",
                            imported: totalImported,
                            parseErrors,
                        });
                    }
                    continue;
                }

                if (batch.length >= IMPORT_BATCH_SIZE) {
                    await flushBatch();
                }
            }
        } catch (err: any) {
            raw.destroy();
            return reply.status(413).send({
                error: err.message,
                imported: totalImported,
            });
        }

        await flushBatch();
        return { status: "imported", count: totalImported, parseErrors };
    }

    // ── Path B: Pre-parsed JSON array (application/json) ────────
    if (Array.isArray(request.body)) {
        const memories = request.body as any[];
        for (let i = 0; i < memories.length; i += IMPORT_BATCH_SIZE) {
            const chunk = memories.slice(i, i + IMPORT_BATCH_SIZE);
            await core.importMemories(chunk, context);
            totalImported += chunk.length;
        }
        return { status: "imported", count: totalImported };
    }

    // ── Unrecognized format ──────────────────────────────────────
    return reply.status(400).send({
        error:
            "Unsupported body format. " +
            "Use Content-Type: application/x-ndjson for large streaming imports, " +
            "or application/json for small payloads.",
    });
});

export const start = async () => {
    try {
        const port = parseInt(process.env.PORT || "8008");
        const host = process.env.HOST || "0.0.0.0";
        await server.listen({ port, host });
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    start();
}
