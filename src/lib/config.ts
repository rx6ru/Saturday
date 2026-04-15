import * as fs from 'fs';
import * as path from 'path';

// PDA-01-Architecture.md: Config schema (272-301) mapped here
export interface VapiConfig {
  publicKey: string;
  privateKey: string;
}

export interface QdrantConfig {
  url: string;
  apiKey: string;
  collection: string;
}

export interface OpenAiConfig {
  apiKey: string;
}

export interface EmbeddingConfig {
  model: string;
}

export interface IndexingConfig {
  exclude: string[];
}

export interface ServerConfig {
  port: number;
}

export interface Config {
  vapi: VapiConfig;
  qdrant: QdrantConfig;
  openai: OpenAiConfig;
  embedding?: EmbeddingConfig;
  indexing?: IndexingConfig;
  server?: ServerConfig;
}

// Default values for optional fields
export function getDefaultConfig(): Config {
  return {
    vapi: {
      publicKey: '',
      privateKey: '',
    },
    qdrant: {
      url: '',
      apiKey: '',
      collection: '',
    },
    openai: {
      apiKey: '',
    },
    embedding: {
      model: 'text-embedding-ada-002',
    },
    indexing: {
      exclude: [],
    },
    server: {
      port: 3000,
    },
  };
}

// Basic validator: returns an array of missing/invalid fields (empty => valid)
export function validateConfig(cfg: Config): string[] {
  const errors: string[] = [];
  if (!cfg?.vapi?.publicKey) errors.push('vapi.publicKey is required');
  if (!cfg?.vapi?.privateKey) errors.push('vapi.privateKey is required');
  if (!cfg?.qdrant?.url) errors.push('qdrant.url is required');
  if (!cfg?.qdrant?.apiKey) errors.push('qdrant.apiKey is required');
  if (!cfg?.qdrant?.collection) errors.push('qdrant.collection is required');
  if (!cfg?.openai?.apiKey) errors.push('openai.apiKey is required');
  return errors;
}

// Load a config from a JSON file. Throws on missing file or invalid JSON or invalid schema
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
  // Basic structural enforcement: ensure object shape exists
  const cfg = parsed as Config;
  const errors = validateConfig(cfg);
  if (errors.length > 0) {
    throw new Error(`Invalid config: ${errors.join('; ')}`);
  }
  return cfg;
}

// Save a Config to a JSON file
export function saveConfig(configPath: string, cfg: Config): void {
  const fullPath = path.resolve(configPath);
  // Ensure directory exists
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, JSON.stringify(cfg, null, 2), 'utf-8');
}

// end
