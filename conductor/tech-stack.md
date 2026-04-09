# Tech Stack: Neural Nexus

## 1.0 CORE TECHNOLOGY
*   **Language:** [TypeScript](https://www.typescriptlang.org/) (Strict mode enabled)
*   **Runtime:** [Node.js](https://nodejs.org/) (ES Modules)
*   **Framework:** [Fastify](https://www.fastify.io/) (High-performance web framework)

## 2.0 DATA PERSISTENCE
*   **Relational Database:** [SQLite](https://www.sqlite.org/) (Local metadata and configuration)
*   **Vector Database:** Provider-agnostic abstraction (`IVectorStore`)
    *   **Qdrant:** [Qdrant](https://qdrant.tech/) (Primary vector engine, local/Docker)
    *   **Upcoming Support:** ChromaDB, Pinecone, etc.
*   **Caching:** In-memory with `async-lock` for concurrency control.

## 3.0 ARTIFICIAL INTELLIGENCE & ML
*   **Embeddings:** `@xenova/transformers` (Local embeddings using ONNX/WebGPU)
*   **Retrieval:** Hybrid RRF (Reciprocal Rank Fusion) and Temporal Decay logic.

## 4.0 SECURITY & INFRASTRUCTURE
*   **Authentication:** JWT (Planned: Granular per-user/per-token auth)
*   **Containerization:** Docker & Docker Compose (for Qdrant and main app)

## 5.0 DEVELOPMENT & TESTING
*   **Testing:** [Vitest](https://vitest.dev/) (Unit and integration tests)
*   **Tooling:**
    *   `tsc` for type checking.
    *   `commander` for CLI interface.
    *   `telegraf` for Telegram bot integration.
*   **API Documentation:** OpenAPI (Swagger) via Fastify integration.
