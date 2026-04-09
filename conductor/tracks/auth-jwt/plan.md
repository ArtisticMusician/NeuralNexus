# Implementation Plan: Protocol-Level Granular Auth (JWT)

## 1.0 GOAL
Establish a protocol-level identity and permission system for Neural Nexus that ensures secure, isolated, and scoped access across all adapters (REST, MCP, OpenAI Proxy, Telegram, CLI).

## 2.0 SCOPE
*   **Unified Auth Protocol:** A centralized `AuthService` used by all entry points.
*   **Core Enforcement:** Moving permission logic into `NeuralNexusCore`.
*   **Multi-Adapter Support:** Standardizing JWT verification for all runtimes.
*   **Tenant Isolation:** Ensuring users only access their own memories via `user_id` mapping.
*   **Token Governance:** Metadata tracking, auditing, and revocation in SQLite.

## 3.0 TASKS

### Phase 1: Foundations (Protocol Level)
- [ ] **Define Permission Model:** Decide between Scopes, RBAC, or Capabilities.
- [ ] **Schema Design:** Create SQLite migrations for `users` and `tokens` tables (with metadata: `scopes`, `expires_at`, `adapter_restrictions`).
- [ ] **AuthService:** Implement `AuthService.verifyToken()` and `AuthService.generateToken()`.
- [ ] **JWT Implementation:** Configure JWT signing with rotation-ready secrets.

### Phase 2: Adapter Integration - REST API
- [ ] **Endpoints:** Implement `/auth/register`, `/auth/login`, and `/auth/tokens` (CRUD for tokens).
- [ ] **Fastify Hook:** Add a global `preHandler` hook to validate JWTs.
- [ ] **Admin Layer:** Create a "Root Token" generation flow for first-time setup.

### Phase 3: Core Integration (The "Brain")
- [ ] **AuthContext:** Define an `AuthContext` type passed into `NeuralNexusCore` methods.
- [ ] **Enforcement:** Update `NeuralNexusCore` to validate `user_id` and `scopes` before calling `IVectorStore`.
- [ ] **Isolation:** Ensure `userid` is strictly enforced in all retrieval/storage queries.

### Phase 4: Full Adapter Rollout
- [ ] **OpenAI Proxy:** Integrate `AuthService` to validate incoming Bearer tokens.
- [ ] **MCP:** Add token validation to tool call handlers.
- [ ] **Telegram/CLI:** Implement appropriate session or token-based checks.

### Phase 5: Auditing & Lifecycle
- [ ] **Usage Tracking:** Update `last_used_at` and `last_ip` in the tokens table.
- [ ] **Revocation:** Implement a token blacklist or secret versioning.
- [ ] **Compatibility Mode:** Add a "soft-fail" migration path for existing deployments.

## 4.0 VALIDATION
*   **Cross-Adapter Tests:** Verify a single JWT works correctly across REST, MCP, and Proxy.
*   **Scope Isolation:** Prove that a `memory:read` token fails on a `store` operation.
*   **Tenant Check:** Ensure `User A` cannot retrieve memories belonging to `User B`.
*   **Audit Check:** Verify `last_used_at` updates correctly on successful protocol calls.
