import { Command } from 'commander';
import * as p from '@clack/prompts';
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
    .addHelpText(
      'after',
      `
Examples:
  saturday init --qdrant-url <url> --qdrant-key <key> --openai-key <key>
  saturday init --assistant-model-provider groq --assistant-provider-api-key "$GROQ_API_KEY"
  saturday init --embedding-provider gemini --gemini-key "$GEMINI_API_KEY"
`,
    )
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
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (interactive) {
    p.intro('Saturday');
  } else {
    console.log('Saturday Setup\n');
  }

  if (fs.existsSync(configPath) && !options.force) {
    if (!interactive) {
      console.log('Config already exists. Overwrite with --force or delete first.');
      return;
    }

    const shouldOverwrite = await p.confirm({
      message: 'Config already exists. Overwrite it?',
      initialValue: false,
    });
    if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
      p.cancel('Initialization cancelled.');
      return;
    }
  }

  const vapiPublicKey = await resolveTextOption({
    value: options.vapiPublicKey || process.env.VAPI_PUBLIC_KEY || '',
    interactive,
    prompt: 'Vapi public key',
    secret: true,
  });
  const vapiPrivateKey = await resolveTextOption({
    value: options.vapiPrivateKey || process.env.VAPI_PRIVATE_KEY || '',
    interactive,
    prompt: 'Vapi private key',
    secret: true,
  });
  const qdrantUrl = await resolveTextOption({
    value: options.qdrantUrl || process.env.QDRANT_URL || '',
    interactive,
    prompt: 'Qdrant URL',
    placeholder: 'https://your-cluster.qdrant.io:6333',
  });
  const qdrantKey = await resolveTextOption({
    value: options.qdrantKey || process.env.QDRANT_KEY || '',
    interactive,
    prompt: 'Qdrant API key',
    secret: true,
  });
  const collectionName = await resolveTextOption({
    value: options.qdrantCollection || path.basename(process.cwd()),
    interactive,
    prompt: 'Qdrant collection name',
    placeholder: path.basename(process.cwd()),
  });
  const openaiKey = options.openaiKey || process.env.OPENAI_API_KEY || '';
  const geminiKey = options.geminiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || '';
  const assistantModelProvider = await resolveSelectOption({
    value: options.assistantModelProvider || 'openai',
    interactive,
    prompt: 'Assistant model provider',
    options: [
      { value: 'openai', label: 'OpenAI' },
      { value: 'google', label: 'Google Gemini via Vapi' },
      { value: 'groq', label: 'Groq' },
      { value: 'cerebras', label: 'Cerebras' },
      { value: 'custom-llm', label: 'Custom OpenAI-compatible endpoint' },
    ],
  });
  const assistantModel = await resolveTextOption({
    value: options.assistantModel || getDefaultAssistantModel(assistantModelProvider),
    interactive,
    prompt: 'Assistant model',
    placeholder: getDefaultAssistantModel(assistantModelProvider),
  });
  const assistantModelUrl = await resolveOptionalTextOption({
    value: options.assistantModelUrl || getDefaultAssistantModelUrl(assistantModelProvider),
    interactive: interactive && assistantModelProvider === 'custom-llm',
    prompt: 'Assistant model URL',
    placeholder: 'https://api.provider.com/v1',
  });
  const assistantProviderApiKey =
    await resolveOptionalTextOption({
      value: options.assistantProviderApiKey || getAssistantProviderApiKey(assistantModelProvider) || '',
      interactive,
      prompt: `${assistantModelProvider} API key`,
      secret: true,
    });
  const embeddingProvider = await resolveSelectOption({
    value: options.embeddingProvider || 'openai',
    interactive,
    prompt: 'Embedding provider',
    options: [
      { value: 'openai', label: 'OpenAI' },
      { value: 'gemini', label: 'Gemini' },
    ],
  });
  const embeddingModel = await resolveTextOption({
    value: options.embeddingModel || getDefaultEmbeddingModel(embeddingProvider),
    interactive,
    prompt: 'Embedding model',
    placeholder: getDefaultEmbeddingModel(embeddingProvider),
  });
  const explicitDimensions = options.embeddingDimensions ? Number(options.embeddingDimensions) : undefined;
  const resolvedDimensions = await resolveTextOption({
    value: explicitDimensions ? String(explicitDimensions) : '',
    interactive: interactive && embeddingProvider === 'gemini',
    prompt: 'Embedding dimensions',
    placeholder: String(getEmbeddingDimensions(embeddingProvider, embeddingModel)),
  });
  const resolvedOpenAiKey =
    embeddingProvider === 'openai'
      ? await resolveTextOption({
          value: openaiKey,
          interactive,
          prompt: 'OpenAI API key',
          secret: true,
        })
      : openaiKey;
  const resolvedGeminiKey =
    embeddingProvider === 'gemini'
      ? await resolveTextOption({
          value: geminiKey,
          interactive,
          prompt: 'Gemini API key',
          secret: true,
        })
      : geminiKey;

  const embeddingDimensions = getEmbeddingDimensions(
    embeddingProvider,
    embeddingModel,
    resolvedDimensions ? Number(resolvedDimensions) : explicitDimensions,
  );

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
      apiKey: resolvedOpenAiKey
    },
    gemini: {
      apiKey: resolvedGeminiKey
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
    if (interactive) {
      p.note(errors.join('\n'), 'Missing configuration');
    } else {
      console.log('Configuration incomplete. Missing:', errors.join(', '));
    }
  }

  if (qdrantUrl && qdrantKey) {
    const spinner = interactive ? p.spinner() : null;
    if (spinner) spinner.start('Creating Qdrant collection');
    else console.log('\nCreating Qdrant collection...');
    try {
      const qdrant = new QdrantCodeIndex(qdrantUrl, qdrantKey, collectionName);
      await qdrant.ensureCollection(embeddingDimensions);
      if (spinner) spinner.stop(`Collection "${collectionName}" ready`);
      else console.log(`Collection "${collectionName}" ready`);
    } catch (error: any) {
      if (spinner) spinner.stop(`Could not create collection: ${error.message}`, 1);
      else console.log(`Could not create collection: ${error.message}`);
    }
  }

  saveConfig(configPath, config);
  if (interactive) {
    p.note(configPath, 'Config written');
  } else {
    console.log(`Wrote config to ${configPath}`);
  }

  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.saturday.config.json')) {
      fs.appendFileSync(gitignorePath, '\n# Saturday\n.saturday.config.json\n');
      if (!interactive) console.log('Updated .gitignore');
    }
  } else {
    fs.writeFileSync(gitignorePath, '# Saturday\n.saturday.config.json\n');
    if (!interactive) console.log('Created .gitignore');
  }

  if (interactive) {
    p.note('1. saturday sync\n2. saturday serve', 'Next steps');
    p.outro('Saturday is ready.');
  } else {
    console.log('\nSaturday initialized successfully!');
    console.log('\nNext steps:');
    console.log(' 1. Run `saturday sync` to index your codebase');
    console.log(' 2. Run `saturday serve` to start the voice UI');
  }
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

