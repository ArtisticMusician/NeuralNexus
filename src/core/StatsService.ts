import { open, type Database } from "sqlite";
import sqlite3 from "sqlite3";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface PersistedStats {
    storesTotal: number;
    recallsTotal: number;
    totalRecallMs: number;
    fastestRecallMs: number;
    slowestRecallMs: number;
}

/**
 * Persists aggregate stats (store/recall counts, latency) to SQLite
 * so they survive server restarts.
 */
export class StatsService {
    private db: Database | null = null;
    private cache: PersistedStats = {
        storesTotal: 0,
        recallsTotal: 0,
        totalRecallMs: 0,
        fastestRecallMs: Infinity,
        slowestRecallMs: 0,
    };

    constructor(private sqlitePath: string) {}

    async initialize() {
        await mkdir(dirname(this.sqlitePath), { recursive: true });
        this.db = await open({ filename: this.sqlitePath, driver: sqlite3.Database });

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS stats (
                key   TEXT PRIMARY KEY,
                value REAL NOT NULL DEFAULT 0
            )
        `);

        // Load persisted values into cache
        const rows = await this.db.all<{ key: string; value: number }[]>('SELECT key, value FROM stats');
        for (const row of rows) {
            (this.cache as any)[row.key] = row.value;
        }

        // Infinity doesn't survive serialization — treat 0 as "no data yet"
        if (this.cache.fastestRecallMs === 0) this.cache.fastestRecallMs = Infinity;
    }

    private async persist(key: keyof PersistedStats) {
        if (!this.db) return;
        const value = this.cache[key] === Infinity ? 0 : this.cache[key];
        await this.db.run(
            'INSERT INTO stats (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            key, value
        );
    }

    async recordStore() {
        this.cache.storesTotal++;
        await this.persist('storesTotal');
    }

    async recordRecall(durationMs: number) {
        this.cache.recallsTotal++;
        this.cache.totalRecallMs += durationMs;
        if (durationMs < this.cache.fastestRecallMs) {
            this.cache.fastestRecallMs = durationMs;
            await this.persist('fastestRecallMs');
        }
        if (durationMs > this.cache.slowestRecallMs) {
            this.cache.slowestRecallMs = durationMs;
            await this.persist('slowestRecallMs');
        }
        await this.persist('recallsTotal');
        await this.persist('totalRecallMs');
    }

    getSnapshot(): PersistedStats {
        return { ...this.cache };
    }
}
