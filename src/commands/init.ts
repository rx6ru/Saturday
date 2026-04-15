import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { QdrantCodeIndex } from '../lib/qdrant-client';
import { loadConfig, saveConfig, validateConfig, getDefaultConfig, Config } from '../lib/config';

export function initCommand(program: Command) {
  program
    .command('init')
    .description('Initialize Voice Coach configuration')
    .option('--vapi-public-key <key>', 'Vapi public API key')
    .option('--vapi-private-key <key>', 'Vapi private API key')
    .option('--qdrant-url <url>', 'Qdrant cluster URL')
    .option('--qdrant-key <key>', 'Qdrant API key')
    .option('--qdrant-collection <name>', 'Qdrant collection name')
    .option('--openai-key <key>', 'OpenAI API key')
    .option('--embedding-model <model>', 'Embedding model', 'text-embedding-3-small')
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
  embeddingModel?: string;
  configPath?: string;
  gitignorePath?: string;
}

export async function runInit(options: InitOptions): Promise<void> {
  const configPath = options.configPath || path.join(process.cwd(), '.voicecoach.config.json');
  const gitignorePath = options.gitignorePath || path.join(process.cwd(), '.gitignore');

  console.log('🎤 Voice Coach Setup\n');

  if (fs.existsSync(configPath)) {
    console.log('Config already exists. Overwrite with --force or delete first.');
    return;
  }

  const vapiPublicKey = options.vapiPublicKey || process.env.VAPI_PUBLIC_KEY || '';
  const vapiPrivateKey = options.vapiPrivateKey || process.env.VAPI_PRIVATE_KEY || '';
  const qdrantUrl = options.qdrantUrl || process.env.QDRANT_URL || '';
  const qdrantKey = options.qdrantKey || process.env.QDRANT_KEY || '';
  const collectionName = options.qdrantCollection || path.basename(process.cwd());
  const openaiKey = options.openaiKey || process.env.OPENAI_API_KEY || '';
  const embeddingModel = options.embeddingModel || 'text-embedding-3-small';

  const embeddingDimensions = embeddingModel === 'text-embedding-3-large' ? 3072 : 1536;

  const config: Config = {
    vapi: {
      publicKey: vapiPublicKey,
      privateKey: vapiPrivateKey,
      assistantId: null
    },
    qdrant: {
      url: qdrantUrl,
      apiKey: qdrantKey,
      collection: collectionName
    },
    embedding: {
      provider: 'openai',
      model: embeddingModel,
      dimensions: embeddingDimensions
    },
    openai: {
      apiKey: openaiKey
    },
    indexing: {
      include: ['src', 'lib'],
      exclude: ['node_modules', '.git', 'dist', 'build'],
      extensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.md']
    },
    server: {
      port: 3000,
      host: 'localhost'
    }
  };

  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.log('Configuration incomplete. Missing:', errors.join(', '));
  }

  if (qdrantUrl && qdrantKey) {
    console.log('\n📦 Creating Qdrant collection...');
    try {
      const qdrant = new QdrantCodeIndex(qdrantUrl, qdrantKey, collectionName);
      await qdrant.ensureCollection(embeddingDimensions);
      console.log(`✓ Collection "${collectionName}" ready`);
    } catch (error: any) {
      console.log(`⚠ Could not create collection: ${error.message}`);
    }
  }

  saveConfig(configPath, config);
  console.log(`✓ Wrote config to ${configPath}`);

  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.voicecoach.config.json')) {
      fs.appendFileSync(gitignorePath, '\n# Voice Coach\n.voicecoach.config.json\n');
      console.log('✓ Updated .gitignore');
    }
  }

  console.log('\n✅ Voice Coach initialized successfully!');
  console.log('\nNext steps:');
  console.log(' 1. Run `voice-coach sync` to index your codebase');
  console.log(' 2. Run `voice-coach serve` to start the voice UI');
}
