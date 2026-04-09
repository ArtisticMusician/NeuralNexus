import { Type, Static } from "@sinclair/typebox";
import { MEMORY_CATEGORIES } from "../../core/config.js";

/**
 * TypeBox Schema for a Protocol Memory Entry.
 * Ensures strict typing before writing to DB/Qdrant or on readout.
 */
export const MemoryEntrySchema = Type.Object({
    id: Type.String({ format: "uuid", description: "Unique UUIDv4 identifier for the memory" }),
    text: Type.String({ minLength: 1, description: "The content of the memory" }),
    category: Type.Union(
        MEMORY_CATEGORIES.map(c => Type.Literal(c)),
        { description: "Classification category of the memory" }
    ),
    strength: Type.Number({ minimum: 0, maximum: 1, description: "Importance/strength score [0,1]" }),
    userid: Type.Optional(Type.String({ description: "Human owner / tenant ID for the memory" })),
    agentid: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: "Agent/client that stored the memory. Provenance only; not a tenant boundary." })),
    stored_by_key_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    stored_by_model: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    metadata: Type.Optional(
        Type.Record(Type.String(), Type.Any(), { description: "Flexible metadata payload payload" })
    ),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
    last_accessed_at: Type.String({ format: "date-time" })
}, { additionalProperties: false, title: "MemoryEntry" });

export type MemoryEntry = Static<typeof MemoryEntrySchema>;

/**
 * TypeBox Schema for a Replacement Log Audit Entry.
 */
export const AuditEntrySchema = Type.Object({
    id: Type.Integer({ description: "Sequential auto-incrementing SQLite ID" }),
    old_text: Type.String(),
    new_text: Type.String(),
    similarity_score: Type.Number(),
    timestamp: Type.String({ format: "date-time" }),
    userid: Type.Optional(Type.String())
}, { additionalProperties: false, title: "AuditEntry" });

export type AuditEntry = Static<typeof AuditEntrySchema>;
