import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService } from '../src/core/EmbeddingService.js';

describe('EmbeddingService', () => {
  let embeddingService: EmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    embeddingService = new EmbeddingService('test-model', 'cpu');
  });

  it('throws error if createVector is called before initialization', async () => {
    await expect(embeddingService.createVector('text')).rejects.toThrow(
      'EmbeddingService: createVector called before initialization.',
    );
  });

  it('prepends "query: " for E5 models during vector creation', async () => {
    const e5 = new EmbeddingService('intfloat/e5-small', 'cpu');
    const mockModel = vi.fn().mockResolvedValue({ data: new Float32Array([0.1, 0.2]) });
    (e5 as any).model = mockModel;

    const vector = await e5.createVector('test text');

    expect(mockModel).toHaveBeenCalledWith('query: test text', {
      pooling: 'mean',
      normalize: true,
    });
    expect(vector[0]).toBeCloseTo(0.1);
    expect(vector[1]).toBeCloseTo(0.2);
  });

  it('does not prepend "query: " for non-E5 models', async () => {
    const mockModel = vi.fn().mockResolvedValue({ data: new Float32Array([0.3]) });
    (embeddingService as any).model = mockModel;

    const vector = await embeddingService.createVector('test text');

    expect(mockModel).toHaveBeenCalledWith('test text', {
      pooling: 'mean',
      normalize: true,
    });
    expect(vector[0]).toBeCloseTo(0.3);
  });

  it('returns current dimension from getDim', () => {
    expect(embeddingService.getDim()).toBeNull();
    (embeddingService as any).dimension = 128;
    expect(embeddingService.getDim()).toBe(128);
  });

  it('counts tokens using the tokenizer', async () => {
    const mockTokenizer = vi.fn().mockResolvedValue({
      input_ids: { size: 5 },
    });
    (embeddingService as any).tokenizer = mockTokenizer;

    const count = await embeddingService.countTokens('test text');

    expect(mockTokenizer).toHaveBeenCalledWith('test text');
    expect(count).toBe(5);
  });

  it('initializes if tokenizer is not present when counting tokens', async () => {
    const mockInitialize = vi.spyOn(embeddingService, 'initialize').mockResolvedValue(undefined);
    const mockTokenizer = vi.fn().mockResolvedValue({
      input_ids: { size: 3 },
    });
    
    mockInitialize.mockImplementation(async () => {
      (embeddingService as any).tokenizer = mockTokenizer;
    });

    const count = await embeddingService.countTokens('another test');

    expect(mockInitialize).toHaveBeenCalled();
    expect(mockTokenizer).toHaveBeenCalledWith('another test');
    expect(count).toBe(3);
  });
});
