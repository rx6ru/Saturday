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
    client.getCollections.mockResolvedValue([{ name: 'other' }]);
    client.createCollection.mockResolvedValue(undefined);
    await index.ensureCollection(256);
    expect(client.getCollections).toHaveBeenCalled();
    expect(client.createCollection).toHaveBeenCalledWith(expect.objectContaining({ name: collection, vectorSize: 256 }));
  });

  test('RED: ensureCollection skips if exists', async () => {
    client.getCollections.mockResolvedValue([{ name: collection }]);
    await index.ensureCollection(256);
    expect(client.createCollection).not.toHaveBeenCalled();
  });

  test('RED: getExistingHashes scrolls all points and returns map', async () => {
    // Create 100 points on first page and 50 on second to simulate multiple pages
    const page1Points = Array.from({ length: 100 }).map((_, i) => ({ payload: { chunkHash: `h${i + 1}`, filePath: `a${i + 1}.js` } }));
    const page2Points = Array.from({ length: 50 }).map((_, i) => ({ payload: { chunkHash: `h${101 + i}`, filePath: `b${i + 1}.js` } }));
    const page1 = { points: page1Points };
    const page2 = { points: page2Points };
    client.scroll.mockImplementation(async ({ offset }: any) => {
      if (offset === 0) return page1;
      if (offset === 100) return page2;
      return { points: [] };
    });

    const hashes = await index.getExistingHashes();
    expect(hashes.size).toBe(150);
    expect(hashes.get('h1')?.filePath).toBe('a1.js');
    expect(hashes.get('h150')?.filePath).toBe('b50.js');
  });

  test('RED: upsertBatch upserts points in batches of 100', async () => {
    const pts: CodeChunkPayload[] = [];
    for (let i = 0; i < 150; i++) {
      pts.push({ filePath: `p${i}.js`, chunkHash: `hash${i}`, language: 'ts', lastSynced: new Date().toISOString() });
    }
    client.upsert.mockResolvedValue(undefined);
    await index.upsertBatch(pts);
    expect(client.upsert).toHaveBeenCalledTimes(2);
    const firstArg = (client.upsert as any).mock.calls[0][0];
    const secondArg = (client.upsert as any).mock.calls[1][0];
    expect(firstArg.points.length).toBe(100);
    expect(secondArg.points.length).toBe(50);
  });

  test('RED: deleteByPath deletes points by filePath filter', async () => {
    client.deleteByFilter.mockResolvedValue(undefined);
    await index.deleteByPath('/src/utils.js');
    expect(client.deleteByFilter).toHaveBeenCalledWith(expect.objectContaining({ collectionName: collection, filter: { filePath: '/src/utils.js' } }));
  });

  test('RED: search returns similar code chunks', async () => {
    client.search.mockResolvedValue({ result: [
      { payload: { chunkHash: 'h1', filePath: 'a.js' }, score: 0.92 }
    ]});
    const vector = new Array<number>(128).fill(0.1);
    const results = await index.search(vector, 5);
    expect(results.length).toBe(1);
    expect(results[0].chunk.chunkHash).toBe('h1');
    expect(results[0].score).toBe(0.92);
  });

  test('RED: getStats returns point count and status', async () => {
    client.collectionStats.mockResolvedValue({ pointsCount: 42, status: 'green' });
    const stats = await index.getStats();
    expect(stats.pointCount).toBe(42);
    expect(stats.status).toBe('green');
  });
});
