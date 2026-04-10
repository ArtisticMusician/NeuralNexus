import { Database, open } from "sqlite";
import sqlite3 from "sqlite3";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { AuthContext, MemoryPermission } from "./types.js";

export interface UserRecord {
    id: string;
    username: string;
    created_at: string;
}

export interface TokenRecord {
    id: string;
    user_id: string;
    scopes: string; // JSON array string
    description: string;
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
}

export interface ApiKeyRecord {
    id: string;
    user_id: string;
    name: string;
    agentid: string;
    model_name: string;
    key_prefix: string;
    created_at: string;
    last_used_at: string | null;
    recalls_total: number;
    stores_total: number;
    revoked: number;
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

function hashSecret(secret: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const salt = randomBytes(16);
        scryptCb(secret, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            else resolve(`${salt.toString("hex")}:${derivedKey.toString("hex")}`);
        });
    });
}

function verifySecret(secret: string, hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const [saltHex, keyHex] = hash.split(":");
        const salt = Buffer.from(saltHex, "hex");
        const storedKey = Buffer.from(keyHex, "hex");
        scryptCb(secret, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            else {
                try {
                    resolve(timingSafeEqual(derivedKey, storedKey));
                } catch {
                    resolve(false);
                }
            }
        });
    });
}

// ── AuthService ───────────────────────────────────────────────────────────────

export class AuthService {
    private db: Database | null = null;

    constructor(
        private enabled: boolean,
        private secret: string,
        private sqlitePath: string,
        private tokenExpiry: string = "30d",
        private nexusPassword?: string
    ) { }

