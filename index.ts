// Core Exports
export { NeuralNexusCore } from "./src/core/NeuralNexusCore.js";
export { EmbeddingService } from "./src/core/EmbeddingService.js";
export { QdrantVectorStore, StorageService } from "./src/core/StorageService.js";
export { DecayEngine } from "./src/core/DecayEngine.js";
export { ReplacementAuditService } from "./src/core/ReplacementAuditService.js";
export { normalizeMemoryConfig } from "./src/core/config.js";
export { createVectorStore } from "./src/core/vectorStoreFactory.js";

// Interface & Type Exports
export type { IVectorStore, VectorPoint, FindQuery } from "./src/core/IVectorStore.js";
export type { MemoryConfig, VectorStoreProvider } from "./src/core/config.js";

// Type Exports
export * from "./src/core/types.js";
