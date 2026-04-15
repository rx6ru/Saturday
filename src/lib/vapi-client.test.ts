import { VapiService, AssistantConfig } from './vapi-client';
import { mockDeep } from 'jest-mock-extended';

// Mock the external Vapi SDK to ensure no real network calls are made.
let mockClient: any;
jest.mock('@vapi-ai/server-sdk', () => {
  mockClient = mockDeep<any>();
  return {
    VapiClient: jest.fn().mockImplementation(() => mockClient),
  };
}, { virtual: true });

describe('VapiService (TDD)', () => {
  const apiKey = 'test-api-key';
  let service: VapiService;
  beforeEach(() => {
    // Re-create service to capture fresh mocks per test
    // @ts-ignore
    service = new VapiService(apiKey);
  });

  test('RED: createSearchTool() creates function tool with correct params', async () => {
    // Arrange
    const createToolSpy = mockClient.createTool as jest.Mock;
    createToolSpy.mockResolvedValue({ toolId: 'tool-123' });

    // Act
    const result = await service.createSearchTool('https://example.com/webhook');

    // Assert
    expect(createToolSpy).toHaveBeenCalledTimes(1);
    expect(createToolSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'function', name: 'search', webhookUrl: 'https://example.com/webhook' })
    );
    expect(result).toEqual({ toolId: 'tool-123' });
  });

  test('RED: createAssistant() attaches provided tools', async () => {
    // Arrange
    const createAssistantSpy = mockClient.createAssistant as jest.Mock;
    const config: AssistantConfig = {
      name: 'Test Assistant',
      description: 'desc',
      tools: [{ id: 'tool-1' }],
    };
    createAssistantSpy.mockResolvedValue({ id: 'assistant-1' });

    // Act
    const result = await service.createAssistant(config);

    // Assert
    expect(createAssistantSpy).toHaveBeenCalledTimes(1);
    expect(createAssistantSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Assistant', description: 'desc', tools: config.tools })
    );
    expect(result).toEqual({ id: 'assistant-1' });
  });

  test('RED: getAssistant() retrieves assistant by id', async () => {
    // Arrange
    const getAssistantSpy = mockClient.getAssistant as jest.Mock;
    getAssistantSpy.mockResolvedValue({ id: 'assistant-1' });

    // Act
    const result = await service.getAssistant('assistant-1');

    // Assert
    expect(getAssistantSpy).toHaveBeenCalledTimes(1);
    expect(getAssistantSpy).toHaveBeenCalledWith('assistant-1');
    expect(result).toEqual({ id: 'assistant-1' });
  });

  test('RED: deleteAssistant() deletes assistant by id', async () => {
    // Arrange
    const deleteAssistantSpy = mockClient.deleteAssistant as jest.Mock;
    deleteAssistantSpy.mockResolvedValue({ ok: true });

    // Act
    const result = await service.deleteAssistant('assistant-1');

    // Assert
    expect(deleteAssistantSpy).toHaveBeenCalledTimes(1);
    expect(deleteAssistantSpy).toHaveBeenCalledWith('assistant-1');
    expect(result).toEqual({ ok: true });
  });

  test('RED: deleteTool() deletes tool by id', async () => {
    // Arrange
    const deleteToolSpy = mockClient.deleteTool as jest.Mock;
    deleteToolSpy.mockResolvedValue({ ok: true });

    // Act
    const result = await service.deleteTool('tool-123');

    // Assert
    expect(deleteToolSpy).toHaveBeenCalledTimes(1);
    expect(deleteToolSpy).toHaveBeenCalledWith('tool-123');
    expect(result).toEqual({ ok: true });
  });
});
