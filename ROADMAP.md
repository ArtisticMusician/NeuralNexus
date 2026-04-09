# Roadmap to Enterprise-Grade Production

## Phase 1: Hardening (Immediate)
- [X] **Multi-Database Support:** Introduce a `VectorStore` interface to support Pinecone, Weaviate, or Chroma.
- [X] **Granular Auth:** Move to JWT-based auth with per-user/per-token permissions.
- [X] **Schema Validation:** Implement `Zod` or similar for strict runtime type checking on all API inputs.

## Phase 2: Intelligence & Optimization (Short-term)
- [ ] **LLM-Based Categorization:** Move beyond regex-based categorization for complex memories.
- [ ] **Knowledge Graphs:** Augment vector search with a Knowledge Graph to identify relationships between memories.
- [ ] **Batch Embedding:** Optimize the `EmbeddingService` to handle batch requests efficiently.
- [ ] **Native BM25:** Configure Qdrant's native full-text search capabilities more deeply to replace the synthetic scoring.

## Phase 3: Scaling & UX (Medium-term)
- [ ] **Distributed Locking:** Replace `async-lock` with a Redis-backed lock for multi-instance deployments.
- [ ] **Dashboard Pro:** Add visualization of "Memory Clusters" and tools for manual memory pruning/editing.
- [ ] **Mobile SDKs:** Native iOS/Android libraries for easier integration into mobile apps.
- [ ] **Sync Protocol:** Standardized way to sync memory across multiple Neural Nexus instances.
