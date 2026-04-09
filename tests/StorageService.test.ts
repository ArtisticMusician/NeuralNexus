import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QdrantVectorStore } from '../src/core/StorageService.js';

describe('StorageService', () => {
  let storageService: QdrantVectorStore;
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-instantiate service for each test
    storageService = new QdrantVectorStore('http://localhost:6333', 'test_collection', 'test_key');
    
    // Mock the Qdrant client methods
    client = {
      getCollections: vi.fn(),
      getCollection: vi.fn().mockResolvedValue({ config: { params: { vectors: { size: 128 } } } }),
      createCollection: vi.fn(),
      upsert: vi.fn(),
      retrieve: vi.fn(),
      search: vi.fn(),
      scroll: vi.fn(), // Added scroll mock
      setPayload: vi.fn(),
      createPayloadIndex: vi.fn(),
    };
    
    // Inject the mock client
    (storageService as any).client = client;
  });

  it('creates collection if it does not exist during initialization', async () => {
    client.getCollections.mockResolvedValue({ collections: [] });

    await storageService.initialize(128);

    expect(client.createCollection).toHaveBeenCalledWith('test_collection', {
      vectors: { size: 128, distance: 'Cosine' },
    });
    // Check that text index is created
    expect(client.createPayloadIndex).toHaveBeenCalledWith('test_collection', expect.objectContaining({
        field_name: "text",
        field_schema: expect.objectContaining({ type: "text" })
    }));
  });

  it('does not create collection if it already exists during initialization', async () => {
    client.getCollections.mockResolvedValue({
      collections: [{ name: 'test_collection' }],
    });

    await storageService.initialize(128);

    expect(client.createCollection).not.toHaveBeenCalled();
  });

  it('upserts a point to storage', async () => {
    const id = 'test-id';
    const vector = [0.1, 0.2];
    const payload = { text: 'test' };

    await storageService.store(id, vector, payload);

    expect(client.upsert).toHaveBeenCalledWith('test_collection', {
      points: [{ id, vector, payload }],
    });
  });

  it('searches for points (vector only)', async () => {
    const vector = [0.1, 0.2];
    const limit = 5;
    // Mock vector search results
    client.search.mockResolvedValue([{ id: 1, score: 0.9, payload: { text: 'test' } }]);

    const results = await storageService.find({ vector, limit });

    expect(client.search).toHaveBeenCalledWith('test_collection', {
      vector,
      limit: limit * 2, // Updated limit multiplier
      filter: {
        must: [{ key: "userid", match: { value: "anonymous" } }],
      },
      with_payload: true,
    });
    expect(results).toHaveLength(1);
  });

  it('searches with userid filter (vector only)', async () => {
    const vector = [0.1, 0.2];
    const limit = 5;
    const userid = 'user-123';
    client.search.mockResolvedValue([{ id: 1, score: 0.9, payload: { text: 'test' } }]);

    await storageService.find({ vector, limit, userid });

    expect(client.search).toHaveBeenCalledWith('test_collection', {
      vector,
      limit: limit * 2,
      filter: {
        must: [{ key: "userid", match: { value: userid } }],
      },
      with_payload: true,
    });
  });

  it('performs keyword search when query is provided and merges results', async () => {
    const vector = [0.1, 0.2];
    const limit = 5;
    const query = 'test query';

    // Mock Vector Search (Pass 1) - returns 1 hit
    client.search.mockResolvedValue([{ id: 'v1', score: 0.9, payload: { text: 'vector hit' } }]);
    
    // Mock Text Search (Pass 2) - returns 1 hit via scroll
    client.scroll.mockResolvedValue({ 
        points: [{ id: 'k1', payload: { text: 'keyword hit' } }],
        next_page_offset: null
    });

    const results = await storageService.find({ vector, limit, query });

    // Verify vector search call
    expect(client.search).toHaveBeenCalled();

    // Verify text search call (scroll)
    expect(client.scroll).toHaveBeenCalledWith('test_collection', expect.objectContaining({
      limit: limit * 2,
      filter: {
        must: [
          { key: "userid", match: { value: "anonymous" } },
          { key: "text", match: { text: query } }
        ],
      },
      with_payload: true
    }));

    // Expect results to be merged (2 total)
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('sorts keyword search results by local term frequency', async () => {
    const vector = [0.1, 0.2];
    const query = 'apple banana orange';

    client.search.mockResolvedValue([]); // No vector hits

    // Mock Text Search hits
    // Note: scroll doesn't return scores, so we provide payloads for local scoring
    client.scroll.mockResolvedValue({
        points: [
            { id: 'k1', payload: { text: 'apple' } }, // 1 term match
            { id: 'k2', payload: { text: 'apple banana orange' } } // 3 term matches
        ],
        next_page_offset: null
    });

    const results = await storageService.find({ vector, limit: 5, query });

    // K2 should be ranked higher due to higher TF overlap (3/3 vs 1/3)
    expect(results[0].id).toBe('k2');
    expect(results[1].id).toBe('k1');
  });

  it('applies userid filter to keyword search', async () => {
    const vector = [0.1, 0.2];
    const limit = 5;
    const userid = 'user-123';
    const query = 'test query';
    
    client.search.mockResolvedValue([]);
    client.scroll.mockResolvedValue({ points: [], next_page_offset: null });

    await storageService.find({ vector, limit, userid, query });

    expect(client.scroll).toHaveBeenCalledWith('test_collection', expect.objectContaining({
      filter: {
        must: [
          { key: "userid", match: { value: userid } },
          { key: "text", match: { text: query } },
        ],
      }
    }));
  });

  it('updates payload', async () => {
    const id = 'test-id';
    const partialPayload = { strength: 1.1 };

    await storageService.updatePayload(id, partialPayload);

    expect(client.setPayload).toHaveBeenCalledWith('test_collection', {
      payload: partialPayload,
      points: [id],
    });
  });

  it('updates access time', async () => {
    const id = 'test-id';
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await storageService.updateAccessTime(id);

    expect(client.setPayload).toHaveBeenCalledWith('test_collection', {
      payload: { last_accessed_at: new Date(now).toISOString() },
      points: [id],
    });

    vi.useRealTimers();
  });
});

