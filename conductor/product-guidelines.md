# Product Guidelines: Neural Nexus

## 1.0 USER EXPERIENCE (UX)
*   **Invisible Infrastructure:** Neural Nexus should feel like a background utility, providing intelligence without being intrusive.
*   **Speed is Priority:** Retrieval and storage operations must be low-latency to avoid slowing down the agent's response time.
*   **Contextual Relevance:** The RRF and decay engine must be tuned to provide the most relevant information for the current task.

## 2.0 INTERFACE DESIGN (UI)
*   **Aesthetics:** Modern, premium feel (Material 3 for dashboard, subtle shadows, consistent typography).
*   **Dashboard:** Clean, data-driven interface for managing memories, viewing statistics, and configuring connections.
*   **Browser Extension:** Minimalistic popup with quick-access to memory search and status.
*   **API Design:** Strictly follow REST principles; use JSON for all requests/responses; clear error messaging with AJV validation.

## 3.0 DATA HANDLING & PRIVACY
*   **Local-First:** Prioritize local embedding and storage whenever possible to reduce external dependencies.
*   **Encryption:** All sensitive data (API keys, PII) should be handled securely and masked in logs.
*   **Semantic Deduplication:** Reinforce existing memories rather than creating duplicates to keep the context window focused.

## 4.0 NAMING CONVENTIONS
*   **Code:** `IVectorStore` (Interface), `QdrantStore` (Implementation), `MemoryConsolidator` (Service).
*   **API Endpoints:** `/v1/memory/find`, `/v1/memory/store`, `/v1/auth/token`.
*   **Documentation:** Clear, concise headers; consistent terminology (e.g., "Reinforcement" vs "Update").
