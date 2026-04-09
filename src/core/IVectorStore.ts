/**
 * IVectorStore – Provider-agnostic vector database interface.
 *
 * Implement this interface to add support for a new vector database backend
 * (Qdrant, Pinecone, Weaviate, ChromaDB, etc.).
 */

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, any>;
  score?: number;
}

export interface FindQuery {
  vector: number[];
  limit: number;
  userid?: string;
  query?: string;
  rrfK?: number;
  alpha?: number;
}

export interface IVectorStore {
  /**
   * Initialize the store, creating collections/indexes as needed.
   * Implementations should store vectorSize for the `vectorSize` getter.
   */
  initialize(vectorSize: number): Promise<void>;

  /** Upsert a single point. */
  store(id: string, vector: number[], payload: any): Promise<void>;

  /** Upsert a batch of points. */
  storeBatch(points: { id: string; vector: number[]; payload: any }[]): Promise<void>;

  /** Retrieve a single point by ID, or null if not found. */
  getPoint(id: string): Promise<VectorPoint | null>;

  /** Delete a single point by ID. Returns true if deleted, false if not found. */
  delete(id: string): Promise<boolean>;

  /**
   * Hybrid search: vector similarity + optional keyword matching.
   * Returns results sorted by fused score, highest first.
   */
  find(query: FindQuery): Promise<VectorPoint[]>;

  /** Scroll/list all points for a given user. */
  scrollAll(userid?: string): Promise<VectorPoint[]>;

  /** Partially update the payload of a point. */
  updatePayload(id: string, partialPayload: Record<string, unknown>): Promise<void>;

  /** Convenience: update the last_accessed_at timestamp. */
  updateAccessTime(id: string): Promise<void>;

  /** Returns true if the backend is reachable and healthy. */
  healthCheck(): Promise<boolean>;

  /** Returns collection-level stats (point count, status, indexed vectors, segment count). */
  getCollectionStats(): Promise<{ pointsCount: number; status: string; indexedVectorsCount: number; segmentsCount: number }>;

  /** Returns per-category point counts. */
  getCategoryBreakdown(categories: string[]): Promise<Record<string, number>>;

  /** The vector dimension configured during initialize(), or null before init. */
  get vectorSize(): number | null;
}
