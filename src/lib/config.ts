import * as fs from 'fs';
import * as path from 'path';

export interface VapiConfig {
  publicKey: string;
  privateKey: string;
  assistantId?: string | null;
}

export interface QdrantConfig {
  url: string;
  apiKey: string;
  collection: string;
}

export interface OpenAiConfig {
  apiKey: string;
}

export interface GeminiConfig {
  apiKey: string;
}

export interface EmbeddingConfig {
  provider: string;
  model: string;
  dimensions: number;
}

export interface AssistantModelConfig {
  provider: string;
  model: string;
  url?: string;
  apiKey?: string;
}

export interface AssistantConfig {
  model: AssistantModelConfig;
}

export interface IndexingConfig {
  include: string[];
  exclude: string[];
  extensions: string[];
}

export interface ServerConfig {
  port: number;
  host: string;
}

export interface Config {
  vapi: VapiConfig;
  qdrant: QdrantConfig;
  openai?: OpenAiConfig;
  gemini?: GeminiConfig;
  assistant?: AssistantConfig;
  embedding?: EmbeddingConfig;
  indexing?: IndexingConfig;
  server?: ServerConfig;
}

export function getEmbeddingDimensions(provider: string, model: string, explicit?: number): number {
  if (explicit) return explicit;
  if (provider === 'gemini') return 3072;
  const dimensions: Record<string, number> = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536
  };
  return dimensions[model] || 1536;
}

export function getDefaultConfig(): Config {
  return {
    vapi: {
      publicKey: '',
      privateKey: '',
      assistantId: null
    },
    qdrant: {
      url: '',
      apiKey: '',
      collection: ''
    },
    openai: {
      apiKey: ''
    },
    gemini: {
      apiKey: ''
    },
    assistant: {
      model: {
        provider: 'openai',
        model: 'gpt-4o'
      }
    },
    embedding: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536
    },
    indexing: {
      include: ['src', 'lib'],
      exclude: ['node_modules', '.git', 'dist', 'build'],
      extensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.md']
    },
    server: {
      port: 3000,
      host: '127.0.0.1'
    }
  };
}

export function validateConfig(cfg: Config): string[] {
  const errors: string[] = [];
  if (!cfg?.vapi?.publicKey) errors.push('vapi.publicKey is required');
  if (!cfg?.vapi?.privateKey) errors.push('vapi.privateKey is required');
  if (!cfg?.qdrant?.url) errors.push('qdrant.url is required');
  if (!cfg?.qdrant?.apiKey) errors.push('qdrant.apiKey is required');
  if (!cfg?.qdrant?.collection) errors.push('qdrant.collection is required');
  const embeddingProvider = cfg?.embedding?.provider || 'openai';
  if (embeddingProvider === 'openai' && !cfg?.openai?.apiKey) {
    errors.push('openai.apiKey is required');
  }
  if (embeddingProvider === 'gemini' && !cfg?.gemini?.apiKey) {
    errors.push('gemini.apiKey is required');
  }
  if (cfg?.assistant?.model?.provider === 'custom-llm' && !cfg.assistant.model.url) {
    errors.push('assistant.model.url is required for custom-llm');
  }
  return errors;
}

export function loadConfig(configPath: string): Config {
  const fullPath = path.resolve(configPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }
  const raw = fs.readFileSync(fullPath, 'utf-8');
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('Invalid JSON in config file');
  }
  const cfg = parsed as Config;
  const errors = validateConfig(cfg);
  if (errors.length > 0) {
    throw new Error(`Invalid config: ${errors.join('; ')}`);
  }
  return cfg;
}

export function saveConfig(configPath: string, cfg: Config): void {
  const fullPath = path.resolve(configPath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, JSON.stringify(cfg, null, 2), 'utf-8');
}
