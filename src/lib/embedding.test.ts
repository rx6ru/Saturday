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
}, { virtual: true });

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

    expect(small.getDimensions()).toBe(1536);
    expect(large.getDimensions()).toBe(3072);
    expect(ada.getDimensions()).toBe(1536);
  });
});
