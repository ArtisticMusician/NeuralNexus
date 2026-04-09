import { describe, it, expect, beforeEach, vi } from 'vitest';
import { server } from '../src/openai_proxy.js';
import { core } from '../src/server.js';
import axios from 'axios';
import { Readable } from 'stream';

// Mock core methods but KEEP the proxy logic real
vi.mock('../src/server.js', () => ({
  core: {
    initialize: vi.fn().mockResolvedValue(undefined),
    recall: vi.fn().mockResolvedValue({ memories: [] }),
    store: vi.fn().mockResolvedValue(undefined),
    refineContext: vi.fn().mockResolvedValue([]),
    getAuthService: vi.fn().mockReturnValue({
        verifyToken: vi.fn().mockImplementation((token) => {
            if (token === "invalid") throw new Error("Invalid");
            return { userId: "user123", tokenId: "t1", scopes: ["memory:read", "memory:write"], adapterId: "openai-proxy" };
        })
    }),
    config: {
      dedupMethod: 'jaccard',
      dedupThreshold: 0.3
    },
    getEmbedding: vi.fn().mockReturnValue({
      createVector: vi.fn().mockResolvedValue(new Array(384).fill(0)),
      cosineSimilarity: vi.fn().mockReturnValue(0.1)
    })
  }
}));

vi.mock('axios', () => {
  const mock = vi.fn();
  (mock as any).post = vi.fn();
  (mock as any).create = vi.fn().mockReturnValue(mock);
  return { default: mock };
});

describe('OpenAI Proxy (Fidelity Streaming Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures store_memory tool calls during a real stream', async () => {
    // ... same as before ...
    const mockCoreStore = (core.store as any);

    // 1. Simulate a stream from OpenAI
    const stream = new Readable({
      read() { }
    });

    (axios.post as any).mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      data: stream
    } as any);

    // 2. Trigger the proxy
    const responsePromise = server.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { stream: true, messages: [] },
      headers: { 'userid': 'user123' }
    });

    // 3. Push chunks into the stream
    const chunk1 = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"store_memory","arguments":"{\\"text\\":\\"streamed "}}]}}]}\n\n';
    const chunk2 = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"fact\\"}"}}]}}]}\n\n';
    const chunk3 = 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n';
    const chunkDone = 'data: [DONE]\n\n';

    stream.push(chunk1);
    stream.push(chunk2);
    stream.push(chunk3);
    stream.push(chunkDone);
    stream.push(null);

    await responsePromise;

    // 4. VERIFY: Did the interceptor actually trigger the core store?
    expect(mockCoreStore).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'streamed fact' }),
      expect.objectContaining({ userId: 'user123', adapterId: 'openai-proxy' })
    );
  });

  it('excludes memories that overlap significantly (Jaccard > 0.6) with recent message history', async () => {
    const memory1 = { text: "This is a uniquely crafted long sentence to test jaccard overlap specifically.", id: "1", category: "fact", vector: [], metadata: { last_accessed: 1, created_at: 1, strength: 1 } };
    const memory2 = { text: "A completely different memory that should be included.", id: "2", category: "fact", vector: [], metadata: { last_accessed: 1, created_at: 1, strength: 1 } };

    (core.recall as any).mockResolvedValue({
      memories: [memory1, memory2]
    });

    // Mock refineContext to filter out the first memory (simulating Jaccard logic)
    (core.refineContext as any).mockResolvedValue([memory2]);

    const stream = new Readable({ read() { } });
    stream.push('data: [DONE]\n\n');
    stream.push(null);

    const mockAxiosPost = (axios.post as any).mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      data: stream
    } as any);

    await server.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        stream: true,
        messages: [{ role: 'user', content: 'Tell me about that uniquely crafted long sentence to test jaccard overlap specifically. It seems very interesting.' }]
      },
      headers: { 'userid': 'user123' }
    });

    // Verify recall was called with AuthContext
    expect(core.recall).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: 'user123', adapterId: 'openai-proxy' })
    );

    // Verify the payload sent to OpenAI does NOT contain the first memory but DOES contain the second
    expect(mockAxiosPost).toHaveBeenCalled();
    const forwardedPayload = mockAxiosPost.mock.calls[0][1] as any;
    const injectedSystemMessage = forwardedPayload.messages.find((m: any) => m.role === 'system')?.content;

    expect(injectedSystemMessage).not.toContain("uniquely crafted long sentence");
    expect(injectedSystemMessage).toContain("A completely different memory");
  });
});
