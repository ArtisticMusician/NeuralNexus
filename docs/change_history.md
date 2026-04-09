# Neural Nexus: Project Change History

This document tracks the major development milestones and architectural shifts of the Neural Nexus project.

## Milestone 5: Protocol & SDK Finalization (Current)
- **Standardization**: Formalized the Neural Nexus Memory Protocol (NNMP v1.1).
- **Security**: Implemented API Key authentication (`X-API-Key`) across the entire stack.
- **SDKs**: Launched official TypeScript SDK (`@neural-nexus/sdk`) and Python client.
- **Architecture**: Migrated to a shared singleton core to eliminate internal network latency.
- **Search**: Implemented Reciprocal Rank Fusion (RRF) for superior hybrid search results.
- **Streaming**: Added real-time tool-call interception for streaming LLM responses.

## Milestone 4: Reliability & Feature Parity
- **Hybrid Search**: Combined Vector (Cosine) and Keyword (BM25) search.
- **Token Budgeting**: Integrated AutoTokenizer for context window management.
- **Audit Logs**: Implemented SQLite-backed replacement auditing.

## Milestone 3: Adapter & Integration Layer
- **Multi-Platform**: Developed adapters for MCP, Telegram, OpenAI Proxy, and Browser.
- **Dockerization**: Provided container support for easy deployment.

## Milestone 2: API Gateway Construction
- **REST API**: Built the Fastify-based gateway.
- **Multi-Tenancy**: Implemented `userid` partitioning for all operations.

## Milestone 1: Core Decoupling
- **Modularity**: Extracted logic into specialized services (Decay, Embedding, Storage).
- **Framework Agnostic**: Removed all framework-specific dependencies.
