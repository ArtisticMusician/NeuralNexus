import fastify from "fastify";
import axios from "axios";
import { NeuralNexusCore } from "./core/NeuralNexusCore.js";
import { AuthContext } from "./core/types.js";
import { fileURLToPath } from "url";
import { core } from "./server.js";
import { Transform } from "stream";
import { LLMConsolidator } from "./services/LLMConsolidator.js";
import "dotenv/config";

export const server = fastify({ logger: true });

const LLM_TARGET_URL = process.env.LLM_TARGET_URL || "https://api.openai.com/v1";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-3.5-turbo";

/**
 * Helper to extract and verify AuthContext from proxy request headers.
 *
 * `userId` is the human owner of the memory space.
 * `agentId` is the AI/client acting for that human.
 */
async function getAuthContext(headers: any): Promise<AuthContext> {
    const authHeader = headers.authorization;
    const authService = core.getAuthService();

    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
            return await authService.verifyToken(token, "openai-proxy");
        } catch (err) {
            // Log warning but allow core to enforce final permission
            console.warn(`[Proxy] Token verification failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // Fallback to anonymous/header-userid if auth is disabled or no token
    const userid = (headers["userid"] || headers["x-userid"] || "anonymous") as string;
    const agentid = (headers["agentid"] || headers["x-agentid"] || headers["x-client-name"] || "openai-proxy-agent") as string;
    return {
        userId: userid,
        agentId: agentid,
        tokenId: "unauthenticated-proxy",
        scopes: ["memory:read", "memory:write", "memory:update"],
        adapterId: "openai-proxy"
    };
}

/**
 * StreamInterceptor: A Transform stream that parses OpenAI SSE chunks
 * to detect and execute 'store_memory' tool calls during a stream.
 */
class StreamInterceptor extends Transform {
    private buffer: string = "";
    private toolBuffers: Map<number, { name: string; fragments: string [] }> = new Map();

    constructor(private context: AuthContext) {
        super();
    }

    _transform(chunk: any, encoding: string, callback: any) {
        this.buffer += chunk.toString();
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";

        let finishReason: string | null = null;

        for (const rawLine of lines) {
            const line = rawLine.startsWith("data:")
                ? rawLine.slice(5).trim()
                : rawLine.trim();

            if (!line || line === "[DONE]") continue;

            let json: any;
            try {
                json = JSON.parse(line);
            } catch {
                continue;
            }

            const choice = json.choices?.[0];
            const delta = choice?.delta;

            if (delta?.tool_calls) {
                for (const call of delta.tool_calls) {
                    const idx = call.index;

                    if (!this.toolBuffers.has(idx)) {
                        this.toolBuffers.set(idx, { name: "", fragments: [] });
                    }

                    const entry = this.toolBuffers.get(idx)!;

                    if (call.function?.name) {
                        entry.name = call.function.name;
                    }

                    if (call.function?.arguments) {
                        entry.fragments.push(call.function.arguments);
                    }
                }
            }

            if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
            }
        }

        if (finishReason === "tool_calls" || finishReason === "stop") {
            this.flushToolCalls();
        }

        callback(null, chunk);
    }

    _flush(callback: any) {
        this.flushToolCalls();
        callback();
    }

    private async flushToolCalls() {
        for (const [idx, { name, fragments }] of this.toolBuffers.entries()) {
            if (name !== "store_memory") continue;
            const full = fragments.join("");

            try {
                const args = JSON.parse(full);
                await core.store(args, this.context);
            } catch (e) {
                console.warn("[StreamInterceptor] Failed to parse/store tool call:", full, e);
            }
        }
        this.toolBuffers.clear();
    }
}

server.post("/v1/chat/completions", async (request, reply) => {
    try {
        const body = request.body as any;
        const messages = body.messages || [];
        const context = await getAuthContext(request.headers);

        const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user")?.content;
        if (lastUserMessage && typeof lastUserMessage === "string") {
            try {
                const recallRes = await core.recall({ query: lastUserMessage, limit: 3 }, context);
                if (recallRes.memories.length > 0) {
                    let systemMsg = messages.find((m: any) => m.role === "system");
                    if (!systemMsg) {
                        systemMsg = { role: "system", content: "You are a helpful assistant with long-term memory." };
                        messages.unshift(systemMsg);
                    }

                    const historyText = messages.map((m: any) => typeof m.content === 'string' ? m.content : '').join(" ").toLowerCase();
                    const newMemories = await core.refineContext(recallRes.memories, historyText);

                    if (newMemories.length > 0) {
                        const contextStr = "\n\nRelevant Memories:\n" + newMemories.map(m => `- ${m.text}`).join("\n");
                        systemMsg.content += contextStr;
                    }
                }
            } catch (err) {
                server.log.error(err, "Nexus Recall Failed");
            }
        }

        const response = await axios.post(`${LLM_TARGET_URL}/chat/completions`, body, {
            headers: {
                "Authorization": `Bearer ${LLM_API_KEY}`,
                "Content-Type": "application/json"
            },
            responseType: body.stream ? 'stream' : 'json'
        });

        if (!body.stream) {
            const choice = response.data.choices?.[0];
            const toolCalls = choice?.message?.tool_calls;

            if (toolCalls) {
                for (const call of toolCalls) {
                    if (call.function?.name === "store_memory") {
                        try {
                            const args = JSON.parse(call.function.arguments);
                            await core.store(args, context);
                        } catch (e) {
                            server.log.error(e, "Failed to execute tool call in non-streaming mode");
                        }
                    }
                }
            }
            return response.data;
        }

        reply.hijack();
        reply.raw.writeHead(response.status, response.headers as any);
        const interceptor = new StreamInterceptor(context);
        response.data.pipe(interceptor).pipe(reply.raw);
        return;
    } catch (err: any) {
        server.log.error(err, "LLM Forwarding Failed");
        return reply.status(err.response?.status || 500).send(err.response?.data || { error: "LLM Proxy Error" });
    }
});

server.all("/v1/*", async (request, reply) => {
    const path = (request.params as any)["*"];
    try {
        const response = await axios({
            method: request.method,
            url: `${LLM_TARGET_URL}/${path}`,
            data: request.body,
            headers: {
                "Authorization": `Bearer ${LLM_API_KEY}`,
                "Content-Type": "application/json"
            }
        });
        return response.data;
    } catch (err: any) {
        return reply.status(err.response?.status || 500).send(err.response?.data);
    }
});

export const start = async () => {
    try {
        const port = parseInt(process.env.OPENAI_PROXY_PORT || "3001");
        await core.initialize();

        const consolidator = new LLMConsolidator(LLM_TARGET_URL, LLM_API_KEY, LLM_MODEL);
        core.setConsolidator(consolidator);

        await server.listen({ port, host: "0.0.0.0" });
        console.log(`OpenAI-Compatible Proxy running on port ${port} -> Targeting ${LLM_TARGET_URL}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    start();
}
