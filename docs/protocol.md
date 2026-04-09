# NNMP: Neural Nexus Memory Protocol (v1.1)

The **Neural Nexus Memory Protocol (NNMP)** is a standardized interface for long-term AI memory.

## 1. Core Concepts

### 1.1 Memory Entry
Standardized JSON structure:
- `id`: UUID (v4).
- `text`: String content.
- `category`: `fact`, `preference`, `decision`, `entity`, `other`.
- `vector`: Float array.
- `metadata`: `created_at`, `last_accessed`, `strength`, `userid`.

### 1.2 The Decay Engine
Formula: `decayed_score = base_score * (1 / (1 + lambda * (now - last_accessed))) * strength`.
- Default $\lambda = 1e^{-10}$ (stable long-term memory).

## 2. Interface Standards

### 2.1 Hybrid Search & Scoring
Implementations MUST use **Reciprocal Rank Fusion (RRF)** to merge Vector and Keyword results.
- **RRF Formula**: $score = \sum_{rank \in R} \frac{1}{k + rank}$
- Default $k = 60$.

### 2.2 Semantic Deduplication
- Implementations MUST perform semantic deduplication before storage.
- If a new memory has a cosine similarity **>= 0.95** with an existing memory belonging to the same `userid`, the existing memory MUST be updated/merged instead of creating a duplicate.

### 2.3 Strict Multi-Tenancy
- Implementations MUST enforce mandatory `userid` filtering at the storage layer.
- Searching across all users is prohibited to prevent data leaks.

### 2.3 Atomicity
- Implementations MUST use atomic locking (per `userid` and `memoryId`) to prevent race conditions during deduplication.

### 2.4 Context-Aware Refinement
- Implementations SHOULD support deduplication of retrieved results against the current interaction context.
- Method: `Jaccard`, `Cosine`, or `Substring` overlap detection between the memory `text` and the input `context` string.
- Goal: Prevent the system from "recalling" information that the user just provided or that is already active in the immediate chat window.

### 2.5 Streaming Interception
- Compliant Proxies MUST buffer/parse SSE streams to detect and execute memory-storage tool calls in real-time.

## 3. Data Portability
- MUST support Line-delimited JSON (NDJSON) for all user-facing export/import operations.
