import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { QdrantCodeIndex } from '../lib/qdrant-client';
import { loadConfig, saveConfig, validateConfig, Config, getEmbeddingDimensions } from '../lib/config';

export function initCommand(program: Command) {
  program
    .command('init')
    .description('Initialize Saturday configuration')
    .option('--vapi-public-key <key>', 'Vapi public API key')
    .option('--vapi-private-key <key>', 'Vapi private API key')
    .option('--qdrant-url <url>', 'Qdrant cluster URL')
    .option('--qdrant-key <key>', 'Qdrant API key')
    .option('--qdrant-collection <name>', 'Qdrant collection name')
    .option('--openai-key <key>', 'OpenAI API key')
    .option('--gemini-key <key>', 'Gemini API key')
    .option('--assistant-model-provider <provider>', 'Vapi assistant model provider', 'openai')
    .option('--assistant-model <model>', 'Vapi assistant model')
    .option('--assistant-model-url <url>', 'OpenAI-compatible endpoint URL for custom-llm')
    .option('--assistant-provider-api-key <key>', 'Provider API key to attach to the Vapi assistant')
    .option('--embedding-provider <provider>', 'Embedding provider', 'openai')
    .option('--embedding-model <model>', 'Embedding model')
    .option('--embedding-dimensions <dimensions>', 'Embedding dimensions')
    .option('--force', 'Overwrite existing config')
    .action(async (options) => {
      try {
        await runInit(options);
      } catch (error: any) {
        console.error('Init failed:', error.message);
        process.exit(1);
      }
    });
}

export interface InitOptions {
  vapiPublicKey?: string;
  vapiPrivateKey?: string;
  qdrantUrl?: string;
  qdrantKey?: string;
  qdrantCollection?: string;
  openaiKey?: string;
  geminiKey?: string;
  assistantModelProvider?: string;
  assistantModel?: string;
  assistantModelUrl?: string;
  assistantProviderApiKey?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingDimensions?: string | number;
  configPath?: string;
  gitignorePath?: string;
  force?: boolean;
}

export async function runInit(options: InitOptions): Promise<void> {
  const configPath = path.resolve(options.configPath || path.join(process.cwd(), '.saturday.config.json'));
  const gitignorePath = path.resolve(options.gitignorePath || path.join(process.cwd(), '.gitignore'));

  console.log('Saturday Setup\n');

  if (fs.existsSync(configPath) && !options.force) {
    console.log('Config already exists. Overwrite with --force or delete first.');
    return;
  }

  const vapiPublicKey = options.vapiPublicKey || process.env.VAPI_PUBLIC_KEY || '';
  const vapiPrivateKey = options.vapiPrivateKey || process.env.VAPI_PRIVATE_KEY || '';
  const qdrantUrl = options.qdrantUrl || process.env.QDRANT_URL || '';
  const qdrantKey = options.qdrantKey || process.env.QDRANT_KEY || '';
  const collectionName = options.qdrantCollection || path.basename(process.cwd());
  const openaiKey = options.openaiKey || process.env.OPENAI_API_KEY || '';
  const geminiKey = options.geminiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || '';
  const assistantModelProvider = options.assistantModelProvider || 'openai';
  const assistantModel = options.assistantModel || getDefaultAssistantModel(assistantModelProvider);
  const assistantModelUrl = options.assistantModelUrl || getDefaultAssistantModelUrl(assistantModelProvider);
  const assistantProviderApiKey =
    options.assistantProviderApiKey ||
    getAssistantProviderApiKey(assistantModelProvider) ||
    '';
  const embeddingProvider = options.embeddingProvider || 'openai';
  const embeddingModel = options.embeddingModel || getDefaultEmbeddingModel(embeddingProvider);
  const explicitDimensions = options.embeddingDimensions ? Number(options.embeddingDimensions) : undefined;

  const embeddingDimensions = getEmbeddingDimensions(embeddingProvider, embeddingModel, explicitDimensions);

  const config: Config = {
    vapi: {
      publicKey: vapiPublicKey,
      privateKey: vapiPrivateKey,
      assistantId: null
    },
    assistant: {
      model: {
        provider: assistantModelProvider,
        model: assistantModel,
        ...(assistantModelUrl ? { url: assistantModelUrl } : {}),
        ...(assistantProviderApiKey ? { apiKey: assistantProviderApiKey } : {}),
      },
    },
    qdrant: {
      url: qdrantUrl,
      apiKey: qdrantKey,
      collection: collectionName
    },
    embedding: {
      provider: embeddingProvider,
      model: embeddingModel,
      dimensions: embeddingDimensions
    },
    openai: {
      apiKey: openaiKey
    },
    gemini: {
      apiKey: geminiKey
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

  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.log('Configuration incomplete. Missing:', errors.join(', '));
  }

  if (qdrantUrl && qdrantKey) {
    console.log('\nCreating Qdrant collection...');
    try {
      const qdrant = new QdrantCodeIndex(qdrantUrl, qdrantKey, collectionName);
      await qdrant.ensureCollection(embeddingDimensions);
      console.log(`Collection "${collectionName}" ready`);
    } catch (error: any) {
      console.log(`Could not create collection: ${error.message}`);
    }
  }

  saveConfig(configPath, config);
  console.log(`Wrote config to ${configPath}`);

  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.saturday.config.json')) {
      fs.appendFileSync(gitignorePath, '\n# Saturday\n.saturday.config.json\n');
      console.log('Updated .gitignore');
    }
  } else {
    fs.writeFileSync(gitignorePath, '# Saturday\n.saturday.config.json\n');
    console.log('Created .gitignore');
  }

  console.log('\nSaturday initialized successfully!');
  console.log('\nNext steps:');
  console.log(' 1. Run `saturday sync` to index your codebase');
  console.log(' 2. Run `saturday serve` to start the voice UI');
}

function getDefaultAssistantModel(provider: string): string {
  const defaults: Record<string, string> = {
    openai: 'gpt-4o',
    google: 'gemini-2.0-flash',
    gemini: 'gemini-2.0-flash',
    groq: 'llama-3.3-70b-versatile',
    cerebras: 'gpt-oss-120b',
    'custom-llm': 'gpt-oss-120b',
  };
  return defaults[provider] || 'gpt-4o';
}

function getDefaultAssistantModelUrl(provider: string): string | undefined {
  const urls: Record<string, string> = {
    groq: 'https://api.groq.com/openai/v1',
    cerebras: 'https://api.cerebras.ai/v1',
  };
  return urls[provider];
}

function getDefaultEmbeddingModel(provider: string): string {
  const defaults: Record<string, string> = {
    openai: 'text-embedding-3-small',
    gemini: 'gemini-embedding-001',
  };
  return defaults[provider] || 'text-embedding-3-small';
}

function getAssistantProviderApiKey(provider: string): string | undefined {
  const envMap: Record<string, string[]> = {
    openai: ['OPENAI_API_KEY'],
    google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GEMINI_API_KEYS'],
    gemini: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GEMINI_API_KEYS'],
    groq: ['GROQ_API_KEY'],
    cerebras: ['CEREBRAS_API_KEY', 'CEREBRAS_API_KEYS'],
    'custom-llm': ['CUSTOM_LLM_API_KEY'],
  };
  for (const envName of envMap[provider] || []) {
    if (process.env[envName]) return process.env[envName];
  }
  return undefined;
}
