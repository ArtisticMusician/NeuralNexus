import { type IVectorStore, type VectorPoint, type FindQuery } from "../../src/core/IVectorStore.js";

export class InMemoryStorageFake implements IVectorStore {
  private points: any[] = [];
  private _vectorSize: number | null = null;

  constructor() {
    this.points = [];
  }

  get vectorSize(): number | null {
    return this._vectorSize;
  }

  // --- Helper Methods (Internal) ---

  private cosineSim(v1: number[], v2: number[]) {
    if (!v1 || !v2 || v1.length !== v2.length) return 0;
    let dot = 0, m1 = 0, m2 = 0;
    for(let i=0; i<v1.length; i++) {
      dot += v1[i]*v2[i];
      m1 += v1[i]*v1[i];
      m2 += v2[i]*v2[i];
    }
    if (m1 === 0 || m2 === 0) return 0;
    return dot / (Math.sqrt(m1) * Math.sqrt(m2));
  }

  // --- IVectorStore Implementation ---

  async initialize(dim: number) {
    this._vectorSize = dim;
  }

  async store(id: string, vector: number[], payload: any) {
    this.points = this.points.filter(p => p.id !== id);
    this.points.push({ id, vector, payload });
  }

  async storeBatch(batch: any[]) {
    for (const p of batch) {
      await this.store(p.id, p.vector, p.payload);
    }
  }

  async getPoint(id: string): Promise<VectorPoint | null> {
    return this.points.find(p => p.id === id) || null;
  }

  async delete(id: string): Promise<boolean> {
    const len = this.points.length;
    this.points = this.points.filter(p => p.id !== id);
    return this.points.length < len;
  }

  async find(query: FindQuery): Promise<VectorPoint[]> {
    const { vector, limit, userid = "anonymous", query: textQuery, rrfK = 60 } = query;

    let filtered = this.points.filter(p => p.payload.userid === userid);

    const vectorPass = filtered.map(p => ({
      ...p,
      score: this.cosineSim(vector, p.vector)
    })).sort((a, b) => b.score - a.score);

    let keywordPass: any[] = [];
    if (textQuery) {
      const q = textQuery.toLowerCase();
      keywordPass = filtered.filter(p => 
        (p.payload.text || "").toLowerCase().includes(q)
      ).map(p => ({
        ...p,
        score: 1.0 
      }));
    }

    const scores: Record<string, { score: number; point: any }> = {};
    const applyRRF = (results: any[]) => {
      results.forEach((res, index) => {
        const id = res.id;
        if (!scores[id]) {
          const pointWithOriginal = JSON.parse(JSON.stringify(res));
          if (pointWithOriginal.payload._original_score === undefined) {
            pointWithOriginal.payload._original_score = res.score;
          }
          scores[id] = { score: 0, point: pointWithOriginal };
        }
        scores[id].score += (1 / (rrfK + index + 1));
      });
    };

    applyRRF(vectorPass);
    if (textQuery) applyRRF(keywordPass);

    return Object.values(scores)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({ ...s.point, score: s.score }));
  }

  async scrollAll(userid: string) {
    return this.points.filter(p => p.payload.userid === userid);
  }

  async updatePayload(id: string, partial: any) {
    const p = this.points.find(p => p.id === id);
    if (p) p.payload = { ...p.payload, ...partial };
  }

  async updateAccessTime(id: string) {
      await this.updatePayload(id, { last_accessed: Date.now() });
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
