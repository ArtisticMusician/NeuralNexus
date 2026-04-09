import { test, expect, vi, beforeEach, describe } from "vitest";
import { server, core } from "../src/server.js";
import { InMemoryStorageFake } from "./fakes/InMemoryStorage.js";
import { EmbeddingFake } from "./fakes/EmbeddingFake.js";
import { createMockAuthContext } from './test-utils.js';

// Mock the Audit service to avoid sqlite3 issues
vi.mock('../src/core/ReplacementAuditService.js', () => ({
  ReplacementAuditService: class {
    async initialize() {}
    async logReplacement() {}
    async getLogs() { return []; }
    async close() {}
  }
}));

describe("API Server (No Mocks Integration)", () => {
  beforeEach(async () => {
    // Inject Fakes into the singleton core
    (core as any).storage = new InMemoryStorageFake();
    (core as any).embedding = new EmbeddingFake();
    // Ensure auth is disabled for simple tests
    (core as any).config.auth.enabled = false;
    (core as any).config.apiKey = undefined;
    
    // Ensure core is "ready" for the server
    await core.initialize();
  });

  test("server health check", async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health'
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  test("POST /store actually persists memory in fake database", async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/store',
      payload: { text: "API stored this", userid: "api-user" }
    });

    expect(response.statusCode).toBe(201);

    // Verify it's actually in our fake storage
    const context = createMockAuthContext("anonymous");
    const recall = await core.recall({ query: "API" }, context);
    expect(recall.memories).toHaveLength(1);
    expect(recall.memories[0].text).toBe("API stored this");
  });

  test("POST /recall retrieves data from fake database", async () => {
    // 1. Seed
    const context = createMockAuthContext("api-user");
    await core.store({ text: "Find me" }, context);

    // 2. Recall via API
    const response = await server.inject({
      method: 'POST',
      url: '/recall',
      headers: { 'userid': 'api-user' }, // Match seeded user
      payload: { query: "Find" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().memories[0].text).toBe("Find me");
  });
});
