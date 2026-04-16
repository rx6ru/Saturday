import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { QdrantCodeIndex } from '../lib/qdrant-client';
import { loadConfig, saveConfig, validateConfig, Config } from '../lib/config';

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
    .option('--embedding-model <model>', 'Embedding model', 'text-embedding-3-small')
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
  embeddingModel?: string;
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
