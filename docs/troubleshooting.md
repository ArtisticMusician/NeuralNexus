# Neural Nexus: Troubleshooting Guide

This document covers common issues and how to resolve them.

## 1. Connection Issues

### "Connection Refused" (Qdrant)
- **Cause**: The Qdrant vector database is not running or the URL is incorrect.
- **Fix**: Run `docker ps` to ensure Qdrant is active. Check `QDRANT_URL` in `.env`.

### Proxy failing to reach target LLM
- **Cause**: `LLM_TARGET_URL` is misconfigured.
- **Fix**: If using Ollama, ensure it is running and the URL is `http://localhost:11434/v1`. For cloud models, verify your internet connection and API key.

---

## 2. Environment & Installation

### SQLite3 / Sharp "Bindings" Error
- **Cause**: Native modules were compiled for a different OS or Node.js version.
- **Fix**: Run the following to rebuild:
  ```bash
  npm install --ignore-scripts=false sqlite3 sharp
  ```

### Memory not saving (OpenAI Proxy)
- **Cause**: The LLM choice does not support tool calling, or the tool definition is missing.
- **Fix**: Ensure your model (e.g. `llama3-8b-instruct`) supports tool-calling. Use the `/v1/chat/completions` endpoint.

---

## 3. Retrieval Quality

### Memories aren't showing up in Recall
- **Cause**: `RECALL_THRESHOLD` is too high or `DECAY_LAMBDA` is too aggressive.
- **Fix**: Lower `RECALL_THRESHOLD` to `0.05` in `.env`. Ensure you are using the correct `userid`.

### Deduplication merging too many things
- **Cause**: `SIMILARITY_THRESHOLD` is too low (e.g. 0.85).
- **Fix**: Increase `SIMILARITY_THRESHOLD` to `0.95` or `0.98` for stricter merging.

---

## 4. Diagnostics

### Check API Health
```bash
curl http://localhost:3000/health
```

### View Audit Logs
Check `data/replacements.sqlite` or call `GET /audit` to see why memories were merged or replaced.

---

## 5. Security & Authentication

### How do I recover my Master Password?
Since Neural Nexus is local-first, your Master Password is stored directly in your environment configuration.
1. Open the \.env\ file in the project root.
2. Look for the line starting with \AUTH_SECRET=\. The value after the equals sign is your password.

### I changed my Master Password and now my tokens don't work.
This is expected behavior. The Master Password is used to sign every JWT token. If you change it, the signature on old tokens becomes invalid. To fix this:
1. Log in again via the Dashboard.
2. If using the CLI, run the \login\ command again to generate a fresh token.
3. Update any agents (like MCP or Telegram) with the new token.
