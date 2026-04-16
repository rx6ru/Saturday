import fs from 'fs';
import os from 'os';
import path from 'path';
import { runInit } from './init';

jest.mock('../lib/qdrant-client', () => ({
  QdrantCodeIndex: jest.fn().mockImplementation(() => ({
    ensureCollection: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('runInit', () => {
  test('writes config and creates gitignore when missing', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-init-'));
    const configPath = path.join(tempDir, '.saturday.config.json');
    const gitignorePath = path.join(tempDir, '.gitignore');

    await runInit({
      vapiPublicKey: 'public-key',
      vapiPrivateKey: 'private-key',
      qdrantUrl: 'https://qdrant.example.com',
      qdrantKey: 'qdrant-key',
      qdrantCollection: 'demo-project',
      openaiKey: 'openai-key',
      configPath,
      gitignorePath,
    });

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');

    expect(config.vapi.publicKey).toBe('public-key');
    expect(config.vapi.privateKey).toBe('private-key');
    expect(config.qdrant.collection).toBe('demo-project');
    expect(gitignore).toContain('.saturday.config.json');
  });

  test('writes assistant and Gemini embedding provider settings', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-init-providers-'));
    const configPath = path.join(tempDir, '.saturday.config.json');
    const gitignorePath = path.join(tempDir, '.gitignore');

    await runInit({
      vapiPublicKey: 'public-key',
      vapiPrivateKey: 'private-key',
      qdrantUrl: 'https://qdrant.example.com',
      qdrantKey: 'qdrant-key',
      qdrantCollection: 'demo-project',
      assistantModelProvider: 'cerebras',
      assistantModel: 'gpt-oss-120b',
      assistantProviderApiKey: 'cerebras-key',
      embeddingProvider: 'gemini',
      embeddingModel: 'gemini-embedding-001',
      embeddingDimensions: '768',
      geminiKey: 'gemini-key',
      configPath,
      gitignorePath,
    });

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(config.assistant.model.provider).toBe('cerebras');
    expect(config.assistant.model.model).toBe('gpt-oss-120b');
    expect(config.assistant.model.apiKey).toBe('cerebras-key');
    expect(config.embedding.provider).toBe('gemini');
    expect(config.embedding.model).toBe('gemini-embedding-001');
    expect(config.embedding.dimensions).toBe(768);
    expect(config.gemini.apiKey).toBe('gemini-key');
  });
});
