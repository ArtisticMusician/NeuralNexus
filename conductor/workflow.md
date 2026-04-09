# Workflow: Neural Nexus

## 1.0 DEVELOPMENT STANDARDS
*   **Language:** Strict TypeScript (ESM) for all core and service modules.
*   **Architecture:** Modular, service-oriented structure:
    *   **`src/core/`:** Fundamental domain logic and interfaces (e.g., `IVectorStore`, `MemoryConsolidator`).
    *   **`src/services/`:** Business logic and implementation of core interfaces.
    *   **`src/schemas/`:** Type definitions and AJV-based validation.
*   **Code Style:** Consistent use of `camelCase` for variables/functions and `PascalCase` for classes/interfaces.

## 2.0 TESTING PROTOCOL
*   **Unit Tests:** Every core module must have a corresponding test in `tests/`.
*   **Integration Tests:** Critical flows (e.g., `actual-integration.test.ts`) must be run before merging changes.
*   **Test Runner:** `vitest` (Run with `npm test`).
*   **Mocking:** Prefer using fakes (located in `tests/fakes/`) over mocking libraries for consistency and speed.

## 3.0 CI/CD & VALIDATION
*   **Type Checking:** Run `tsc` frequently to catch type errors.
*   **API Validation:** Ensure all API changes are reflected in the OpenAPI schemas in `openapi/`.
*   **Documentation:** Update relevant markdown files in `docs/` when introducing new features or architectural changes.

## 4.0 CONTRIBUTION PROCESS
1.  **Select Track:** Pick a track from `conductor/tracks.md`.
2.  **Plan:** Create/Follow the track plan in `conductor/tracks/<track_id>/plan.md`.
3.  **Execute:** Implement changes in small, logical commits.
4.  **Validate:** Run tests and type checks.
5.  **Review:** Use `/code-review` for feedback on significant changes.
