import fs from 'fs';
import os from 'os';
import path from 'path';
import { runSync } from './sync';

const getExistingHashes = jest.fn();
const upsertBatch = jest.fn();
const deleteByPath = jest.fn();
const embedBatch = jest.fn();

jest.mock('../lib/qdrant-client', () => ({
  QdrantCodeIndex: jest.fn().mockImplementation(() => ({
    getExistingHashes,
    upsertBatch,
    deleteByPath,
  })),
  buildChunkKey: jest.requireActual('../lib/qdrant-client').buildChunkKey,
  toQdrantPointId: jest.requireActual('../lib/qdrant-client').toQdrantPointId,
}));

jest.mock('../lib/embedding', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    embedBatch,
  })),
}));

describe('runSync', () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    getExistingHashes.mockResolvedValue(new Map());
    upsertBatch.mockResolvedValue(undefined);
    deleteByPath.mockResolvedValue(undefined);
    embedBatch.mockImplementation(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    jest.clearAllMocks();
  });

  test('falls back to the project root when legacy src/lib defaults find no files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-sync-root-'));
    const configPath = path.join(tempDir, '.saturday.config.json');

    fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export const answer = 42;\n', 'utf-8');
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          vapi: { publicKey: 'pub', privateKey: 'priv' },
          qdrant: { url: 'https://qdrant.example.com', apiKey: 'qdrant-key', collection: 'demo' },
          assistant: { model: { provider: 'openai', model: 'gpt-4o' } },
          openai: { apiKey: 'openai-key' },
          embedding: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
          indexing: {
            include: ['src', 'lib'],
            exclude: ['node_modules', '.git', 'dist', 'build'],
            extensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.md'],
          },
          server: { port: 3000, host: '127.0.0.1' },
        },
        null,
        2,
      ),
      'utf-8',
    );

    process.chdir(tempDir);

    await runSync({});

    expect(embedBatch).toHaveBeenCalledTimes(1);
    expect(upsertBatch).toHaveBeenCalledTimes(1);
    expect(upsertBatch.mock.calls[0][0][0].payload.filePath).toBe('index.ts');
  });

  test('throws an actionable error when no supported files are found anywhere', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-sync-empty-'));
    const configPath = path.join(tempDir, '.saturday.config.json');

    fs.writeFileSync(path.join(tempDir, 'README.txt'), 'nothing indexable here\n', 'utf-8');
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          vapi: { publicKey: 'pub', privateKey: 'priv' },
          qdrant: { url: 'https://qdrant.example.com', apiKey: 'qdrant-key', collection: 'demo' },
          assistant: { model: { provider: 'openai', model: 'gpt-4o' } },
          openai: { apiKey: 'openai-key' },
          embedding: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
          indexing: {
            include: ['src', 'lib'],
            exclude: ['node_modules', '.git', 'dist', 'build'],
            extensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.md'],
          },
          server: { port: 3000, host: '127.0.0.1' },
        },
        null,
        2,
      ),
      'utf-8',
    );

    process.chdir(tempDir);

    await expect(runSync({})).rejects.toThrow(
      'No supported files found. Update `indexing.include` or `indexing.extensions` in .saturday.config.json.',
    );
    expect(embedBatch).not.toHaveBeenCalled();
    expect(upsertBatch).not.toHaveBeenCalled();
  });

  test('skips markdown files when using the Jina code embedding model', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-sync-jina-code-'));
    const configPath = path.join(tempDir, '.saturday.config.json');

    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Docs\n', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export const answer = 42;\n', 'utf-8');
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          vapi: { publicKey: 'pub', privateKey: 'priv' },
          qdrant: { url: 'https://qdrant.example.com', apiKey: 'qdrant-key', collection: 'demo' },
          assistant: { model: { provider: 'openai', model: 'gpt-4o' } },
          jina: { apiKey: 'jina-key' },
          embedding: { provider: 'jina', model: 'jina-code-embeddings-1.5b', dimensions: 1536 },
          indexing: {
            include: ['.'],
            exclude: ['node_modules', '.git', 'dist', 'build'],
            extensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.md'],
          },
          server: { port: 3000, host: '127.0.0.1' },
        },
        null,
        2,
      ),
      'utf-8',
    );

    process.chdir(tempDir);

    await runSync({});

    expect(embedBatch).toHaveBeenCalledTimes(1);
    expect(embedBatch.mock.calls[0][0]).toHaveLength(1);
    expect(upsertBatch.mock.calls[0][0][0].payload.filePath).toBe('index.ts');
  });
});
