export interface AssistantConfig {
  name: string;
  systemPrompt?: string;
  modelProvider?: string;
  model?: string;
  modelUrl?: string;
  providerApiKey?: string;
  voiceId?: string;
  toolId?: string;
  description?: string;
  tools?: any[];
}

export interface PhoneNumberConfig {
  areaCode: string;
  name?: string;
  assistantId?: string;
}

function resolveAssistantProvider(config: AssistantConfig): { provider: string; model: string; url?: string; credentialProvider?: string } {
  if (config.modelProvider === 'cerebras') {
    return {
      provider: 'custom-llm',
      credentialProvider: 'custom-llm',
      model: config.model || 'gpt-oss-120b',
      url: config.modelUrl || 'https://api.cerebras.ai/v1',
    };
  }

  return {
    provider: config.modelProvider || 'openai',
    credentialProvider: config.modelProvider || 'openai',
    model: config.model || 'gpt-4o',
    url: config.modelProvider === 'custom-llm' ? config.modelUrl : undefined,
  };
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
      server: {
        url: webhookUrl,
        timeoutSeconds: 10,
      },
    };
    const tool = await this.client.tools.create(toolSpec);
    return tool.id;
  }

  async createAssistant(config: AssistantConfig): Promise<string> {
    const resolvedModel = resolveAssistantProvider(config);
    const payload = {
      name: config.name,
      model: {
        provider: resolvedModel.provider,
        model: resolvedModel.model,
        ...(resolvedModel.url
          ? { url: resolvedModel.url }
          : {}),
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
      ...(config.providerApiKey
        ? {
            credentials: [
              {
                provider: resolvedModel.credentialProvider,
                apiKey: config.providerApiKey,
              },
            ],
          }
        : {}),
      voice: {
        provider: 'vapi',
        voiceId: config.voiceId || 'Elliot'
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

  async createPhoneNumber(config: PhoneNumberConfig): Promise<{ id: string; number?: string; sipUri?: string }> {
    const phoneNumber = await this.client.phoneNumbers.create({
      provider: 'vapi',
      numberDesiredAreaCode: config.areaCode,
      name: config.name,
      assistantId: config.assistantId,
    });

    return {
      id: phoneNumber.id,
      number: phoneNumber.number,
      sipUri: phoneNumber.sipUri,
    };
  }
}

export default VapiService;
