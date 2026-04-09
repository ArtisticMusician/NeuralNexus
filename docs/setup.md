# Neural Nexus: Exhaustive Setup Guide

This guide covers everything required to get Neural Nexus running from scratch.

## 1. Prerequisites

### Hardware Requirements
- **RAM**: Minimum 4GB (8GB+ recommended for local embeddings).
- **Storage**: Qdrant storage usage depends on memory volume; 1GB is plenty for personal use.

### Software Dependencies
- **Node.js**: v20 or higher.
- **Docker**: For running Qdrant (highly recommended).
- **Git**: For cloning the repository.

---

## 2. Installation

1.  **Clone the Repository**:
    ```bash
    git clone <your-repo-url>
    cd neural-nexus
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Build the Project**:
    ```bash
    npm run build
    ```

---

## 3. Core Database (Qdrant)

Neural Nexus needs a vector database to store and retrieve memories.
```bash
docker run -p 6333:6333 qdrant/qdrant
```
Neural Nexus will automatically create the required collections and indices on its first run.

---

## 4. Configuration (`.env`)

Copy `.env.example` to `.env` and configure the following sections:

### API Server
- `PORT`: Default 3000.
- `HOST`: Default 0.0.0.0.
- `NEXUS_PASSWORD`: Sets the initial `admin` user's dashboard password on first run.

### Qdrant
- `QDRANT_URL`: `http://localhost:6333`.
- `QDRANT_COLLECTION`: `neural_nexus_universal`.

### AI Models (Embeddings)
- `EMBEDDING_MODEL`: Default `Xenova/bge-small-en-v1.5`.
- `EMBEDDING_DEVICE`: `cpu` or `cuda`.

### 🔐 Authentication (JWT)
- `AUTH_ENABLED`: Set to `true` to enable granular token auth.
- `AUTH_SECRET`: A strong secret key for signing JWTs.
- `AUTH_SQLITE_PATH`: Path to the SQLite DB for user/token storage (default: `./data/auth.sqlite`).
- `AUTH_TOKEN_EXPIRY`: Token lifetime (e.g., `24h`).

### Logic Thresholds (The "Brain" Tuning)
- `SIMILARITY_THRESHOLD`: (Default 0.95) How close two facts must be to merge.
- `RECALL_THRESHOLD`: (Default 0.1) Minimum relevance for a memory to be returned.
- `DECAY_LAMBDA`: (Default 1e-10) Lower values keep memories longer.
- `RRF_K`: (Default 60) Constant for hybrid search merging.

---

## 5. Running the Services

- **Main API Server**: `npm run server:dev`
- **OpenAI Proxy**: `npm run proxy:start`
- **MCP Server**: `npm run mcp:start`
- **Telegram Bot**: `npm run telegram:start`

