# Product Definition: Neural Nexus

## 1.0 MISSION & VISION
Neural Nexus is a professional-grade, framework-agnostic long-term memory protocol for AI agents. Its primary goal is to provide a centralized, high-performance interface for storing, retrieving, and maintaining context (facts, preferences, decisions) across multiple LLMs and platforms (API, CLI, Browser, Mobile).

### Core Principles
*   **Centralized Context:** Decoupling memory from specific AI frameworks or models.
*   **Privacy-First:** Secure, local-first storage with controlled data access.
*   **Intelligent Retrieval:** Hybrid semantic search (RRF) with temporal decay to maintain relevance.
*   **Zero-Bloat:** Semantic deduplication to prevent redundant information storage.

## 2.0 TARGET AUDIENCE
*   **Power Users:** Individuals using multiple LLMs/platforms who want a unified "brain" that remembers their context everywhere.
*   **AI Developers:** Engineers building agents that require persistent memory across different environments or frameworks.

## 3.0 CORE FEATURES
*   **Hybrid RRF Retrieval:** Merging vector similarity with keyword precision.
*   **Temporal Decay Engine:** Automatically managing memory relevance over time.
*   **Semantic Deduplication:** Merging similar facts (>= 0.95 similarity) to optimize storage.
*   **Multi-Platform Support:** CLI, REST API, Browser Extension, Telegram Bot, and OpenAI-compatible proxy.
*   **Vector Store Agnostic:** Abstracted interface for supporting multiple vector databases (Qdrant, and future backends).

## 4.0 PRODUCT ROADMAP
### Phase: Security & Platform (Current)
1.  **Granular Auth:** Implement JWT-based authentication with per-user/per-token permissions.

### Future Phases
*   **Mobile App:** Expanding context to mobile platforms.
*   **Local LLM Integration:** Focusing on privacy-first local embedding and reasoning.
*   **Cross-Agent Synchronization:** Enabling multiple agents to collaborate on a shared memory pool.
