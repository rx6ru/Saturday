import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { runServe } from './serve';
import { startServer } from '../server';
import { VapiService } from '../lib/vapi-client';
import { spawn } from 'child_process';

jest.mock('../server', () => ({
  startServer: jest.fn().mockResolvedValue({ close: jest.fn() }),
}));

jest.mock('../lib/vapi-client', () => ({
  VapiService: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

describe('runServe', () => {
  test('starts server, provisions Vapi, and saves assistant id', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-serve-'));
    const configPath = path.join(tempDir, '.saturday.config.json');

    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          vapi: {
            publicKey: 'public-key',
            privateKey: 'private-key',
            assistantId: null,
          },
          assistant: {
            model: {
              provider: 'openai',
              model: 'gpt-4o',
            },
          },
          qdrant: {
            url: 'https://qdrant.example.com',
            apiKey: 'qdrant-key',
            collection: 'demo-project',
          },
          embedding: {
            provider: 'openai',
            model: 'text-embedding-3-small',
            dimensions: 1536,
          },
          openai: {
            apiKey: 'openai-key',
          },
          server: {
            port: 3000,
            host: '127.0.0.1',
          },
        },
        null,
        2,
      ),
    );

    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    (spawn as unknown as jest.Mock).mockReturnValue({
      stdout,
      stderr,
      on: jest.fn(),
    });

    const createSearchTool = jest.fn().mockResolvedValue('tool-123');
    const createAssistant = jest.fn().mockResolvedValue('assistant-456');
    (VapiService as unknown as jest.Mock).mockImplementation(() => ({
      createSearchTool,
      createAssistant,
    }));

    const runPromise = runServe({
      config: configPath,
      port: '4321',
    });

    process.nextTick(() => {
      stdout.emit('data', Buffer.from('Forwarding https://demo.ngrok.app -> http://localhost:4321'));
    });

    await runPromise;

    const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(startServer).toHaveBeenCalled();
    expect(createSearchTool).toHaveBeenCalledWith('https://demo.ngrok.app/api/search');
    expect(createAssistant).toHaveBeenCalled();
    expect(savedConfig.vapi.assistantId).toBe('assistant-456');
  });
});
