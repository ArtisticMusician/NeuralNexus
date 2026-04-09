# Neural Nexus API Reference

## Authentication & Security

Neural Nexus uses a granular, scope-based JWT authentication system. All requests (except `/health` and `/auth/register`) require authentication.

### Headers
*   **Authorization**: `Bearer <token>` (Recommended)
*   **userid**: Legacy header for "anonymous" mode (only works if `AUTH_ENABLED=false` or for unauthenticated proxy requests).

### Scopes
Tokens are issued with specific permissions:
*   `memory:read`: Can recall and export memories.
*   `memory:write`: Can store and import memories.
*   `memory:update`: Can reinforce or modify memories.
*   `memory:delete`: Can delete memories.
*   `admin:users`: Can manage users and audit logs.
*   `admin:tokens`: Can list and revoke tokens.

## Auth Endpoints

### `POST /auth/register`
Initialize the root admin user (only works if no users exist).
- **Body**: `{ username: string }`
- **Response**: `{ userId: string, token: string }` (Root token with all scopes)

### `POST /auth/token`
Generate a new scoped token for an agent or application.
- **Headers**: Requires `admin:tokens` scope or self-issuance.
- **Body**: 
  ```json
  {
    "userId": "uuid",
    "description": "My Agent",
    "scopes": ["memory:read", "memory:write"]
  }
  ```
- **Response**: `{ token: string }`

### `GET /auth/tokens`
List active tokens.
- **Query Param**: `userId` (optional, admin only)
- **Response**: `{ tokens: [ ... ] }`

### `DELETE /auth/tokens/:tokenId`
Revoke a specific token.
- **Headers**: Requires `admin:tokens`.

## Core Endpoints

### `POST /recall`
Search long-term memory.
- **Body**: `{ query: string, limit?: number, userid?: string, maxTokens?: number }`
- **Logic**: Hybrid search (Vector + BM25) merged via RRF.

### `POST /store`
Add or update memory.
- **Body**: `{ text: string, category?: string, userid?: string, metadata?: object }`
- **Deduplication**: Merges if similarity >= 0.95.

### `POST /reinforce`
Strengthen a memory.
- **Body**: `{ memoryId: string, strengthAdjustment?: number }`

### `GET /audit`
Retrieve the replacement audit log (SQLite-backed).

## Admin Endpoints

### `GET /admin/export`
Export memories in NDJSON format.
- **Query Param**: `userid` (optional)

### `POST /admin/import`
Import memories from NDJSON string.

## System

### `GET /health`
Returns system status.
