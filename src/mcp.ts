import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { NeuralNexusCore } from "./core/NeuralNexusCore.js";
import { normalizeMemoryConfig } from "./core/config.js";
import { fileURLToPath } from "url";
import "dotenv/config";

const defaultCore = new NeuralNexusCore(normalizeMemoryConfig({
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
        tokenExpiry: process.env.AUTH_TOKEN_EXPIRY,
    },
    apiKey: process.env.NEXUS_PASSWORD,
}));

export function createMcpServer(core: NeuralNexusCore) {
    const server = new Server(
        {
            name: "neural-nexus",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "recall_memory",
                    description:
                        "Search long-term memory for relevant past information, preferences, or facts.",
                    inputSchema: {
                        type: "object" as const,
                        properties: {
                            query: {
                                type: "string",
                                description: "The search query",
                            },
                            limit: {
                                type: "number",
                                description: "Maximum number of memories to retrieve",
                                default: 5,
                            },
                            // ──────────────────────────────────────────────
                            // NEW — exposes userid so clients actually send it
                            // ──────────────────────────────────────────────
                            userid: {
                                type: "string",
                                description:
                                    "Human owner identifier whose memories should be searched. " +
                                    "Omit only when the caller is unauthenticated.",
                            },
                            agentid: {
                                type: "string",
                                description:
                                    "Agent/client identifier (for provenance only). " +
                                    "Examples: claude-code, gemini-cli, codex.",
                            },
                            token: {
                                type: "string",
                                description: "Optional JWT token for authentication.",
                            },
                            context: {
                                type: "string",
                                description: "Optional conversation history to use for deduplicating results. Helps prevent repeating things the user just said or already knows.",
                            },
                        },
                        required: ["query"],
                    },
                },
                {
                    name: "store_memory",
                    description:
                        "Save important information, facts, or user preferences to long-term memory.",
                    inputSchema: {
                        type: "object" as const,
                        properties: {
                            text: {
                                type: "string",
                                description: "The content of the memory",
                            },
                            category: {
                                type: "string",
                                enum: ["preference", "fact", "entity", "decision", "other"],
                                description: "Memory category",
                                default: "fact",
                            },
                            // ──────────────────────────────────────────────
                            // NEW — same addition for store_memory
                            // ──────────────────────────────────────────────
                            userid: {
                                type: "string",
                                description:
                                    "Human owner identifier for the memory. " +
                                    "Omit only when the caller is unauthenticated.",
                            },
                            agentid: {
                                type: "string",
                                description:
                                    "Agent/client identifier (for provenance only). " +
                                    "Examples: claude-code, gemini-cli, codex.",
                            },
                            token: {
                                type: "string",
                                description: "Optional JWT token for authentication.",
                            },
                        },
                        required: ["text"],
                    },
                },
            ],
        };
    });

    async function getMcpAuthContext(args: any): Promise<any> {
        const token = args.token || process.env.NEXUS_MCP_TOKEN;
        const authService = core.getAuthService();

        if (token) {
            // API key (nn_ prefix)
            if (token.startsWith("nn_")) {
                const apiKey = await authService.verifyApiKey(token);
                if (apiKey) {
                    return {
                        // Human ownership lives on `userId`; the agent/client
                        // that used the key is tracked separately on `agentId`.
                        userId: apiKey.user_id || args.userid || "anonymous",
                        tokenId: apiKey.id,
                        agentId: apiKey.agentid,
                        apiKeyId: apiKey.id,
                        scopes: ["memory:read", "memory:write", "memory:update"],
                        adapterId: "mcp"
                    };
                }
                console.warn("[MCP] API key verification failed.");
            } else {
                // JWT token
                try {
                    return await authService.verifyToken(token, "mcp");
                } catch (err) {
                    console.warn(`[MCP] Token verification failed: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        }

        return {
            userId: args.userid || "anonymous",
            agentId: args.agentid || "mcp-agent",
            tokenId: "mcp-unauthenticated",
            scopes: ["memory:read", "memory:write", "memory:update"],
            adapterId: "mcp"
        };
    }

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const typedArgs = args as any;
        const context = await getMcpAuthContext(typedArgs);

        try {
            if (name === "recall_memory") {
                const response = await core.recall({
                    query: typedArgs.query,
                    limit: typedArgs.limit,
                }, context);

                let memoriesToDisplay = response.memories;

                // centralizing refineContext logic for MCP as well
                if ((args as any).context) {
                    memoriesToDisplay = await core.refineContext(
                        memoriesToDisplay, 
                        (args as any).context
                    );
                }

                const memories = memoriesToDisplay
                    .map((m: any) => `[${m.category}] ${m.text}`)
                    .join("\n");

                return {
                    content: [
                        { type: "text", text: memories || "No relevant memories found." },
                    ],
                };
            }

            if (name === "store_memory") {
                await core.store({
                    text: typedArgs.text,
                    category: typedArgs.category,
                }, context);
                return {
                    content: [{ type: "text", text: "Memory stored successfully." }],
                };
            }

            throw new Error(`Tool not found: ${name}`);
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${error.message}`,
                    },
                ],
                isError: true,
            };
        }
    });

    return server;
}

export async function main() {
    const transport = new StdioServerTransport();
    await defaultCore.initialize();
    const server = createMcpServer(defaultCore);
    await server.connect(transport);
    console.error("Neural Nexus MCP server running on stdio");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}
