import express, { Express, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { runSync, SyncOptions } from '../commands/sync';
import { Config } from '../lib/config';
import { EmbeddingService } from '../lib/embedding';
import { QdrantCodeIndex } from '../lib/qdrant-client';
import { createSearchHandler } from './routes/search';

export interface ServerDependencies {
  qdrant?: Pick<QdrantCodeIndex, 'getStats' | 'search'>;
  embedding?: Pick<EmbeddingService, 'embed'>;
  syncRunner?: (options: SyncOptions) => Promise<void>;
  configPath?: string;
}

export function createHealthHandler() {
  return (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  };
}

export function createConfigHandler(config: Config) {
  return (_req: Request, res: Response) => {
    res.json({
      vapiPublicKey: config.vapi.publicKey,
      assistantId: config.vapi.assistantId || '',
    });
  };
}

export function createSyncHandler(
  syncRunner: (options: SyncOptions) => Promise<void>,
  configPath: string,
) {
  return async (_req: Request, res: Response) => {
    try {
      await syncRunner({ config: configPath });
      res.json({
        message: 'Sync complete',
        timestamp: Date.now(),
      });
    } catch (error: any) {
      res.status(500).json({
        error: `Sync failed: ${error.message}`,
      });
    }
  };
}

export function createStatsHandler(qdrant: Pick<QdrantCodeIndex, 'getStats'>) {
  return async (_req: Request, res: Response) => {
    try {
      const stats = await qdrant.getStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({
        error: `Stats failed: ${error.message}`,
      });
    }
  };
}

export function createApp(config: Config, dependencies: ServerDependencies = {}): Express {
  const app = express();
  const qdrant =
    dependencies.qdrant ||
    new QdrantCodeIndex(config.qdrant.url, config.qdrant.apiKey, config.qdrant.collection);
  const embedding =
    dependencies.embedding ||
    new EmbeddingService({
      ...(config.embedding || {
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536,
      }),
      apiKey:
        config.embedding?.provider === 'gemini'
          ? config.gemini?.apiKey || ''
          : config.openai?.apiKey || '',
    });
  const syncRunner = dependencies.syncRunner || runSync;
  const configPath = dependencies.configPath || '.saturday.config.json';
  const staticDir = path.resolve(__dirname, '..', 'web');

  app.use(express.json());
  app.use(express.static(staticDir));

  app.get('/health', createHealthHandler());
  app.post('/api/search', createSearchHandler(qdrant as QdrantCodeIndex, embedding as EmbeddingService));
  app.get('/api/config', createConfigHandler(config));
  app.post('/api/sync', createSyncHandler(syncRunner, configPath));
  app.get('/api/stats', createStatsHandler(qdrant));

  return app;
}

export async function startServer(
  config: Config,
  dependencies: ServerDependencies = {},
): Promise<http.Server> {
  const app = createApp(config, dependencies);
  const port = config.server?.port ?? 3000;
  const host = config.server?.host ?? '127.0.0.1';

  return new Promise<http.Server>((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.on('error', reject);
  });
}

export default startServer;
