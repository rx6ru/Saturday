import { EmbeddingService } from './embedding';

const mockCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      embeddings: {
        create: mockCreate
      }
    }))
  };
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmbeddingService('test-api-key', 'text-embedding-3-small');
  });

  test('embed() creates embedding for single text', async () => {
    mockCreate.mockResolvedValueOnce({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 5, total_tokens: 5 }
    });

    const result = await service.embed('test query');

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'test query'
    });
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  test('embedBatch() processes multiple texts', async () => {
    mockCreate.mockResolvedValueOnce({
      data: [
        { index: 0, embedding: [0.1, 0.2] },
        { index: 1, embedding: [0.3, 0.4] }
      ]
    });

    const result = await service.embedBatch(['text1', 'text2']);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  test('getDimensions() returns correct dimensions for models', () => {
    const small = new EmbeddingService('key', 'text-embedding-3-small');
    const large = new EmbeddingService('key', 'text-embedding-3-large');
    const ada = new EmbeddingService('key', 'text-embedding-ada-002');
    const gemini = new EmbeddingService({
      provider: 'gemini',
      apiKey: 'gemini-key',
      model: 'gemini-embedding-001',
      dimensions: 768,
    });

    expect(small.getDimensions()).toBe(1536);
    expect(large.getDimensions()).toBe(3072);
    expect(ada.getDimensions()).toBe(1536);
    expect(gemini.getDimensions()).toBe(768);
  });

  test('embed() calls Gemini REST endpoint with task type and output dimensions', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embedding: {
          values: [0.1, 0.2, 0.3],
        },
      }),
    });
    global.fetch = fetchMock as any;

    const gemini = new EmbeddingService({
      provider: 'gemini',
      apiKey: 'gemini-key',
      model: 'gemini-embedding-001',
      dimensions: 768,
    });

    const result = await gemini.embed('find auth code', 'CODE_RETRIEVAL_QUERY');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-goog-api-key': 'gemini-key',
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      content: {
        parts: [{ text: 'find auth code' }],
      },
      taskType: 'CODE_RETRIEVAL_QUERY',
      output_dimensionality: 768,
    });
    expect(result.embedding).toEqual([
      0.2672612419124244,
      0.5345224838248488,
      0.8017837257372731,
    ]);

    global.fetch = originalFetch;
  });

  test('embed() calls Jina embeddings API for text retrieval', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
      }),
    });
    global.fetch = fetchMock as any;

    const jina = new EmbeddingService({
      provider: 'jina',
      apiKey: 'jina-key',
      model: 'jina-embeddings-v5-text-small',
      dimensions: 1024,
    });

    const result = await jina.embed('find auth docs', 'RETRIEVAL_QUERY');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.jina.ai/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer jina-key',
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: 'jina-embeddings-v5-text-small',
      task: 'retrieval.query',
      normalized: true,
      embedding_type: 'float',
      input: ['find auth docs'],
    });
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);

    global.fetch = originalFetch;
  });

  test('embedBatch() uses Jina code retrieval tasks for code models', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [0.1, 0.2] },
          { index: 1, embedding: [0.3, 0.4] },
        ],
      }),
    });
    global.fetch = fetchMock as any;

    const jina = new EmbeddingService({
      provider: 'jina',
      apiKey: 'jina-key',
      model: 'jina-code-embeddings-1.5b',
      dimensions: 1536,
    });

    const result = await jina.embedBatch(['doc 1', 'doc 2'], 100, 'RETRIEVAL_DOCUMENT');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: 'jina-code-embeddings-1.5b',
      task: 'nl2code.passage',
      normalized: true,
      embedding_type: 'float',
      input: ['doc 1', 'doc 2'],
    });
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);

    global.fetch = originalFetch;
  });

  test('embedBatch() splits Jina batches to stay below token-heavy request sizes', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ index: 0, embedding: [0.1, 0.2] }],
      }),
    });
    global.fetch = fetchMock as any;

    const jina = new EmbeddingService({
      provider: 'jina',
      apiKey: 'jina-key',
      model: 'jina-embeddings-v5-text-small',
      dimensions: 1024,
    });

    await jina.embedBatch([`a`.repeat(50000), `b`.repeat(50000)], 100, 'RETRIEVAL_DOCUMENT');

    expect(fetchMock).toHaveBeenCalledTimes(2);

    global.fetch = originalFetch;
  });

  test('embedBatch() retries Jina token rate limits', async () => {
    const originalFetch = global.fetch;
    const sleepSpy = jest.spyOn(EmbeddingService.prototype as any, 'sleep').mockResolvedValue(undefined);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => '{"code":"RATE_TOKEN_LIMIT_EXCEEDED"}',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
        }),
      });
    global.fetch = fetchMock as any;

    const jina = new EmbeddingService({
      provider: 'jina',
      apiKey: 'jina-key',
      model: 'jina-embeddings-v5-text-small',
      dimensions: 1024,
    });

    const result = await jina.embedBatch(['doc'], 100, 'RETRIEVAL_DOCUMENT');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledWith(65000);
    expect(result).toEqual([[0.1, 0.2, 0.3]]);

    sleepSpy.mockRestore();
    global.fetch = originalFetch;
  });

  test('embedBatch() falls back to split-and-average when Jina cannot encode a chunk', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"detail":{"message":"Failed to encode text"}}',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"detail":{"message":"Failed to encode text"}}',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ index: 0, embedding: [1, 0] }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ index: 0, embedding: [0, 1] }],
        }),
      });
    global.fetch = fetchMock as any;

    const jina = new EmbeddingService({
      provider: 'jina',
      apiKey: 'jina-key',
      model: 'jina-code-embeddings-1.5b',
      dimensions: 1536,
    });

    const result = await jina.embedBatch(['line 1\nline 2\nline 3\nline 4'], 100, 'RETRIEVAL_DOCUMENT');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result[0][0]).toBeCloseTo(0.707106, 5);
    expect(result[0][1]).toBeCloseTo(0.707106, 5);

    global.fetch = originalFetch;
  });
});
