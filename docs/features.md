# Neural Nexus: Feature Specifications & Protocol Rules

Neural Nexus has evolved from a plugin into a **Neural Nexus Memory Protocol (NNMP)**. It provides a standardized, framework-agnostic "Second Brain" for AI agents.

---

## 🏗️ Architectural Features

### 1) Singleton Orchestration (Unified Core)
All adapters (OpenAI Proxy, MCP Server, Telegram Bot) share a direct, initialized instance of the `NeuralNexusCore`.
- **Benefit**: Zero-latency internal communication.
- **Benefit**: Consistent state across all platforms.

### 2) API Gateway
Exposes a standardized REST API for interaction with any external system.
- **Endpoints**: `/recall`, `/store`, `/reinforce`, `/audit`, `/admin/export`, `/admin/import`.
- **Security**: Global `X-API-Key` protection.

---

## 🧠 Memory Logic & Intelligence

### 3) Hybrid Search with RRF
Nexus combines semantic understanding with keyword precision using **Reciprocal Rank Fusion (RRF)**.
- **Vector Search**: Cosine similarity via `BGE-Small`.
- **Keyword Search**: Full-text BM25 indexing via Qdrant.
- **RRF Merging**: Statistically sound result merging ($k=60$) that eliminates arbitrary weight constants.

### 4) Semantic Deduplication (The 0.95 Rule)
Prevents "fact bloat" by enforcing semantic integrity.
- If new information is **>= 0.95 similar** to an existing memory in the user's partition, the existing memory is **merged/updated** instead of duplicated.

### 5) Temporal Decay Engine (v1.1)
Adjusts relevance based on time and importance.
- **Formula**: `decayed_score = base_score * (1 / (1 + lambda * deltaT)) * strength`.
- **Stable Defaults**: $\lambda = 1e^{-10}$ ensures memories remain relevant for weeks/months unless manually reinforced or forgotten.

### 6) Atomic Locking
Uses `async-lock` to prevent race conditions.
- Locks are applied per `userid` during storage and per `memoryId` during reinforcement.

---

## 🔒 Privacy & Compliance

### 7) Strict Multi-Tenancy
Mandatory isolation of user data.
- All storage and retrieval operations are hard-filtered by `userid`.
- Data leakage between users is mathematically and architecturally prevented.

### 8) Replacement Audit Trail
A transparent, SQLite-backed log of all memory merges.
- Tracks: `oldText`, `newText`, `similarityScore`, and `timestamp`.

---

## 🔌 Ecosystem Features (Adapters)

### 9) OpenAI Streaming Proxy
A high-performance bridge for OpenAI-compatible applications.
- **Streaming Interceptor**: Uses a custom Transform Stream to detect and execute memory tool calls *during* active SSE streams.
- **Context Injection**: Automatically enriches system prompts with relevant memories.

### 10) MCP Server (Model Context Protocol)
Native tool support for Claude Desktop and AI-powered IDEs.
- Exposes `recall_memory` and `store_memory` as standard MCP tools.

### 11) Mobile Agent (Telegram Bot)
A Telegraf-powered mobile interface for capture and recall on the go.

### 12) Official TypeScript SDK
A fully typed client library (`@neural-nexus/sdk`) for rapid integration into Node.js or Browser apps.

---

## 💾 Data Sovereignty

### 13) NDJSON Portability
Neural Nexus enforces a "No Lock-in" policy.
- **Bulk Export/Import**: Full support for Line-delimited JSON (NDJSON) for backup, migration, or sharing.

---

## ⚙️ Configuration & Tunability

### 14) Dynamic Overrides
All core thresholds are tunable via environment variables:
- `SIMILARITY_THRESHOLD`: Merge sensitivity.
- `RECALL_THRESHOLD`: Retrieval floor.
- `DECAY_LAMBDA`: Forgetting speed.
- `RRF_K`: Fusion constant.