    async initialize(): Promise<void> {
        await mkdir(dirname(this.sqlitePath), { recursive: true });
        this.db = await open({
            filename: this.sqlitePath,
            driver: sqlite3.Database,
        });

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                scopes TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                expires_at TEXT,
                last_used_at TEXT,
                last_ip TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS api_keys (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                name TEXT NOT NULL,
                agentid TEXT,
                model_name TEXT NOT NULL DEFAULT '',
                key_hash TEXT NOT NULL,
                key_prefix TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_used_at TEXT,
                recalls_total INTEGER NOT NULL DEFAULT 0,
                stores_total INTEGER NOT NULL DEFAULT 0,
                revoked INTEGER NOT NULL DEFAULT 0
            );
        `);

        // Migrations for existing databases
        try { await this.db.run("ALTER TABLE users ADD COLUMN password_hash TEXT"); } catch { /* already exists */ }
        try { await this.db.run("ALTER TABLE api_keys ADD COLUMN agentid TEXT"); } catch { /* already exists */ }
        try { await this.db.run("ALTER TABLE api_keys ADD COLUMN model_name TEXT NOT NULL DEFAULT ''"); } catch { /* already exists */ }
        try { await this.db.run("ALTER TABLE api_keys ADD COLUMN user_id TEXT"); } catch { /* already exists */ }

        // Bootstrap: ensure an admin user exists with the configured NEXUS_PASSWORD
        await this.ensureAdminUser();
        await this.backfillApiKeyOwners();
        await this.normalizeApiKeyAgentIds();
        await this.ensureUniqueApiKeyAgentIds();
    }

    private async ensureAdminUser(): Promise<void> {
        if (!this.db || !this.nexusPassword) return;

        const admin = await this.db.get<{ id: string; password_hash: string | null }>(
            "SELECT id, password_hash FROM users WHERE username = 'admin'"
        );

        if (!admin) {
            // No admin yet — create one
            const adminId = uuidv4();
            const passwordHash = await hashSecret(this.nexusPassword);
            await this.db.run(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
                adminId, "admin", passwordHash, new Date().toISOString()
            );
            console.log("[Auth] Admin user created. Login with: admin / <your NEXUS_PASSWORD>");
        } else if (!admin.password_hash) {
            // Admin exists from before passwords were added — backfill
            const passwordHash = await hashSecret(this.nexusPassword);
            await this.db.run("UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, admin.id);
            console.log("[Auth] Admin password backfilled from NEXUS_PASSWORD.");
        }
    }

    private async backfillApiKeyOwners(): Promise<void> {
        if (!this.db) return;
        const admin = await this.db.get<{ id: string }>(
            "SELECT id FROM users WHERE username = 'admin'"
        );
        if (!admin) return;
        await this.db.run("UPDATE api_keys SET user_id = ? WHERE user_id IS NULL OR user_id = ''", admin.id);
    }

    private async normalizeApiKeyAgentIds(): Promise<void> {
        if (!this.db) return;

        const rows = await this.db.all<Array<{ id: string; name: string; agentid: string | null; model_name: string | null }>>(
            "SELECT id, name, agentid, model_name FROM api_keys ORDER BY created_at ASC, id ASC"
        );

        const used = new Set<string>();
        for (const row of rows) {
            const baseName = row.name.trim() || `api-key-${row.id.slice(0, 8)}`;
            const existingAgentId = row.agentid?.trim() || row.model_name?.trim() || "";
            let nextAgentId = existingAgentId || baseName;
            let suffix = 2;

            while (used.has(nextAgentId.toLowerCase())) {
                nextAgentId = `${existingAgentId || baseName}-${suffix}`;
                suffix += 1;
            }

            used.add(nextAgentId.toLowerCase());

            if (nextAgentId !== (row.agentid?.trim() || "") || nextAgentId !== (row.model_name?.trim() || "")) {
                await this.db.run("UPDATE api_keys SET agentid = ?, model_name = ? WHERE id = ?", nextAgentId, nextAgentId, row.id);
            }
        }
    }

    private async ensureUniqueApiKeyAgentIds(): Promise<void> {
        if (!this.db) return;
        await this.db.run(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_agentid_unique ON api_keys(agentid COLLATE NOCASE)"
        );
    }

    // ── Dashboard login ───────────────────────────────────────────────────────

    async login(username: string, password: string): Promise<string> {
        if (!this.db) throw new Error("AuthService not initialized");

        const user = await this.db.get<{ id: string; password_hash: string | null }>(
            "SELECT id, password_hash FROM users WHERE username = ?", username
        );
        if (!user || !user.password_hash) throw new Error("Invalid username or password");

        const valid = await verifySecret(password, user.password_hash);
        if (!valid) throw new Error("Invalid username or password");

        const tokenId = uuidv4();
        const scopes = ["memory:read", "memory:write", "memory:update", "memory:delete", "admin:tokens", "admin:users", "admin:api-keys"];
        await this.db.run(
            "INSERT INTO tokens (id, user_id, scopes, description, created_at) VALUES (?, ?, ?, ?, ?)",
            tokenId, user.id, JSON.stringify(scopes), "Dashboard Login", new Date().toISOString()
        );
        return this.generateJwt(user.id, tokenId, scopes as MemoryPermission[]);
    }

    // ── JWT token auth (existing) ─────────────────────────────────────────────

    private generateJwt(userId: string, tokenId: string, scopes: MemoryPermission[]): string {
        return jwt.sign(
            { sub: userId, tid: tokenId, scopes },
            this.secret,
            { expiresIn: this.tokenExpiry as any }
        );
    }

    async verifyToken(token: string, adapterId?: string, ip?: string): Promise<AuthContext> {
        // Always verify the JWT signature — even when JWT auth is "disabled",
        // tokens issued via login() should still be honored.
        try {
            const decoded = jwt.verify(token, this.secret) as any;

            if (this.db) {
                const tokenRecord = await this.db.get("SELECT id FROM tokens WHERE id = ?", decoded.tid);
                if (!tokenRecord) throw new Error("Token has been revoked.");

                await this.db.run(
                    "UPDATE tokens SET last_used_at = ?, last_ip = ? WHERE id = ?",
                    new Date().toISOString(), ip || "unknown", decoded.tid
                );
            }

            return {
                userId: decoded.sub,
                tokenId: decoded.tid,
                scopes: decoded.scopes,
                adapterId
            };
        } catch (err) {
            throw new Error(`Authentication failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async createToken(userId: string, scopes: MemoryPermission[], description: string): Promise<string> {
        if (!this.db) throw new Error("AuthService not initialized or disabled.");
        const tokenId = uuidv4();
        await this.db.run(
            "INSERT INTO tokens (id, user_id, scopes, description, created_at) VALUES (?, ?, ?, ?, ?)",
            tokenId, userId, JSON.stringify(scopes), description, new Date().toISOString()
        );
        return this.generateJwt(userId, tokenId, scopes);
    }

    async revokeToken(tokenId: string): Promise<void> {
        if (!this.db) throw new Error("AuthService not initialized or disabled.");
        await this.db.run("DELETE FROM tokens WHERE id = ?", tokenId);
    }

    async listTokens(userId: string): Promise<TokenRecord[]> {
        if (!this.db) return [];
        return await this.db.all("SELECT * FROM tokens WHERE user_id = ?", userId);
    }

    // ── User management ───────────────────────────────────────────────────────

    async createUser(username: string, password?: string): Promise<string> {
        if (!this.db) throw new Error("AuthService not initialized or disabled.");
        const userId = uuidv4();
        const passwordHash = password ? await hashSecret(password) : null;
        await this.db.run(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            userId, username, passwordHash, new Date().toISOString()
        );
        return userId;
    }

    async setPassword(userId: string, password: string): Promise<void> {
        if (!this.db) throw new Error("AuthService not initialized.");
        const passwordHash = await hashSecret(password);
        await this.db.run("UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, userId);
    }

    async listUsers(): Promise<UserRecord[]> {
        if (!this.db) return [];
        return await this.db.all("SELECT id, username, created_at FROM users ORDER BY created_at ASC");
    }

    async deleteUser(userId: string): Promise<void> {
        if (!this.db) throw new Error("AuthService not initialized.");
        await this.db.run("DELETE FROM tokens WHERE user_id = ?", userId);
        await this.db.run("DELETE FROM users WHERE id = ?", userId);
    }

    // ── API key management ────────────────────────────────────────────────────

    async createApiKey(name: string, agentId: string, userId: string): Promise<{ id: string; key: string; prefix: string }> {
        if (!this.db) throw new Error("AuthService not initialized.");

        const normalizedName = name.trim();
        const normalizedAgentId = agentId.trim();
        if (!normalizedName) throw new Error("Name required");
        if (!normalizedAgentId) throw new Error("Agent ID required");

        const existing = await this.db.get<{ id: string }>(
            "SELECT id FROM api_keys WHERE lower(agentid) = lower(?) LIMIT 1",
            normalizedAgentId
        );
        if (existing) throw new Error("Agent ID already exists");

        const rawKey = `nn_${randomBytes(24).toString("base64url")}`;
        const prefix = rawKey.substring(0, 10);
        const keyHash = await hashSecret(rawKey);
        const id = uuidv4();

        await this.db.run(
            "INSERT INTO api_keys (id, user_id, name, agentid, model_name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            id, userId, normalizedName, normalizedAgentId, normalizedAgentId, keyHash, prefix, new Date().toISOString()
        );

        return { id, key: rawKey, prefix };
    }

    async listApiKeys(): Promise<ApiKeyRecord[]> {
        if (!this.db) return [];
        return await this.db.all(
            "SELECT id, user_id, name, agentid, agentid AS model_name, key_prefix, created_at, last_used_at, recalls_total, stores_total, revoked FROM api_keys ORDER BY created_at DESC"
        );
    }

    async revokeApiKey(id: string): Promise<void> {
        if (!this.db) throw new Error("AuthService not initialized.");
        await this.db.run("UPDATE api_keys SET revoked = 1 WHERE id = ?", id);
    }

    async deleteApiKey(id: string): Promise<void> {
        if (!this.db) throw new Error("AuthService not initialized.");
        await this.db.run("DELETE FROM api_keys WHERE id = ?", id);
    }

    async verifyApiKey(key: string): Promise<ApiKeyRecord | null> {
        if (!this.db) return null;

        const prefix = key.substring(0, 10);
        const candidates = await this.db.all<any[]>(
            "SELECT * FROM api_keys WHERE key_prefix = ? AND revoked = 0", prefix
        );

        for (const candidate of candidates) {
            if (await verifySecret(key, candidate.key_hash)) {
                return candidate;
            }
        }
        return null;
    }

    async incrementApiKeyRecall(id: string): Promise<void> {
        if (!this.db) return;
        await this.db.run(
            "UPDATE api_keys SET recalls_total = recalls_total + 1, last_used_at = ? WHERE id = ?",
            new Date().toISOString(), id
        );
    }

    async incrementApiKeyStore(id: string): Promise<void> {
        if (!this.db) return;
        await this.db.run(
            "UPDATE api_keys SET stores_total = stores_total + 1, last_used_at = ? WHERE id = ?",
            new Date().toISOString(), id
        );
    }
}
