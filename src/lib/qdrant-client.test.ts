import { mockDeep } from 'jest-mock-extended';
import { QdrantCodeIndex, CodeChunkPayload } from './qdrant-client';

describe('QdrantCodeIndex (RED -> tests with mocks)', () => {
  const url = 'http://localhost:6333';
  const apiKey = 'secret';
  const collection = 'code-index';

  let client: any;
  let index: QdrantCodeIndex;

  beforeEach(() => {
    client = mockDeep<any>();
    index = new QdrantCodeIndex(url, apiKey, collection, client);
  });

  test('RED: ensureCollection creates collection if not exists', async () => {
    client.getCollections.mockResolvedValue({ collections: [{ name: 'other' }] });
    client.createCollection.mockResolvedValue(undefined);
    await index.ensureCollection(256);
    expect(client.getCollections).toHaveBeenCalled();
    expect(client.createCollection).toHaveBeenCalledWith(collection, expect.objectContaining({ vectors: { size: 256, distance: 'Cosine' } }));
  });

  test('RED: ensureCollection skips if exists', async () => {
    client.getCollections.mockResolvedValue({ collections: [{ name: collection }] });
    await index.ensureCollection(256);
    expect(client.createCollection).not.toHaveBeenCalled();
  });

  test('RED: getExistingHashes scrolls all points and returns map', async () => {
    const page1Points = Array.from({ length: 100 }).map((_, i) => ({
      id: `id${i}`,
      payload: { chunkHash: `h${i + 1}`, filePath: `a${i + 1}.js`, functionName: null }
    }));
    const page2Points = Array.from({ length: 50 }).map((_, i) => ({
      id: `id${100 + i}`,
      payload: { chunkHash: `h${101 + i}`, filePath: `b${i + 1}.js`, functionName: null }
    }));

    client.scroll.mockImplementation(async () => {
      const calls = client.scroll.mock.calls.length;
      if (calls === 1) return { points: page1Points, next_page_offset: 'offset1' };
      if (calls === 2) return { points: page2Points, next_page_offset: undefined };
      return { points: [], next_page_offset: undefined };
    });

    const hashes = await index.getExistingHashes();
    expect(hashes.size).toBe(150);
    expect(hashes.get('a1.js:top-level')?.hash).toBe('h1');
    expect(hashes.get('b50.js:top-level')?.hash).toBe('h150');
  });

  test('RED: getExistingHashes keeps distinct chunks from same file', async () => {
    client.scroll.mockResolvedValue({
      points: [
        {
          id: 'id1',
          payload: {
            chunkHash: 'h1',
            filePath: 'src/app.ts',
            functionName: null,
            startLine: 1,
            endLine: 50,
          },
        },
        {
          id: 'id2',
          payload: {
            chunkHash: 'h2',
            filePath: 'src/app.ts',
            functionName: null,
            startLine: 41,
            endLine: 90,
          },
        },
      ],
      next_page_offset: undefined,
    });

    const hashes = await index.getExistingHashes();

    expect(hashes.size).toBe(2);
    expect(hashes.get('src/app.ts:top-level:1:50')?.hash).toBe('h1');
    expect(hashes.get('src/app.ts:top-level:41:90')?.hash).toBe('h2');
  });

  test('RED: upsertBatch upserts points in batches of 100', async () => {
    const pts: Array<{ id: string; vector: number[]; payload: CodeChunkPayload }> = [];
    for (let i = 0; i < 150; i++) {
      pts.push({
        id: `id${i}`,
        vector: new Array(128).fill(0.1),
        payload: { filePath: `p${i}.js`, chunkHash: `hash${i}`, language: 'ts' }
      });
    }
    client.upsert.mockResolvedValue(undefined);
    await index.upsertBatch(pts);
    expect(client.upsert).toHaveBeenCalledTimes(2);
  });

  test('RED: deleteByPath deletes points by filePath filter', async () => {
    client.delete.mockResolvedValue(undefined);
    await index.deleteByPath('/src/utils.js');
    expect(client.delete).toHaveBeenCalledWith(collection, expect.objectContaining({ filter: { must: expect.any(Array) } }));
  });

  test('RED: search returns similar code chunks', async () => {
    client.search.mockResolvedValue([
      { id: 'id1', score: 0.92, payload: { chunkHash: 'h1', filePath: 'a.js' } }
    ]);
    const vector = new Array<number>(128).fill(0.1);
    const results = await index.search(vector, 5);
    expect(results.length).toBe(1);
    expect(results[0].payload.chunkHash).toBe('h1');
    expect(results[0].score).toBe(0.92);
  });

  test('RED: getStats returns point count and status', async () => {
    client.getCollection.mockResolvedValue({ points_count: 42, status: 'green' });
    const stats = await index.getStats();
    expect(stats.pointCount).toBe(42);
    expect(stats.status).toBe('green');
  });
});
