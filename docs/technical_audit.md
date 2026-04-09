# Neural Nexus: High-Density Technical Audit

## 1. Unified Architecture
The system follows a **Singleton Orchestration** pattern.
- **`src/server.ts`**: The source of truth for the `core` instance.
- **Adapters**: `mcp.ts`, `openai-proxy.ts`, and `telegram-bot.ts` import the shared `core` instance directly to eliminate network hops and minimize latency.

## 2. Core Logic & Algorithms
- **Hybrid Search**: Implements **Reciprocal Rank Fusion (RRF)** with $k=60$. It merges Vector results (top-N) and Keyword results (top-N) into a single statistically sound ranking.
- **Temporal Decay**: Default $\lambda = 1e^{-10}$. Memories retain $>90\%$ relevance for weeks, decaying only after significant idle time.
- **Semantic Deduplication**: Threshold set at **0.95**. Merges occur atomically within the user's partition.
- **Token Budgeting**: Uses `transformers` tokenizer to count tokens during recall, ensuring LLM window compliance.

## 3. Streaming Interception
The OpenAI Proxy (`openai-proxy.ts`) implements a **Transform Stream** (`StreamInterceptor`) that parses SSE chunks. It detects `delta` tool calls for `store_memory` and executes them without interrupting the user's real-time stream.

## 4. Multi-Tenancy & Security
- **Mandatory Filter**: `userid` is a required parameter for `find` and `scroll` operations in `StorageService`.
- **Auth**: Protected by `X-API-Key` global hook in Fastify.

## 5. Configuration (New Overrides)
- `SIMILARITY_THRESHOLD`: Merge sensitivity.
- `RECALL_THRESHOLD`: Minimum relevance floor.
- `DECAY_LAMBDA`: Temporal stability.
- `RRF_K`: Fusion constant.
