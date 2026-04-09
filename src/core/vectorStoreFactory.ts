import { type MemoryConfig } from "./config.js";
import { type IVectorStore } from "./IVectorStore.js";
import { QdrantVectorStore } from "./StorageService.js";

/**
 * Factory function to create a vector store from config.
 * Add new providers by adding cases to the switch.
 */
export function createVectorStore(config: MemoryConfig): IVectorStore {
    switch (config.vectorStore.provider) {
        case "qdrant":
            return new QdrantVectorStore(
                config.vectorStore.url,
                config.vectorStore.collection,
                config.vectorStore.apiKey
            );
        default:
            throw new Error(
                `Unknown vector store provider: "${config.vectorStore.provider}". ` +
                `Supported providers: qdrant`
            );
    }
}
