import { describe, it, expect, beforeAll } from 'vitest';
import { NeuralNexusCore } from '../src/core/NeuralNexusCore.js';
import { normalizeMemoryConfig } from '../src/core/config.js';
import { QdrantClient } from '@qdrant/js-client-rest';

describe('Retrieval Accuracy & Fusion Math', () => {
    let core: NeuralNexusCore;

    beforeAll(async () => {
        const testCollection = 'accuracy_test_collection';
        const config = normalizeMemoryConfig({
            vectorStore: { provider: 'qdrant', url: 'http://127.0.0.1:6333', collection: testCollection },
            thresholds: { recall: 0.001, similarity: 0.8 },
            search: { limit: 10, rrfK: 60, hybridAlpha: 0.5 } // Equal weight for testing
        });

        core = new NeuralNexusCore(config);

        // Clean start
        try {
            const qdrantClient = new QdrantClient({ url: 'http://127.0.0.1:6333', checkCompatibility: false });
            await qdrantClient.deleteCollection(testCollection);
        } catch (e) { }

        await core.initialize();

        // Seed data
        const mockContext: any = { userId: "test", scopes: ["memory:read", "memory:write"] };
        await core.store({ text: "The apple is a red fruit and very sweet.", userid: "test" }, mockContext); // Strong keyword candidate
        await core.store({ text: "Banananas are yellow and curved.", userid: "test" }, mockContext);
        await core.store({ text: "The fruit known as a pomme is technically an apple.", userid: "test" }, mockContext); // Strong semantic candidate for "apple"
    }, 60000);

    it('correctly blends semantic and keyword results in hybrid mode', async () => {
        // Query: "red apple fruit"
        // "The apple is a red fruit..." has many keywords
        // "The fruit known as a pomme..." is semantically close but uses different words except 'fruit'

        const mockContext: any = { userId: "test", scopes: ["memory:read", "memory:write"] };
        const res = await core.recall({ query: "red apple fruit", userid: "test", limit: 3 }, mockContext);

        expect(res.memories.length).toBeGreaterThanOrEqual(2);

        // Check scores exist
        expect(res.metadata?.search_type).toBe("hybrid");
        expect(res.memories[0].metadata.score_type).toBe("rrf");

        // Verify that BOTH items are returned (fusion worked)
        const texts = res.memories.map(m => m.text);
        expect(texts.some(t => t.includes("red fruit"))).toBe(true);
        expect(texts.some(t => t.includes("pomme"))).toBe(true);
    });

    it('mathematical alpha bias works predictably (Vector Focus)', async () => {
        // Bias heavily towards vector
        (core.config.search as any).hybridAlpha = 0.99;

        const mockContext: any = { userId: "test", scopes: ["memory:read", "memory:write"] };
        const res = await core.recall({ query: "crimson orchard yield", userid: "test", limit: 3 }, mockContext);
        // "apple is a red fruit" is semantically closest to crimson orchard yield
        // "Banananas" is far.

        expect(res.memories[0].text).toContain("apple");
        expect(res.metadata?.search_type).toBe("hybrid");
    });

    it('mathematical alpha bias works predictably (Keyword Focus)', async () => {
        // Bias heavily towards keyword
        (core.config.search as any).hybridAlpha = 0.01;

        const mockContext: any = { userId: "test", scopes: ["memory:read", "memory:write"] };
        // Query has exact keywords for the Banana memory
        const res = await core.recall({ query: "Banananas yellow curved", userid: "test", limit: 1 }, mockContext);

        expect(res.memories[0].text).toContain("Banananas");
        expect(res.metadata?.search_type).toBe("hybrid");
    });
});

