import { Command } from 'commander';
import * as p from '@clack/prompts';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { QdrantCodeIndex, CodeChunkPayload, buildChunkKey, toQdrantPointId } from '../lib/qdrant-client';
import { EmbeddingService } from '../lib/embedding';
import { FileChunker, Chunk } from '../lib/chunker';
import { loadConfig, Config } from '../lib/config';

export function syncCommand(program: Command) {
  program
    .command('sync')
    .description('Sync codebase to Qdrant')
    .option('--config <path>', 'Config file path', '.saturday.config.json')
    .option('--full', 'Force full sync')
    .addHelpText(
      'after',
      `
Examples:
  satur-day sync
  satur-day sync --full
`,
    )
    .action(async (options) => {
      try {
        await runSync(options);
      } catch (error: any) {
        console.error('Sync failed:', error.message);
        process.exit(1);
      }
    });
}

export interface SyncOptions {
  config?: string;
  full?: boolean;
}

export async function runSync(options: SyncOptions): Promise<void> {
  const configPath = path.resolve(process.cwd(), options.config || '.saturday.config.json');
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (!fs.existsSync(configPath)) {
    throw new Error('Config not found. Run `satur-day init` first.');
  }

  const config: Config = loadConfig(configPath);

  if (interactive) {
    p.intro('Saturday sync');
  } else {
    console.log('Syncing codebase to Qdrant...\n');
  }

  const qdrant = new QdrantCodeIndex(
    config.qdrant.url,
    config.qdrant.apiKey,
    config.qdrant.collection
  );

  const embeddingConfig = config.embedding || {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
  };
  const embeddingApiKey =
    embeddingConfig.provider === 'gemini'
      ? config.gemini?.apiKey || ''
      : config.openai?.apiKey || '';
  const embedding = new EmbeddingService({
    ...embeddingConfig,
    apiKey: embeddingApiKey,
  });
  const chunker = new FileChunker(50, 10);

  const indexing = config.indexing || { include: ['src'], exclude: [], extensions: ['.ts', '.js'] };

  if (!interactive) console.log('Scanning files...');
  const patterns = indexing.include.map((dir: string) => `${dir}/**/*`);
  const files = await fg(patterns, {
    cwd: process.cwd(),
    ignore: indexing.exclude,
    absolute: true,
    onlyFiles: true
  });

  const filteredFiles = files.filter((file: string) => {
    const ext = path.extname(file);
    return indexing.extensions.includes(ext);
  });

  if (interactive) {
    p.log.step(`Found ${filteredFiles.length} files to process`);
  } else {
    console.log(`Found ${filteredFiles.length} files to process`);
  }

  if (!interactive) console.log('Chunking files...');
  const allChunks: Chunk[] = [];

  for (const file of filteredFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const chunks = chunker.chunk(content, path.relative(process.cwd(), file));
    allChunks.push(...chunks);
  }

  if (interactive) {
    p.log.step(`Created ${allChunks.length} chunks`);
  } else {
    console.log(`Created ${allChunks.length} chunks`);
  }

  if (!interactive) console.log('Comparing with existing data...');
  const existingHashes = await qdrant.getExistingHashes();

  const newChunks: Chunk[] = [];
  const updatedChunks: Chunk[] = [];
  const unchangedCount = { value: 0 };

  for (const chunk of allChunks) {
    const key = buildChunkKey({
      filePath: chunk.filePath,
      functionName: chunk.functionName || null,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
    });
    const existing = existingHashes.get(key);

    if (!existing) {
      newChunks.push(chunk);
    } else if (existing.hash !== chunk.hash) {
      chunk.id = existing.id;
      updatedChunks.push(chunk);
    } else {
      unchangedCount.value++;
    }
  }

  const currentKeys = new Set(
    allChunks.map((chunk: Chunk) =>
      buildChunkKey({
        filePath: chunk.filePath,
        functionName: chunk.functionName || null,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      }),
    ),
  );
  const deletedFiles: string[] = [];

  for (const key of existingHashes.keys()) {
    if (!currentKeys.has(key)) {
      deletedFiles.push(key.split(':')[0]);
    }
  }

  const summary = `New: ${newChunks.length}\nUpdated: ${updatedChunks.length}\nUnchanged: ${unchangedCount.value}\nDeleted: ${deletedFiles.length}`;
  if (interactive) {
    p.note(summary, 'Change summary');
  } else {
    console.log(`New: ${newChunks.length}`);
    console.log(`Updated: ${updatedChunks.length}`);
    console.log(`Unchanged: ${unchangedCount.value}`);
    console.log(`Deleted: ${deletedFiles.length}`);
  }

  if (deletedFiles.length > 0) {
    if (!interactive) console.log('\nRemoving deleted files...');
    const uniqueDeleted = [...new Set(deletedFiles)];
    for (const filePath of uniqueDeleted) {
      await qdrant.deleteByPath(filePath);
    }
    if (!interactive) console.log(`Removed ${uniqueDeleted.length} deleted file(s)`);
  }

  const toUpsert = [...newChunks, ...updatedChunks];

  if (toUpsert.length > 0) {
    const spinner = interactive ? p.spinner() : null;
    if (spinner) spinner.start('Generating embeddings');
    else console.log('\nGenerating embeddings...');
    const embeddings = await embedding.embedBatch(
      toUpsert.map((c: Chunk) => c.content),
      100,
      'RETRIEVAL_DOCUMENT',
    );

    if (spinner) spinner.message('Uploading to Qdrant');
    else console.log('\nUploading to Qdrant...');
    const points = toUpsert.map((chunk: Chunk, idx: number) => {
      const chunkKey = buildChunkKey({
        filePath: chunk.filePath,
        functionName: chunk.functionName || null,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      });

      return {
        id: chunk.id && /^[0-9a-f-]{36}$/i.test(chunk.id) ? chunk.id : toQdrantPointId(chunkKey),
        vector: embeddings[idx],
        payload: {
          filePath: chunk.filePath,
          chunkHash: chunk.hash,
          language: chunk.language,
          functionName: chunk.functionName || null,
          chunkKey,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          lastSynced: Date.now()
        } as CodeChunkPayload
      };
    });
    await qdrant.upsertBatch(points);
    if (spinner) spinner.stop('Upload complete');
  }

  if (interactive) {
    p.outro(
      `${allChunks.length} chunks indexed. ${newChunks.length} new, ${updatedChunks.length} updated, ${unchangedCount.value} unchanged.`,
    );
  } else {
    console.log('\nSync complete!');
    console.log(`${allChunks.length} total chunks indexed`);
    console.log(`${newChunks.length} new, ${updatedChunks.length} updated, ${unchangedCount.value} unchanged`);
  }
}
