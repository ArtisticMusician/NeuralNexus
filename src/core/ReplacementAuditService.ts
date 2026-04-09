import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Database, open } from "sqlite";
import sqlite3 from "sqlite3";

type ReplacementAuditRecord = {
    memoryId: string;
    category: string;
    oldText: string;
    newText: string;
    similarityScore: number | null;
    replacedAt: number;
};

export class ReplacementAuditService {
    private db: Database | null = null;
    private initializationFailed = false;

    constructor(
        private enabled: boolean,
        private sqlitePath: string,
    ) { }

    async initialize(): Promise<void> {
        if (!this.enabled || this.db) {
            return;
        }

        if (!this.sqlitePath || this.sqlitePath.trim() === "") {
            console.warn(
                "ReplacementAuditService: No valid sqlitePath provided. Audit logging will be disabled.",
            );
            this.initializationFailed = true;
            return;
        }

        try {
            await mkdir(dirname(this.sqlitePath), { recursive: true });
            this.db = await open({
                filename: this.sqlitePath,
                driver: sqlite3.Database,
            });

            await this.db.exec(`
        CREATE TABLE IF NOT EXISTS memory_replacements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          memory_id TEXT NOT NULL,
          category TEXT NOT NULL,
          old_text TEXT NOT NULL,
          new_text TEXT NOT NULL,
          similarity_score REAL,
          replaced_at INTEGER NOT NULL
        );
      `);
        } catch (error) {
            console.error(
                "ReplacementAuditService: Failed to initialize audit database. Audit logging will be disabled.",
                error,
            );
            this.initializationFailed = true;
            this.db = null;
        }
    }

    async logReplacement(record: ReplacementAuditRecord): Promise<void> {
        if (!this.enabled || !this.db) {
            return;
        }

        try {
            await this.db.run(
                `
          INSERT INTO memory_replacements (
            memory_id,
            category,
            old_text,
            new_text,
            similarity_score,
            replaced_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
                record.memoryId,
                record.category,
                record.oldText,
                record.newText,
                record.similarityScore,
                record.replacedAt,
            );
        } catch (error) {
            console.error(
                "ReplacementAuditService: Failed to log replacement record.",
                error,
            );
        }
    }

    async getLogs(limit: number = 50): Promise<any[]> {
        if (!this.db) {
            return [];
        }
        return await this.db.all(
            `SELECT * FROM memory_replacements ORDER BY replaced_at DESC LIMIT ?`,
            limit,
        );
    }

    async close(): Promise<void> {
        if (!this.db) {
            return;
        }
        await this.db.close();
        this.db = null;
    }

    isOperational(): boolean {
        return this.enabled && this.db !== null && !this.initializationFailed;
    }
}