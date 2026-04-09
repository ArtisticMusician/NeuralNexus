import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageFake } from './fakes/InMemoryStorage.js';
import { type IVectorStore } from '../src/core/IVectorStore.js';

describe('Safeguard Suite (Regression Prevention)', () => {
  let storage: IVectorStore;

  beforeEach(async () => {
    storage = new InMemoryStorageFake();
    await storage.initialize(384);
  });

  describe('RRF Score Scale Integrity', () => {
    it('verifies RRF scores fall within a range compatible with RECALL_THRESHOLD (0.01)', async () => {
      // Store 2 memories
      await storage.store('1', new Array(384).fill(1), { text: 'Apple', userid: 'user1' });
      await storage.store('2', new Array(384).fill(1), { text: 'Banana', userid: 'user1' });

      // Search
      const results = await storage.find({ vector: new Array(384).fill(1), limit: 10, userid: 'user1', query: 'Apple' });
      
      const topScore = results[0].score;
      // RRF with rank 1 + rank 1 should be (1/61 + 1/61) = 0.0327...
      // This MUST be greater than our default threshold of 0.01
      expect(topScore).toBeGreaterThan(0.01);
      
      // Sanity check: it should be normalized (max 1.0)
      expect(topScore).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Semantic Confidence Preservation', () => {
    it('preserves original cosine similarity in metadata even after RRF', async () => {
      await storage.store('1', [1, 0], { text: 'Exact Match', userid: 'user1' });

      // Search with exact vector
      const results = await storage.find({ vector: [1, 0], limit: 1, userid: 'user1' });
      
      // The main score is RRF (~0.016), but original must be 1.0
      expect(results[0].payload._original_score).toBeCloseTo(1.0);
    });
  });
});
