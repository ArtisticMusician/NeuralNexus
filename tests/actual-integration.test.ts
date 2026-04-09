import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NeuralNexusCore } from '../src/core/NeuralNexusCore.js';
import { normalizeMemoryConfig } from '../src/core/config.js';
import { QdrantClient } from '@qdrant/js-client-rest';

describe('Actual Multi-Container Integration Test', () => {
    let core: NeuralNexusCore;

    beforeAll(async () => {
        // Spin up actual qdrant container
        console.log("Cleaning up and connecting to local Qdrant instance...");

        const testCollection = 'actual_integration_test_collection';

        const config = normalizeMemoryConfig({
            vectorStore: { provider: 'qdrant', url: 'http://127.0.0.1:6333', collection: testCollection },
            thresholds: { recall: 0.01, similarity: 0.92 },
            search: { limit: 5, rrfK: 60 }
        });

        core = new NeuralNexusCore(config);
        // Force cleanup of potential stale data from previous failed runs
        try {
            const qdrantClient = new QdrantClient({ url: 'http://127.0.0.1:6333', checkCompatibility: false });
            await qdrantClient.deleteCollection(testCollection);
        } catch (e) {
            // Ignore if collection doesn't exist
        }
        await core.initialize();
    }, 120000); // Higher timeout for image pulls if needed

    afterAll(() => {
        console.log("Integration test complete.");
    });

    it('performs end-to-end store and hybrid recall using actual vector embeddings and Qdrant DB', async () => {
        const mockContext: any = { userId: "test_user_1", scopes: ["memory:read", "memory:write"] };
        await core.store({ text: "The capital of actual France is indeed Paris.", category: "fact", userid: "test_user_1" }, mockContext);
        await core.store({ text: "My favorite color is a deep actual blue.", category: "preference", userid: "test_user_1" }, mockContext);

        // Let index settle briefly (Qdrant async indexing)
        await new Promise(res => setTimeout(res, 500));

        const res1 = await core.recall({ query: "What is the capital of actual France?", userid: "test_user_1" }, mockContext);
        expect(res1.memories.length).toBeGreaterThan(0);
        expect(res1.memories[0].text).toContain("Paris");

        const res2 = await core.recall({ query: "blue color", userid: "test_user_1" }, mockContext);
        expect(res2.memories.length).toBeGreaterThan(0);
        expect(res2.memories[0].text).toContain("deep actual blue");
    });

    it('performs semantic deduplication against actual database', async () => {
        const mockContext: any = { userId: "test_user_2", scopes: ["memory:read", "memory:write"] };
        await core.store({ text: "I actually love eating organic red apples.", category: "preference", userid: "test_user_2" }, mockContext);
        // Very similar text causing a merge
        await core.store({ text: "I actually love eating organic red apples.", category: "preference", userid: "test_user_2" }, mockContext);

        await new Promise(res => setTimeout(res, 500));

        // verify only 1 exists for user
        const res = await core.recall({ query: "organic red apples", limit: 10, userid: "test_user_2" }, mockContext);
        expect(res.memories.length).toBe(1);
        expect(res.memories[0].metadata.strength).toBe(1); // Has merged and capped at 1.0
    });
});

