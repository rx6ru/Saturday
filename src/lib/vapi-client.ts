// Lightweight VapiService implementation using TDD approach
// This module wraps the @vapi-ai/server-sdk VapiClient to expose a small API
// for tests to mock against.

export interface AssistantConfig {
  name: string;
  description?: string;
  tools?: any[];
}

export class VapiService {
  private client: any;

  constructor(apiKey: string) {
    // Lazily require to allow tests to mock the dependency easily
    // @ts-ignore
    const { VapiClient } = require('@vapi-ai/server-sdk');
    this.client = new VapiClient({ apiKey });
  }

  async createSearchTool(webhookUrl: string) {
    const toolSpec = {
      type: 'function',
      name: 'search',
      webhookUrl,
    };
    // @ts-ignore
    return this.client.createTool?.(toolSpec);
  }

  async createAssistant(config: AssistantConfig) {
    const payload = {
      name: config.name,
      description: config.description,
      tools: config.tools ?? [],
    };
    // @ts-ignore
    return this.client.createAssistant?.(payload);
  }

  async getAssistant(id: string) {
    // @ts-ignore
    return this.client.getAssistant?.(id);
  }

  async deleteAssistant(id: string) {
    // @ts-ignore
    return this.client.deleteAssistant?.(id);
  }

  async deleteTool(id: string) {
    // @ts-ignore
    return this.client.deleteTool?.(id);
  }
}

export default VapiService;
