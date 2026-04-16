export interface AssistantConfig {
  name: string;
  systemPrompt?: string;
  model?: string;
  voiceId?: string;
  toolId?: string;
  description?: string;
  tools?: any[];
}

export class VapiService {
  private client: any;

  constructor(apiKey: string) {
    const { VapiClient } = require('@vapi-ai/server-sdk');
    this.client = new VapiClient({ token: apiKey });
  }

  async createSearchTool(webhookUrl: string): Promise<string> {
    const toolSpec = {
      type: 'function',
      function: {
        name: 'search_codebase',
        description: 'Search the indexed codebase for relevant code chunks and cite the matching files.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      },
      server: { url: webhookUrl },
      timeoutSeconds: 10
    };
    const tool = await this.client.tools.create(toolSpec);
    return tool.id;
  }

  async createAssistant(config: AssistantConfig): Promise<string> {
    const payload = {
      name: config.name,
      model: {
        provider: 'openai',
        model: config.model || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              config.systemPrompt ||
              'You are Saturday, a voice coding assistant. Use the search_codebase tool for code questions and cite the files you use.'
          }
        ],
        toolIds: config.toolId ? [config.toolId] : []
      },
      voice: {
        provider: 'vapi',
        voiceId: config.voiceId || 'Harry'
      },
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: 'en-US'
      },
      firstMessage: "Hello. I'm Saturday. Ask me about your codebase.",
      clientMessages: ['transcript', 'tool-calls', 'speech-update'],
      serverMessages: ['tool-calls']
    };
    const assistant = await this.client.assistants.create(payload);
    return assistant.id;
  }

  async getAssistant(id: string) {
    return this.client.assistants.get(id);
  }

  async deleteAssistant(id: string) {
    return this.client.assistants.delete(id);
  }

  async deleteTool(id: string) {
    return this.client.tools.delete(id);
  }
}

export default VapiService;
