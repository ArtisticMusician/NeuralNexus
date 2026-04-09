import { test, expect, vi, beforeEach, describe } from "vitest";
import { createMcpServer } from "../src/mcp.js";
import { NeuralNexusCore } from "../src/core/NeuralNexusCore.js";
import { normalizeMemoryConfig } from "../src/core/config.js";
import { InMemoryStorageFake } from "./fakes/InMemoryStorage.js";
import { EmbeddingFake } from "./fakes/EmbeddingFake.js";
import { createMockAuthContext } from './test-utils.js';

// Mock the Audit service to avoid sqlite3 issues (until it's also a fake)
vi.mock('../src/core/ReplacementAuditService.js', () => ({
  ReplacementAuditService: class {
    async initialize() {}
    async logReplacement() {}
    async getLogs() { return []; }
    async close() {}
  }
}));

describe("MCP Server (No Mocks Integration)", () => {
  let core: NeuralNexusCore;
  let mcpServer: any;

  beforeEach(() => {
    const config = normalizeMemoryConfig({
        auth: { enabled: false }
    });
    core = new NeuralNexusCore(config);
    
    // Inject Fakes
    (core as any).storage = new InMemoryStorageFake();
    (core as any).embedding = new EmbeddingFake();

    mcpServer = createMcpServer(core);
  });

  test("MCP list tools returns tool definitions", async () => {
    // @ts-ignore
    const handler = mcpServer._requestHandlers.get("tools/list");
    const result = await handler({ method: "tools/list" });
    
    expect(result.tools).toHaveLength(2);
    expect(result.tools.find((t: any) => t.name === "recall_memory")).toBeDefined();
  });

  test("MCP call store_memory actually stores in the fake database", async () => {
    // @ts-ignore
    const handler = mcpServer._requestHandlers.get("tools/call");
    
    await handler({
      method: "tools/call",
      params: {
        name: "store_memory",
        arguments: { text: "MCP stored this", category: "fact", userid: "user1" }
      }
    });

    // Verify it actually reached the core logic and storage
    const context = createMockAuthContext("user1");
    const recall = await core.recall({ query: "MCP" }, context);
    expect(recall.memories).toHaveLength(1);
    expect(recall.memories[0].text).toBe("MCP stored this");
  });

  test("MCP call recall_memory actually retrieves from the fake database", async () => {
    // 1. Pre-seed the fake storage
    const context = createMockAuthContext("user1");
    await core.store({ text: "Existing memory" }, context);

    // 2. Call MCP recall
    // @ts-ignore
    const handler = mcpServer._requestHandlers.get("tools/call");
    const result = await handler({
      method: "tools/call",
      params: {
        name: "recall_memory",
        arguments: { query: "Existing", userid: "user1" }
      }
    });

    expect(result.content[0].text).toContain("Existing memory");
  });
});
