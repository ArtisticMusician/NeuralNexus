import { QdrantClient } from "@qdrant/js-client-rest";
import { type IVectorStore, type VectorPoint, type FindQuery } from "./IVectorStore.js";

export class QdrantVectorStore implements IVectorStore {
    private client: QdrantClient;
    private _vectorSize: number | null = null;

    constructor(private url: string, private collection: string, apiKey?: string) {
        this.client = new QdrantClient({ url, apiKey, checkCompatibility: false });
    }

    get vectorSize(): number | null {
        return this._vectorSize;
    }

    async initialize(vectorSize: number) {
        this._vectorSize = vectorSize;

        const collections = await this.client.getCollections();
        if (!collections.collections.some(c => c.name === this.collection)) {
            await this.client.createCollection(this.collection, {
                vectors: { size: vectorSize, distance: "Cosine" },
            });

            await this.client.createPayloadIndex(this.collection, {
                field_name: "userid",
                field_schema: "keyword",
            });

            // Full-text index for the "text" field
            await this.client.createPayloadIndex(this.collection, {
                field_name: "text",
                field_schema: {
                    type: "text",
                    tokenizer: "word",
                    min_token_len: 2,
                    max_token_len: 20,
                    lowercase: true
                },
            });
        } else {
            // Verify dimensions
            const info = await this.client.getCollection(this.collection);
            const existingSize = (info.config.params.vectors as any).size;
            if (existingSize !== vectorSize) {
                throw new Error(`[QdrantVectorStore] Dimension mismatch: Collection '${this.collection}' has size ${existingSize}, but model requires ${vectorSize}.`);
            }
        }
    }

    async store(id: string, vector: number[], payload: any) {
        await this.client.upsert(this.collection, { points: [{ id, vector, payload }] });
    }

    async getPoint(id: string): Promise<VectorPoint | null> {
        const points = await this.client.retrieve(this.collection, { ids: [id], with_payload: true });
        if (points.length === 0) return null;
        const p = points[0];
        return { id: p.id as string, vector: (p as any).vector ?? [], payload: (p.payload ?? {}) as Record<string, any> };
    }

    async delete(id: string): Promise<boolean> {
        try {
            await this.client.delete(this.collection, { points: [id] });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Hybrid Search using Reciprocal Rank Fusion (RRF).
     * Pass 1: Semantic Vector Search
     * Pass 2: Native Full-Text Search (BM25-like via Qdrant)
     */
    async find(query: FindQuery): Promise<VectorPoint[]> {
        const { vector, limit, userid = "anonymous", query: textQuery, rrfK = 60, alpha = 0.7 } = query;

        try {
            const filter = { must: [{ key: "userid", match: { value: userid } }] };

            // Pass 1: Vector (semantic similarity)
            const vectorPromise = this.client.search(this.collection, {
                vector, limit: limit * 2, filter, with_payload: true
            });

            // Pass 2: Keyword (Native Qdrant Text Search)
            let textPromise: Promise<any[]> = Promise.resolve([]);
            
            if (textQuery) {
                const textFilter = {
                    must: [
                        { key: "userid", match: { value: userid } },
                        { key: "text", match: { text: textQuery } }
                    ]
                };

                textPromise = this.client.scroll(this.collection, {
                    filter: textFilter,
                    limit: limit * 2,
                    with_payload: true
                }).then(res => res.points);
            }

            const [vectorResults, textResults] = await Promise.all([vectorPromise, textPromise]);

            // Preserve original cosine scores from vector search
            vectorResults.forEach((res: any) => {
                res.payload = res.payload || {};
                res.payload._original_score = res.score;
            });

            // Score the text results (Synthetic TF)
            if (textQuery && textResults.length > 0) {
                const queryTerms = textQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2);
                textResults.forEach((res: any) => {
                    const text = (res.payload?.text || "").toLowerCase();
                    let hitCount = 0;
                    queryTerms.forEach(term => { if (text.includes(term)) hitCount++; });
                    
                    const synthetic = hitCount / (queryTerms.length || 1);
                    res._local_score = synthetic;
                    
                    res.payload = res.payload || {};
                    res.payload._original_score = synthetic;
                });
                textResults.sort((a: any, b: any) => b._local_score - a._local_score);
            }

            // Hybrid Fusion Logic (RRF)
            const fusionLimit = limit * 2;
            const scores: Record<string, { score: number; point: any }> = {};

            const applyRRF = (results: any[], weight: number) => {
                results.slice(0, fusionLimit).forEach((res, index) => {
                    const id = res.id.toString();
                    const rank = index + 1;
                    const rrfScore = weight * (1.0 / (rrfK + rank));
                    if (!scores[id]) {
                        scores[id] = { score: 0, point: res };
                    }
                    scores[id].score += rrfScore;
                });
            };

            applyRRF(vectorResults, alpha);
            if (textQuery && textResults.length > 0) {
                applyRRF(textResults, 1 - alpha);
            }

            const maxTheoretical = alpha * (1 / (rrfK + 1)) + (1 - alpha) * (1 / (rrfK + 1));

            return Object.values(scores)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit)
                .map(s => {
                    const point = { ...s.point, score: s.score / maxTheoretical };
                    if (point.payload) {
                        point.payload._original_score = point.payload._original_score ?? point.score;
                    } 
                    return point;
                });

        } catch (err) {
            console.error(`[QdrantVectorStore] Search failed: ${err}`);
            return [];
        }
    }

