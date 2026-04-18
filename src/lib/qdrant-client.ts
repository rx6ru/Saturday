export interface CodeChunkPayload {
  filePath: string;
  chunkHash: string;
  language: string;
  functionName?: string | null;
  chunkKey?: string;
  startLine?: number;
  endLine?: number;
  lastSynced?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: CodeChunkPayload;
}

export function buildChunkKey(payload: {
  filePath: string;
  functionName?: string | null;
  startLine?: number;
  endLine?: number;
}): string {
  const functionPart = payload.functionName || 'top-level';
  if (payload.startLine && payload.endLine) {
    return `${payload.filePath}:${functionPart}:${payload.startLine}:${payload.endLine}`;
  }
  return `${payload.filePath}:${functionPart}`;
}

export function toQdrantPointId(seed: string): string {
  const { createHash } = require('crypto');
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class QdrantCodeIndex {
  private client: any;
  private collection: string;
  private batchSize: number = 100;
  private searchLimit: number = 5;

  constructor(url: string, apiKey: string, collection: string, client?: any) {
    this.collection = collection;
    if (client) {
      this.client = client;
    } else {
      const { QdrantClient } = require('@qdrant/js-client-rest');
      this.client = new QdrantClient({ url, apiKey });
    }
  }

  async ensureCollection(vectorSize: number): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = (collections?.collections || []).find((c: any) => c?.name === this.collection);
    if (!exists) {
      await this.client.createCollection(this.collection, {
        vectors: { size: vectorSize, distance: 'Cosine' }
      });
    }
  }

  async getExistingHashes(): Promise<Map<string, { id: string; hash: string }>> {
    const map = new Map<string, { id: string; hash: string }>();
    let offset: string | undefined = undefined;

    while (true) {
      const result: { points: any[]; next_page_offset?: string } = await this.client.scroll(this.collection, {
        limit: this.batchSize,
        offset,
        with_payload: true,
        with_vector: false
      });

      for (const point of result.points || []) {
        const payload = point.payload as CodeChunkPayload;
        const key = payload.chunkKey || buildChunkKey(payload);
        map.set(key, { id: point.id as string, hash: payload.chunkHash });
      }

      offset = result.next_page_offset;
      if (!offset) break;
    }

    return map;
  }

  async upsertBatch(
    points: Array<{ id: string; vector: number[]; payload: CodeChunkPayload }>,
    onProgress?: (progress: { completed: number; total: number }) => void,
  ): Promise<void> {
    for (let i = 0; i < points.length; i += this.batchSize) {
      const batch = points.slice(i, i + this.batchSize);
      await this.client.upsert(this.collection, {
        points: batch.map(p => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload
        }))
      });
      onProgress?.({ completed: Math.min(i + batch.length, points.length), total: points.length });
    }
  }

  async deleteByPath(filePath: string): Promise<void> {
    await this.client.delete(this.collection, {
      filter: {
        must: [{ key: 'filePath', match: { value: filePath } }]
      }
    });
  }

  async search(vector: number[], limit: number = this.searchLimit): Promise<SearchResult[]> {
    const results = await this.client.search(this.collection, {
      vector,
      limit,
      with_payload: true,
      with_vector: false
    });

    return (results || []).map((r: any) => ({
      id: r.id,
      score: r.score,
      payload: r.payload as CodeChunkPayload
    }));
  }

  async getStats(): Promise<{ pointCount: number; status: string }> {
    const info = await this.client.getCollection(this.collection);
    return {
      pointCount: info?.points_count || 0,
      status: info?.status || 'unknown'
    };
  }
}
