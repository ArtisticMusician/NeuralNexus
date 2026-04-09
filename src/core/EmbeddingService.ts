import { pipeline, FeatureExtractionPipeline, AutoTokenizer } from "@xenova/transformers";

export class EmbeddingService {
  private model: FeatureExtractionPipeline | null = null;
  private tokenizer: any = null;
  private dimension: number | null = null;
  public loadTimeMs: number | null = null;

  constructor(
    private modelName: string,
    private device: "cuda" | "cpu"
  ) {}

  async initialize() {
    const startMs = Date.now();
    try {
      this.model = await pipeline("feature-extraction", this.modelName, {
        device: this.device === "cuda" ? "cuda:0" : "cpu",
      } as any);

      this.tokenizer = await AutoTokenizer.from_pretrained(this.modelName);

      // Verification pass to get dimensions
      const testText = this.prepareText("initialization test");
      const dummy = await this.model!(testText, { pooling: "mean", normalize: true });
      this.dimension = dummy.data.length;
      this.loadTimeMs = Date.now() - startMs;
    } catch (err) {
      throw new Error(`EmbeddingService: Initialization failed for ${this.modelName}. ${err}`);
    }
  }

  private prepareText(text: string): string {
    const isE5 = this.modelName.toLowerCase().includes("e5");
    if (isE5 && !text.startsWith("query: ")) {
      return `query: ${text}`;
    }
    return text;
  }

  async createVector(text: string): Promise<number[]> {
    if (!this.model) {
      throw new Error("EmbeddingService: createVector called before initialization.");
    }

    try {
      const formattedText = this.prepareText(text);
      const result = await this.model!(formattedText, { 
        pooling: "mean", 
        normalize: true 
      });
      
      return Array.from(result.data) as number[];
    } catch (err) {
      console.error(`EmbeddingService: Vector generation failed: ${err}`);
      throw err;
    }
  }

  async countTokens(text: string): Promise<number> {
    if (!this.tokenizer) {
      await this.initialize();
    }
    const { input_ids } = await this.tokenizer(text);
    return input_ids.size;
  }

  getDim() {
    return this.dimension;
  }

  cosineSimilarity(v1: number[], v2: number[]): number {
    if (v1.length !== v2.length) return 0;
    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
      dot += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }
    return dot / (Math.sqrt(norm1) * Math.sqrt(norm2) || 1);
  }
}
