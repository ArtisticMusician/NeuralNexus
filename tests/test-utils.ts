import { AuthContext } from "../src/core/types.js";

export function createMockAuthContext(userId: string = "test-user", scopes: any[] = ["memory:read", "memory:write", "memory:update", "memory:delete"]): AuthContext {
    return {
        userId,
        tokenId: "test-token-id",
        scopes,
        adapterId: "test-adapter"
    };
}
