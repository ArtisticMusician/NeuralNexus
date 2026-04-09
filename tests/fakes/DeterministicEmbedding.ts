import { vi } from 'vitest';

export class DeterministicEmbedding {
  async initialize() {}
  getDim() { return 384; }
  async createVector(text: string): Promise<number[]> {
    // Generate a deterministic vector based on text length and first char
    const vec = new Array(384).fill(0).map((_, i) => (text.length + (text.charCodeAt(0) || 0) + i) % 100 / 100);
    return vec;
  }
  async countTokens(text: string): Promise<number> {
    return text.split(/\s+/).length;
  }
  cosineSimilarity(v1: number[], v2: number[]): number {
    return 0.9; // Simplified for tests
  }
}
