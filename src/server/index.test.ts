import { createSearchHandler } from './routes/search';
import {
  createConfigHandler,
  createHealthHandler,
  createStatsHandler,
  createSyncHandler,
} from './index';

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
}

describe('server handlers', () => {
  const config = {
    vapi: {
      publicKey: 'public-key',
      privateKey: 'private-key',
      assistantId: 'assistant-123',
    },
    qdrant: {
      url: 'https://qdrant.example.com',
      apiKey: 'qdrant-key',
      collection: 'code-index',
    },
    embedding: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536,
    },
    openai: {
      apiKey: 'openai-key',
    },
    server: {
      port: 0,
      host: '127.0.0.1',
    },
  };

  test('config handler returns frontend Vapi config', async () => {
    const res = createResponse();

    await createConfigHandler(config as any)({} as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      vapiPublicKey: 'public-key',
      assistantId: 'assistant-123',
      assistantProvider: '',
      assistantModel: '',
    });
  });

  test('health handler returns ok', async () => {
    const res = createResponse();

    await createHealthHandler()({} as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('number');
  });

  test('search handler handles simple Vapi tool-call format', async () => {
    const req = {
      body: {
        message: {
          type: 'tool-calls',
          toolCallList: [
            {
              id: 'tool-1',
              name: 'search_codebase',
              arguments: {
                query: 'How does login work?',
              },
            },
          ],
        },
      },
    };
    const res = createResponse();
    const handler = createSearchHandler(
      {
        search: jest.fn().mockResolvedValue([
          {
            id: 'point-1',
            score: 0.91,
            payload: {
              filePath: 'src/auth/login.ts',
              functionName: 'login',
              startLine: 12,
              endLine: 48,
              chunkHash: 'abc',
              language: 'typescript',
            },
          },
        ]),
      } as any,
      {
        embed: jest.fn().mockResolvedValue({
          embedding: [0.1, 0.2, 0.3],
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
      } as any,
    );

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].toolCallId).toBe('tool-1');
    expect(res.body.results[0].result).toContain('src/auth/login.ts');
    expect(res.body.results[0].result).toContain('login');
  });

  test('search handler handles nested Vapi tool-call format', async () => {
    const req = {
      body: {
        message: {
          type: 'tool-calls',
          toolCallList: [
            {
              name: 'search_codebase',
              toolCall: {
                id: 'tool-2',
                type: 'function',
                function: {
                  name: 'search_codebase',
                  arguments: JSON.stringify({
                    query: 'How is the server started?',
                  }),
                },
              },
            },
          ],
        },
      },
    };
    const res = createResponse();
    const handler = createSearchHandler(
      {
        search: jest.fn().mockResolvedValue([
          {
            id: 'point-1',
            score: 0.88,
            payload: {
              filePath: 'src/server/index.ts',
              functionName: 'startServer',
              startLine: 10,
              endLine: 42,
              chunkHash: 'def',
              language: 'typescript',
            },
          },
        ]),
      } as any,
      {
        embed: jest.fn().mockResolvedValue({
          embedding: [0.1, 0.2, 0.3],
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
      } as any,
    );

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].toolCallId).toBe('tool-2');
    expect(res.body.results[0].result).toContain('src/server/index.ts');
    expect(res.body.results[0].result).toContain('startServer');
  });

  test('search handler embeds questions as code retrieval queries', async () => {
    const embed = jest.fn().mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      model: 'gemini-embedding-001',
      usage: { prompt_tokens: 0, total_tokens: 0 },
    });
    const req = {
      body: {
        message: {
          type: 'tool-calls',
          toolCallList: [
            {
              id: 'tool-1',
              name: 'search_codebase',
              arguments: {
                query: 'Where is auth handled?',
              },
            },
          ],
        },
      },
    };
    const res = createResponse();

    await createSearchHandler(
      { search: jest.fn().mockResolvedValue([]) } as any,
      { embed } as any,
    )(req as any, res as any);

    expect(embed).toHaveBeenCalledWith('Where is auth handled?', 'CODE_RETRIEVAL_QUERY');
  });

  test('sync handler triggers sync runner with config path', async () => {
    const res = createResponse();
    const syncRunner = jest.fn().mockResolvedValue(undefined);

    await createSyncHandler(syncRunner, '/tmp/work/.saturday.config.json')({} as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(syncRunner).toHaveBeenCalledWith({ config: '/tmp/work/.saturday.config.json' });
    expect(res.body.message).toContain('Sync complete');
  });

  test('stats handler returns Qdrant stats', async () => {
    const res = createResponse();

    await createStatsHandler({
      getStats: jest.fn().mockResolvedValue({ pointCount: 42, status: 'green' }),
    } as any)({} as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ pointCount: 42, status: 'green' });
  });
});
