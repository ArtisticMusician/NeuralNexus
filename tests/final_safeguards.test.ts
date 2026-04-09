import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockAuthContext } from './test-utils.js';

// Mock Audit Service to avoid sqlite3 issues
vi.mock('../src/core/ReplacementAuditService.js', () => ({
  ReplacementAuditService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    logReplacement: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { NeuralNexusCore } from '../src/core/NeuralNexusCore.js';
import { CategoryService } from '../src/core/CategoryService.js';

describe('Final System Safeguards', () => {
  let core: NeuralNexusCore;
  let mocks: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mocks = {
      embedding: {
        initialize: vi.fn().mockResolvedValue(undefined),
        getDim: vi.fn().mockReturnValue(384),
        createVector: vi.fn().mockResolvedValue(new Array(384).fill(0)),
        countTokens: vi.fn().mockReturnValue(10),
      },
      storage: {
        initialize: vi.fn().mockResolvedValue(undefined),
        find: vi.fn().mockResolvedValue([]),
        store: vi.fn().mockResolvedValue(undefined),
        updatePayload: vi.fn().mockResolvedValue(undefined),
      },
      audit: {
        initialize: vi.fn().mockResolvedValue(undefined),
        logReplacement: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }
    };

    // Instantiate without constructor to avoid side effects/sqlite3
    core = Object.create(NeuralNexusCore.prototype);
    
    // Manually set properties
    (core as any).config = {
        thresholds: { similarity: 0.95, recall: 0.01 },
        decay: { defaultLambda: 1e-10 },
        search: { limit: 10, rrfK: 60 },
        auth: { enabled: false } // Default to disabled for tests
    };
    (core as any).embedding = mocks.embedding;
    (core as any).storage = mocks.storage;
    (core as any).audit = mocks.audit;
    (core as any).categoryService = new CategoryService();
    (core as any).decay = {
        calculateScore: vi.fn().mockImplementation((score) => score)
    };
  });

  describe('Core Logic (Issue Log 02 Fixes)', () => {
    it('verifies RRF score scale compatibility (Issue 1.1)', async () => {
      mocks.storage.find.mockResolvedValue([
        { id: '1', score: 0.016, payload: { text: 'RRF Match' } }
      ]);
      const context = createMockAuthContext("test-user");
      const result = await core.recall({ query: 'test' }, context);
      expect(result.memories).toHaveLength(1); // Threshold 0.01 < 0.016
    });

    it('preserves original semantic score (Issue 2.1)', async () => {
        mocks.storage.find.mockResolvedValue([
          { id: '1', score: 0.016, payload: { text: 'Match', _original_score: 0.987 } }
        ]);
        const context = createMockAuthContext("test-user");
        const result = await core.recall({ query: 'test' }, context);
        expect(result.memories[0].metadata._original_score).toBe(0.987);
    });
  });

  describe('Categorization & Extraction', () => {
    it('detects categories correctly', () => {
      expect(core.detectCategory('I like coding')).toBe('preference');
      expect(core.detectCategory('We decided on React')).toBe('decision');
      expect(core.detectCategory('The capital is Paris')).toBe('fact');
    });

    it('extracts candidate from messages', () => {
      const messages = [{ role: 'user', content: 'This is a long enough message to be captured as a memory candidate.' }];
      expect(core.extractCandidate(messages)).toBe('This is a long enough message to be captured as a memory candidate.');
    });
  });

  describe('Multi-tenancy Safeguards', () => {
    it('enforces userid in search', async () => {
      const context = createMockAuthContext("user-123");
      await core.recall({ query: 'test' }, context);
      expect(mocks.storage.find).toHaveBeenCalledWith({
        vector: new Array(384).fill(0),
        limit: 10,
        userid: 'user-123',
        query: 'test',
        rrfK: 60,
        alpha: 0.7
      });
    });
  });
});