    async scrollAll(userid: string = "anonymous"): Promise<VectorPoint[]> {
        const filter = { must: [{ key: "userid", match: { value: userid } }] };
        const allPoints: any[] = [];
        let nextOffset: string | number | Record<string, unknown> | null | undefined = undefined;

        do {
            const response: any = await this.client.scroll(this.collection, {
                filter,
                limit: 100,
                with_payload: true,
                offset: nextOffset ?? undefined,
            });
            allPoints.push(...response.points);
            nextOffset = response.next_page_offset;
        } while (nextOffset);

        return allPoints;
    }

    async scrollAllUsers(): Promise<any[]> {
        const allPoints: any[] = [];
        let nextOffset: string | number | Record<string, unknown> | null | undefined = undefined;
        do {
            const response: any = await this.client.scroll(this.collection, {
                limit: 100,
                with_payload: true,
                offset: nextOffset ?? undefined,
            });
            allPoints.push(...response.points);
            nextOffset = response.next_page_offset;
        } while (nextOffset);
        return allPoints;
    }

    async storeBatch(points: { id: string, vector: number[], payload: any }[]) {
        await this.client.upsert(this.collection, { points });
    }

    async updatePayload(id: string, partialPayload: Record<string, unknown>) {
        await this.client.setPayload(this.collection, {
            payload: partialPayload,
            points: [id]
        });
    }

    async updateAccessTime(id: string) {
        await this.updatePayload(id, { last_accessed_at: new Date().toISOString() });
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.client.getCollections();
            return true;
        } catch {
            return false;
        }
    }

    async getCollectionStats(): Promise<{ pointsCount: number; status: string; indexedVectorsCount: number; segmentsCount: number }> {
        const info = await this.client.getCollection(this.collection);
        return {
            pointsCount: info.points_count ?? 0,
            status: info.status ?? 'unknown',
            indexedVectorsCount: info.indexed_vectors_count ?? 0,
            segmentsCount: info.segments_count ?? 0,
        };
    }

    async getCategoryBreakdown(categories: string[]): Promise<Record<string, number>> {
        const counts = await Promise.all(
            categories.map(async (cat) => {
                const result = await this.client.count(this.collection, {
                    filter: { must: [{ key: "category", match: { value: cat } }] },
                    exact: false,
                });
                return [cat, result.count] as [string, number];
            })
        );
        return Object.fromEntries(counts);
    }
}

/** @deprecated Use QdrantVectorStore instead. */
export const StorageService = QdrantVectorStore;