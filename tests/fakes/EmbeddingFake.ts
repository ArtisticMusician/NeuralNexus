export class EmbeddingFake {
  async initialize() {}
  async createVector(text: string): Promise<number[]> {
    // Simple deterministic vector based on text content
    const vec = new Array(384).fill(0);
    for (let i = 0; i < text.length && i < 384; i++) {
      vec[i] = text.charCodeAt(i) / 255;
    }
    return vec;
  }
  async countTokens(text: string): Promise<number> {
    return text.split(/\s+/).length;
  }
  getDim() { return 384; }
}
