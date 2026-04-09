import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeMemoryConfig } from '../src/core/config.js';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('provides default values for empty input', () => {
    const config = normalizeMemoryConfig({});
    expect(config.embedding.model).toBe('Xenova/bge-small-en-v1.5');
    expect(config.embedding.device).toBe('cuda');
    expect(config.vectorStore.url).toBe('http://localhost:6333');
    expect(config.vectorStore.collection).toBe('neural_nexus_memories');
    expect(config.autoCapture).toBe(true);
    expect(config.consolidation).toBe(true);
    expect(config.consolidationThreshold).toBe(4);
    expect(config.replacementLog.enabled).toBe(true);
    expect(config.replacementLog.sqlitePath).toBe('./data/neural_nexus_replacements.sqlite');
  });

  it('respects values from input', () => {
    const input = {
      embedding: {
        model: 'my-custom-model',
        device: 'cpu',
      },
      vectorStore: {
        provider: 'qdrant',
        url: 'https://qdrant.example.com',
        collection: 'custom_memories',
        apiKey: 'secret-api-key',
      },
      autoCapture: false,
      autoRecall: false,
      consolidation: false,
      consolidationThreshold: 10,
      replacementLog: {
        enabled: false,
        sqlitePath: '/tmp/test.db',
      },
    };
    const config = normalizeMemoryConfig(input);
    expect(config.embedding.model).toBe('my-custom-model');
    expect(config.embedding.device).toBe('cpu');
    expect(config.vectorStore.url).toBe('https://qdrant.example.com');
    expect(config.vectorStore.collection).toBe('custom_memories');
    expect(config.vectorStore.apiKey).toBe('secret-api-key');
    expect(config.autoCapture).toBe(false);
    expect(config.autoRecall).toBe(false);
    expect(config.consolidation).toBe(false);
    expect(config.consolidationThreshold).toBe(10);
    expect(config.replacementLog.enabled).toBe(false);
    expect(config.replacementLog.sqlitePath).toBe('/tmp/test.db');
  });

  it('resolves environment variables', () => {
    process.env.TEST_QDRANT_URL = 'http://test-qdrant:6333';
    process.env.TEST_API_KEY = 'env-api-key';
    process.env.TEST_SQLITE_PATH = '/env/data.sqlite';

    const input = {
      vectorStore: {
        provider: 'qdrant',
        url: '${TEST_QDRANT_URL}',
        apiKey: '${TEST_API_KEY}',
        collection: 'test_collection'
      },
      replacementLog: {
        sqlitePath: '${TEST_SQLITE_PATH}',
      },
    };

    const config = normalizeMemoryConfig(input);
    expect(config.vectorStore.url).toBe('http://test-qdrant:6333');
    expect(config.vectorStore.apiKey).toBe('env-api-key');
    expect(config.replacementLog.sqlitePath).toBe('/env/data.sqlite');
  });

  it('uses empty string for missing environment variables', () => {
    const input = {
      vectorStore: {
        provider: 'qdrant',
        url: '${MISSING_VAR}',
        collection: 'neural_nexus_memories'
      },
    };
    const config = normalizeMemoryConfig(input);
    expect(config.vectorStore.url).toBe('http://localhost:6333'); // Reverts to default if after resolving it's empty
  });
});

