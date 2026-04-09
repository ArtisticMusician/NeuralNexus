import { Type, Static } from "@sinclair/typebox";
import { MEMORY_CATEGORIES } from "../../core/config.js";

// --- Enums / Reused Strings ---
const CategoryUnion = Type.Union(
    MEMORY_CATEGORIES.map(c => Type.Literal(c)),
    { description: "Classification category of the memory" }
);

// --- Headers ---
export const BaseHeadersSchema = Type.Object({
    "x-api-key": Type.Optional(Type.String()),
    "userid": Type.Optional(Type.String()),
    "x-userid": Type.Optional(Type.String()), // Legacy alias
    "agentid": Type.Optional(Type.String()),
    "x-agentid": Type.Optional(Type.String()), // Legacy alias
}, { additionalProperties: true, title: "BaseHeaders" }); // Headers strictly require true/strip usually, or just true since browsers send many

export type BaseHeaders = Static<typeof BaseHeadersSchema>;

// --- /recall ---
export const RecallRequestBodySchema = Type.Object({
    query: Type.String({ minLength: 1, description: "Search query for memory retrieval" }),
    userid: Type.Optional(Type.String()),
    agentid: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 5 })),
    maxTokens: Type.Optional(Type.Integer({ minimum: 1 })),
    max_tokens: Type.Optional(Type.Integer({ minimum: 1 })) // Legacy alias
}, { additionalProperties: false, title: "RecallRequestBody" });

export type RecallRequestBody = Static<typeof RecallRequestBodySchema>;

// --- /store ---
export const StoreRequestBodySchema = Type.Object({
    text: Type.String({ minLength: 1, description: "Content to store" }),
    category: Type.Optional(CategoryUnion),
    userid: Type.Optional(Type.String()),
    agentid: Type.Optional(Type.String()),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Any()))
}, { additionalProperties: false, title: "StoreRequestBody" });

export type StoreRequestBody = Static<typeof StoreRequestBodySchema>;

// --- /reinforce ---
export const ReinforceRequestBodySchema = Type.Object({
    memoryId: Type.Optional(Type.String({ format: "uuid" })),
    memory_id: Type.Optional(Type.String({ format: "uuid" })), // Legacy alias
    strengthAdjustment: Type.Optional(Type.Number({ default: 0.05 })),
    strength_adjustment: Type.Optional(Type.Number({ default: 0.05 })) // Legacy alias
}, { additionalProperties: false, title: "ReinforceRequestBody" });

export type ReinforceRequestBody = Static<typeof ReinforceRequestBodySchema>;

// --- /audit ---
export const AuditQueryStringSchema = Type.Object({
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 50 }))
}, { additionalProperties: false, title: "AuditQueryString" });

export type AuditQueryString = Static<typeof AuditQueryStringSchema>;

// --- /admin/export ---
export const ExportQueryStringSchema = Type.Object({
    userid: Type.Optional(Type.String())
}, { additionalProperties: false, title: "ExportQueryString" });

export type ExportQueryString = Static<typeof ExportQueryStringSchema>;