async function resolveTextOption(options: {
  value: string;
  interactive: boolean;
  prompt: string;
  placeholder?: string;
  secret?: boolean;
}): Promise<string> {
  if (options.value) return options.value;
  if (!options.interactive) return '';

  const answer = options.secret
    ? await p.password({ message: options.prompt })
    : await p.text({ message: options.prompt, placeholder: options.placeholder });
  return unwrapPromptValue(answer);
}

async function resolveOptionalTextOption(options: {
  value?: string;
  interactive: boolean;
  prompt: string;
  placeholder?: string;
  secret?: boolean;
}): Promise<string> {
  if (options.value) return options.value;
  if (!options.interactive) return '';

  const answer = options.secret
    ? await p.password({ message: options.prompt })
    : await p.text({ message: options.prompt, placeholder: options.placeholder });
  return unwrapPromptValue(answer);
}

async function resolveSelectOption<T extends string>(options: {
  value: T;
  interactive: boolean;
  prompt: string;
  options: Array<{ value: T; label: string }>;
}): Promise<T> {
  if (options.value) return options.value;
  if (!options.interactive) return options.options[0].value;

  const answer = await p.select({
    message: options.prompt,
    options: options.options,
  });
  return unwrapPromptValue(answer) as T;
}

function unwrapPromptValue<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Initialization cancelled.');
    process.exit(0);
  }
  return value;
}
