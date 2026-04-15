// Note: tests use Node's http module directly instead of SuperTest to avoid extra deps
import { startServer, getCodeIndex, getEmbeddingService } from './index';
import { QdrantCodeIndex, EmbeddingService } from './index';
import http from 'http';

describe('startServer (TDD RED/GREEN/REFACTOR)', () => {
  const config = {
    qdrant: { host: 'http://localhost' },
    embedding: { host: 'http://localhost' },
    openai: { apiKey: 'test' },
    server: { port: 3000 },
  } as any;

  let server: any;
  function doRequest(options: http.RequestOptions, postData?: any): Promise<{ statusCode: number; headers: any; body: any }> {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const contentType = res.headers['content-type'] || '';
          let parsed: any = data;
          try {
            if (contentType.includes('application/json')) {
              parsed = JSON.parse(data);
            }
          } catch {
            // leave as raw string
          }
          resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: parsed });
        });
      });
      req.on('error', (e) => reject(e));
      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  beforeAll(async () => {
    server = await startServer(config);
  });

  afterAll(() => {
    if (server && server.close) {
      server.close();
    }
  });

  test('startServer() creates Express app', async () => {
    expect(server).toBeTruthy();
    // http.Server should have listen function
    expect(typeof server.listen).toBe('function');
  });

  test('startServer() registers JSON middleware and API routes', async () => {
    const options = { hostname: '127.0.0.1', port: 3000, path: '/api/search', method: 'POST', headers: { 'Content-Type': 'application/json' } } as any;
    const res = await doRequest(options, JSON.stringify({ query: 'test' }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('received');
    expect(res.body.received).toHaveProperty('query', 'test');
  });

  test('startServer() registers static file serving for web directory', async () => {
    const options = { hostname: '127.0.0.1', port: 3000, path: '/index.html', method: 'GET' } as any;
    const res = await doRequest(options);
    expect(res.statusCode).toBe(200);
  });

  test('startServer() registers GET /health endpoint', async () => {
    const options = { hostname: '127.0.0.1', port: 3000, path: '/health', method: 'GET' } as any;
    const res = await doRequest(options);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('startServer() registers POST /api/search endpoint', async () => {
    const options = { hostname: '127.0.0.1', port: 3000, path: '/api/search', method: 'POST', headers: { 'Content-Type': 'application/json' } } as any;
    const res = await doRequest(options, JSON.stringify({ query: 'hello' }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('received');
  });

  test('startServer() registers GET /api/config endpoint', async () => {
    const options = { hostname: '127.0.0.1', port: 3000, path: '/api/config', method: 'GET' } as any;
    const res = await doRequest(options);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('port', 3000);
  });

  test('startServer() registers POST /api/sync endpoint', async () => {
    const options = { hostname: '127.0.0.1', port: 3000, path: '/api/sync', method: 'POST', headers: { 'Content-Type': 'application/json' } } as any;
    const res = await doRequest(options, JSON.stringify({ test: true }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ synced: true });
  });

  test('startServer() registers GET /api/stats endpoint', async () => {
    const options = { hostname: '127.0.0.1', port: 3000, path: '/api/stats', method: 'GET' } as any;
    const res = await doRequest(options);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('uptimeMs');
  });

  test('startServer() starts listening on configured port', async () => {
    // Verify server.address() port matches config.port
    const addr = server.address();
    // address() can return string for unix sockets; ensure numeric port when present
    if (typeof addr === 'object' && addr && 'port' in addr) {
      expect((addr as any).port).toBe(3000);
    } else {
      // Fallback: ensure health endpoint still responds
      const options = { hostname: '127.0.0.1', port: 3000, path: '/health', method: 'GET' } as any;
      const res = await doRequest(options);
      expect(res.statusCode).toBe(200);
    }
  });

  test('Server initializes QdrantCodeIndex and EmbeddingService', async () => {
    const codeIndex = getCodeIndex();
    const embedding = getEmbeddingService();
    expect(codeIndex).toBeInstanceOf(QdrantCodeIndex);
    expect(embedding).toBeInstanceOf(EmbeddingService);
  });
});
