import { VapiService, AssistantConfig } from './vapi-client';
import { mockDeep } from 'jest-mock-extended';

jest.mock('@vapi-ai/server-sdk', () => {
  const mockClient = {
    tools: {
      create: jest.fn(),
      delete: jest.fn()
    },
    assistants: {
      create: jest.fn(),
      get: jest.fn(),
      delete: jest.fn()
    }
  };
  return {
    VapiClient: jest.fn().mockImplementation(() => mockClient)
  };
}, { virtual: true });

describe('VapiService (TDD)', () => {
  const apiKey = 'test-api-key';
  let service: VapiService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VapiService(apiKey);
    mockClient = (service as any).client;
  });

  test('RED: createSearchTool() creates function tool with correct params', async () => {
    mockClient.tools.create.mockResolvedValue({ id: 'tool-123' });

    const result = await service.createSearchTool('https://example.com/webhook');

    expect(mockClient.tools.create).toHaveBeenCalledTimes(1);
    expect(result).toBe('tool-123');
  });

  test('RED: createAssistant() attaches provided tools', async () => {
    mockClient.assistants.create.mockResolvedValue({ id: 'assistant-1' });

    const config: AssistantConfig = {
      name: 'Test Assistant',
      model: 'gpt-4o',
      voiceId: 'Harry',
      toolId: 'tool-1'
    };

    const result = await service.createAssistant(config);

    expect(mockClient.assistants.create).toHaveBeenCalledTimes(1);
    expect(result).toBe('assistant-1');
  });

  test('RED: getAssistant() retrieves assistant by id', async () => {
    mockClient.assistants.get.mockResolvedValue({ id: 'assistant-1' });

    const result = await service.getAssistant('assistant-1');

    expect(mockClient.assistants.get).toHaveBeenCalledTimes(1);
    expect(mockClient.assistants.get).toHaveBeenCalledWith('assistant-1');
    expect(result).toEqual({ id: 'assistant-1' });
  });

  test('RED: deleteAssistant() deletes assistant by id', async () => {
    mockClient.assistants.delete.mockResolvedValue({ ok: true });

    const result = await service.deleteAssistant('assistant-1');

    expect(mockClient.assistants.delete).toHaveBeenCalledTimes(1);
    expect(mockClient.assistants.delete).toHaveBeenCalledWith('assistant-1');
  });

  test('RED: deleteTool() deletes tool by id', async () => {
    mockClient.tools.delete.mockResolvedValue({ ok: true });

    const result = await service.deleteTool('tool-123');

    expect(mockClient.tools.delete).toHaveBeenCalledTimes(1);
    expect(mockClient.tools.delete).toHaveBeenCalledWith('tool-123');
  });
});
