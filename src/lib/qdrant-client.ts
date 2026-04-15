// QdrantCodeIndex module - RED/GREEN/TDD driven
// Lightweight wrapper around @qdrant/js-client-rest used for code chunk indexing
// Tests will mock the underlying Qdrant client

export interface CodeChunkPayload {
  filePath: string;
  chunkHash: string;
  language: string;
  functionName?: string;
  startLine?: number;
  endLine?: number;
  lastSynced?: string;
}

export interface SearchResult {
  chunk: CodeChunkPayload;
  score: number;
}

export class QdrantCodeIndex {
  private client: any;
  private collection: string;
  private batchSize: number = 100;
  private searchLimit: number = 5;

  constructor(url: string, apiKey: string, collection: string, client?: any) {
    this.collection = collection;
    // Allow injection of a mock client for tests
    if (client) {
      this.client = client;
    } else {
      // Lazy require to avoid forcing a runtime import in tests
      const { QdrantClient } = require('@qdrant/js-client-rest');
      this.client = new QdrantClient({ address: url, apiKey });
    }
  }

  async ensureCollection(vectorSize: number): Promise<void> {
    const getCols = this.client.getCollections?.bind(this.client) as (() => any) | undefined;
    const cols = getCols ? await getCols() : [];
    const exists = (cols || []).find((c: any) => c?.name === this.collection);
    if (!exists) {
      const create = this.client.createCollection?.bind(this.client) as ((args: any) => any) | undefined;
      if (create) {
        await create({ name: this.collection, vectorSize });
      }
    }
  }

  async getExistingHashes(): Promise<Map<string, CodeChunkPayload>> {
    const map = new Map<string, CodeChunkPayload>();
    const scroll = this.client.scroll?.bind(this.client) as ((args: any) => any) | undefined;
    const pageSize = this.batchSize;
    let offset = 0;
    while (true) {
      const res = scroll ? await scroll({ collectionName: this.collection, limit: pageSize, offset }) : { points: [] };
      const points: any[] = (res as any)?.points ?? [];
      for (const p of points) {
        const payload = p?.payload as CodeChunkPayload | undefined;
        if (payload?.chunkHash) {
          map.set(payload.chunkHash, payload as CodeChunkPayload);
        }
      }
      if ((points?.length ?? 0) < pageSize) break;
      offset += pageSize;
    }
    return map;
  }

  async upsertBatch(points: CodeChunkPayload[]): Promise<void> {
    const upsert = this.client.upsert?.bind(this.client) as ((args: any) => any) | undefined;
    if (!upsert) return;
    const chunks: CodeChunkPayload[][] = [];
    for (let i = 0; i < points.length; i += this.batchSize) {
      chunks.push(points.slice(i, i + this.batchSize));
    }
    for (const batch of chunks) {
      const batchPoints = batch.map((p) => {
        return {
          id: p.chunkHash,
          vector: this.vectorFrom(p),
          payload: p,
        };
      });
      await upsert({ collectionName: this.collection, points: batchPoints });
    }
  }

  async deleteByPath(filePath: string): Promise<void> {
    const del = this.client.deleteByFilter?.bind(this.client) as ((args: any) => any) | undefined;
    if (!del) return;
    await del({ collectionName: this.collection, filter: { filePath } });
  }

  async search(vector: number[], limit: number = this.searchLimit): Promise<SearchResult[]> {
    const search = this.client.search?.bind(this.client) as ((args: any) => any) | undefined;
    if (!search) return [];
    const res = await search({ collectionName: this.collection, vector, limit, with_payload: true });
    const hits: any[] = (res as any)?.result ?? [];
    return hits.map((h) => ({ chunk: h.payload as CodeChunkPayload, score: h.score }));
  }

  async getStats(): Promise<{ pointCount: number; status: string }> {
    const stats = this.client.collectionStats?.bind(this.client) as ((args: any) => any) | undefined;
    if (!stats) return { pointCount: 0, status: 'unknown' };
    const res = await stats({ collectionName: this.collection });
    return {
      pointCount: (res as any)?.pointsCount ?? 0,
      status: (res as any)?.status ?? 'unknown',
    };
  }

  private vectorFrom(p: CodeChunkPayload): number[] {
    // Simple deterministic fallback vector derived from chunkHash and filePath
    const seed = `${p.chunkHash}|${p.filePath}`;
    const vec: number[] = [];
    for (let i = 0; i < 128; i++) {
      const ch = seed.charCodeAt(i % seed.length) || 0;
      vec.push(((ch * 131 + i) % 1000) / 1000);
    }
    return vec;
  }
}
