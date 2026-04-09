# NNMP: Neural Nexus Memory Protocol (v1.0)

The **Neural Nexus Memory Protocol (NNMP)** is a standardized interface for long-term AI memory. It defines a language-agnostic way for AI agents to store, recall, and manage context across different platforms.

## 1. Core Concepts

### 1.1 Memory Entry
A single unit of knowledge. Every memory MUST follow this structure:
- `id`: Unique UUID (v4).
- `text`: Raw string content.
- `category`: One of `fact`, `preference`, `decision`, `entity`, `other`.
- `vector`: Float array representing the semantic embedding.
- `metadata`: Object containing `created_at`, `last_accessed`, and `strength`.

### 1.2 The Decay Engine
Relevance is not static. NNMP implementations MUST use a decay algorithm to adjust the semantic similarity score based on:
- **Base Similarity**: Cosine distance between query and memory vectors.
- **Time Decay**: Reduced relevance as time passes without access.
- **Strength**: Manual reinforcement multiplier.

## 2. API Interface

### 2.1 Storage (`POST /store`)
Ingests new information.
- **Constraint**: Must perform **Semantic Deduplication** (merge if similarity > 0.95).
- **Constraint**: Must be atomic per user.

### 2.2 Recall (`POST /recall`)
Retrieves context.
- **Constraint**: Must support **Hybrid Search** (Vector + BM25/Keyword).
- **Constraint**: Must support **Token Budgeting** to prevent LLM context overflow.

### 2.3 Reinforcement (`POST /reinforce`)
Adjusts the "importance" of a memory manually.

## 3. Security Model
- All traffic SHOULD be secured via `X-API-Key` headers.
- Multi-tenancy MUST be supported via `userid` partitioning.

## 4. Portability
- All NNMP-compliant servers MUST support export/import in **NDJSON** (Line-delimited JSON) format to prevent user lock-in.
