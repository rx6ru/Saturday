import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as fg from 'fast-glob';
import { QdrantCodeIndex } from '../lib/qdrant-client';
import { EmbeddingService } from '../lib/embedding';
import { FileChunker } from '../lib/chunker';
import { loadConfig, Config } from '../lib/config';

export function syncCommand(program: Command) {
  program
    .command('sync')
    .description('Sync codebase to Qdrant')
    .option('--config <path>', 'Config file path', '.voicecoach.config.json')
    .option('--full', 'Force full sync')
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
  const configPath = path.join(process.cwd(), options.config || '.voicecoach.config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error('Config not found. Run `voice-coach init` first.');
  }

  const config: Config = loadConfig(configPath);

  console.log('🔄 Syncing codebase to Qdrant...\n');

  const qdrant = new QdrantCodeIndex(
    config.qdrant.url,
    config.qdrant.apiKey,
    config.qdrant.collection
  );

  const embedding = new EmbeddingService(config.openai.apiKey, config.embedding.model);
  const chunker = new FileChunker(50, 10);

  console.log('📁 Scanning files...');
  const patterns = config.indexing.include.map(dir => `${dir}/**/*`);
  const files = await fg(patterns, {
    cwd: process.cwd(),
    ignore: config.indexing.exclude,
    absolute: true,
    onlyFiles: true
  });

  const filteredFiles = files.filter(file => {
    const ext = path.extname(file);
    return config.indexing.extensions.includes(ext);
  });

  console.log(` Found ${filteredFiles.length} files to process`);

  console.log('📝 Chunking files...');
  const allChunks: any[] = [];

  for (const file of filteredFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const chunks = chunker.chunk(content, path.relative(process.cwd(), file));
    allChunks.push(...chunks);
  }

  console.log(` Created ${allChunks.length} chunks`);

  console.log('🔍 Comparing with existing data...');
  let existingHashes: Map<string, { id: string; hash: string }> = new Map();

  if (!options.full) {
    existingHashes = await qdrant.getExistingHashes();
  }

  const newChunks: any[] = [];
  const updatedChunks: any[] = [];
  const unchangedCount = { value: 0 };

  for (const chunk of allChunks) {
    const key = `${chunk.filePath}:${chunk.functionName || 'top-level'}`;
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

  const currentKeys = new Set(allChunks.map((c: any) => `${c.filePath}:${c.functionName || 'top-level'}`));
  const deletedFiles: string[] = [];

  for (const key of existingHashes.keys()) {
    if (!currentKeys.has(key)) {
      deletedFiles.push(key.split(':')[0]);
    }
  }

  console.log(` New: ${newChunks.length}`);
  console.log(` Updated: ${updatedChunks.length}`);
  console.log(` Unchanged: ${unchangedCount.value}`);
  console.log(` Deleted: ${deletedFiles.length}`);

  if (deletedFiles.length > 0) {
    console.log('\n🗑️ Removing deleted files...');
    const uniqueDeleted = [...new Set(deletedFiles)];
    for (const filePath of uniqueDeleted) {
      await qdrant.deleteByPath(filePath);
    }
    console.log(` Removed ${uniqueDeleted.length} deleted file(s)`);
  }

  const toUpsert = [...newChunks, ...updatedChunks];

  if (toUpsert.length > 0) {
    console.log('\n🧠 Generating embeddings...');
    const embeddings = await embedding.embedBatch(toUpsert.map((c: any) => c.content));

    console.log('\n📤 Uploading to Qdrant...');
    await qdrant.upsertBatch(
      toUpsert.map((chunk: any, idx: number) => ({
        id: chunk.id || chunk.filePath + ':' + chunk.startLine,
        vector: embeddings[idx],
        payload: {
          filePath: chunk.filePath,
          chunkHash: chunk.hash,
          language: chunk.language,
          functionName: chunk.functionName || null,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          lastSynced: Date.now()
        }
      }))
    );
  }

  console.log('\n✅ Sync complete!');
  console.log(` ${allChunks.length} total chunks indexed`);
  console.log(` ${newChunks.length} new, ${updatedChunks.length} updated, ${unchangedCount.value} unchanged`);
}
