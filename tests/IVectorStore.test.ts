import { describe, it, expect } from 'vitest';
import { InMemoryStorageFake } from './fakes/InMemoryStorage.js';
import { type IVectorStore, type FindQuery } from '../src/core/IVectorStore.js';

/**
 * Contract tests for IVectorStore implementations.
 * Run these against any new backend to verify interface conformance.
 */
describe('IVectorStore contract (InMemoryStorageFake)', () => {
  let store: IVectorStore;

  beforeEach(() => {
    store = new InMemoryStorageFake();
  });

  it('initialize sets vectorSize', async () => {
    expect(store.vectorSize).toBeNull();
    await store.initialize(384);
    expect(store.vectorSize).toBe(384);
  });

  it('store and getPoint round-trip', async () => {
    await store.initialize(3);
    await store.store('id1', [1, 0, 0], { text: 'hello', userid: 'u1' });

    const point = await store.getPoint('id1');
    expect(point).not.toBeNull();
    expect(point!.id).toBe('id1');
    expect(point!.payload.text).toBe('hello');
  });

  it('getPoint returns null for missing id', async () => {
    await store.initialize(3);
    expect(await store.getPoint('nonexistent')).toBeNull();
  });

  it('delete removes a point and returns true', async () => {
    await store.initialize(3);
    await store.store('id1', [1, 0, 0], { text: 'hello', userid: 'u1' });

    const deleted = await store.delete('id1');
    expect(deleted).toBe(true);
    expect(await store.getPoint('id1')).toBeNull();
  });

  it('delete returns false for missing id', async () => {
    await store.initialize(3);
    const deleted = await store.delete('nonexistent');
    expect(deleted).toBe(false);
  });

  it('storeBatch inserts multiple points', async () => {
    await store.initialize(3);
    await store.storeBatch([
      { id: 'a', vector: [1, 0, 0], payload: { text: 'a', userid: 'u1' } },
      { id: 'b', vector: [0, 1, 0], payload: { text: 'b', userid: 'u1' } },
    ]);

    expect(await store.getPoint('a')).not.toBeNull();
    expect(await store.getPoint('b')).not.toBeNull();
  });

  it('find returns results sorted by score', async () => {
    await store.initialize(3);
    await store.store('a', [1, 0, 0], { text: 'apple', userid: 'u1' });
    await store.store('b', [0, 1, 0], { text: 'banana', userid: 'u1' });

    const results = await store.find({ vector: [1, 0, 0], limit: 2, userid: 'u1' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    // 'a' should score higher (same vector)
    expect(results[0].id).toBe('a');
  });

  it('scrollAll filters by userid', async () => {
    await store.initialize(3);
    await store.store('a', [1, 0, 0], { text: 'a', userid: 'u1' });
    await store.store('b', [0, 1, 0], { text: 'b', userid: 'u2' });

    const u1 = await store.scrollAll('u1');
    expect(u1).toHaveLength(1);
    expect(u1[0].id).toBe('a');
  });

  it('updatePayload merges partial data', async () => {
    await store.initialize(3);
    await store.store('id1', [1, 0, 0], { text: 'hello', userid: 'u1', strength: 1 });

    await store.updatePayload('id1', { strength: 1.5 });

    const point = await store.getPoint('id1');
    expect(point!.payload.strength).toBe(1.5);
    expect(point!.payload.text).toBe('hello'); // other fields preserved
  });

  it('healthCheck returns true', async () => {
    expect(await store.healthCheck()).toBe(true);
  });
});
