import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { runServe } from './serve';
import { startServer } from '../server';
import { VapiService } from '../lib/vapi-client';
import { spawn } from 'child_process';
import * as p from '@clack/prompts';

jest.mock('../server', () => ({
  startServer: jest.fn().mockResolvedValue({ close: jest.fn() }),
}));

jest.mock('../lib/vapi-client', () => ({
  VapiService: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('@clack/prompts', () => ({
  intro: jest.fn(),
  outro: jest.fn(),
  note: jest.fn(),
  confirm: jest.fn(),
  isCancel: jest.fn(() => false),
  text: jest.fn(),
  password: jest.fn(),
  spinner: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    message: jest.fn(),
  })),
  log: {
    step: jest.fn(),
  },
}));

jest.mock('@ngrok/ngrok', () => ({
  forward: jest.fn(),
}));

describe('runServe', () => {
  const originalStdinTty = process.stdin.isTTY;
  const originalStdoutTty = process.stdout.isTTY;

  beforeEach(() => {
    jest.clearAllMocks();
    (p.confirm as jest.Mock).mockResolvedValue(false);
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalStdinTty, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: originalStdoutTty, configurable: true });
  });

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

  test('can create a free Vapi phone number and surface it back to the user', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-serve-phone-'));
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
    const createPhoneNumber = jest.fn().mockResolvedValue({
      id: 'phone-1',
      number: '+14155550123',
    });
    (VapiService as unknown as jest.Mock).mockImplementation(() => ({
      createSearchTool,
      createAssistant,
      createPhoneNumber,
    }));

    const runPromise = runServe({
      config: configPath,
      port: '4321',
      phone: true,
      areaCode: '415',
    });

    process.nextTick(() => {
      stdout.emit('data', Buffer.from('Forwarding https://demo.ngrok.app -> http://localhost:4321'));
    });

    await runPromise;

    expect(createPhoneNumber).toHaveBeenCalledWith({
      areaCode: '415',
      assistantId: 'assistant-456',
      name: 'Saturday inbound',
    });
  });

  test('prompts interactively for phone-number creation when no flag is given', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-serve-phone-prompt-'));
    const configPath = path.join(tempDir, '.saturday.config.json');

    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          vapi: {
            publicKey: 'public-key',
            privateKey: 'private-key',
            assistantId: null,
            phoneNumber: null,
            sipUri: null,
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

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    (p.confirm as jest.Mock).mockResolvedValue(true);
    (p.text as jest.Mock).mockResolvedValue('212');

    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    (spawn as unknown as jest.Mock).mockReturnValue({
      stdout,
      stderr,
      on: jest.fn(),
    });

    const createSearchTool = jest.fn().mockResolvedValue('tool-123');
    const createAssistant = jest.fn().mockResolvedValue('assistant-456');
    const createPhoneNumber = jest.fn().mockResolvedValue({
      id: 'phone-1',
      number: '+12125550123',
    });
    (VapiService as unknown as jest.Mock).mockImplementation(() => ({
      createSearchTool,
      createAssistant,
      createPhoneNumber,
    }));

    const runPromise = runServe({
      config: configPath,
      port: '4321',
    });

    process.nextTick(() => {
      stdout.emit('data', Buffer.from('Forwarding https://demo.ngrok.app -> http://localhost:4321'));
    });

    await runPromise;

    expect(p.confirm).toHaveBeenCalled();
    expect(p.text).toHaveBeenCalled();
    expect(createPhoneNumber).toHaveBeenCalledWith({
      areaCode: '212',
      assistantId: 'assistant-456',
      name: 'Saturday inbound',
    });
  });

  test('falls back to the ngrok SDK when the binary is missing', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-serve-sdk-'));
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
          ngrok: {
            authtoken: 'ngrok-token',
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

    const ngrokModule = require('@ngrok/ngrok');
    ngrokModule.forward.mockResolvedValue({
      url: () => 'https://sdk.ngrok.app',
    });

    (spawn as unknown as jest.Mock).mockReturnValue({
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      on: jest.fn((event, cb) => {
        if (event === 'error') {
          process.nextTick(() => cb(new Error('spawn ngrok ENOENT')));
        }
      }),
    });

    const createSearchTool = jest.fn().mockResolvedValue('tool-123');
    const createAssistant = jest.fn().mockResolvedValue('assistant-456');
    (VapiService as unknown as jest.Mock).mockImplementation(() => ({
      createSearchTool,
      createAssistant,
    }));

    await runServe({
      config: configPath,
      port: '4321',
    });

    expect(ngrokModule.forward).toHaveBeenCalledWith({
      addr: 4321,
      authtoken: 'ngrok-token',
    });
    expect(createSearchTool).toHaveBeenCalledWith('https://sdk.ngrok.app/api/search');
  });

  test('prompts for an ngrok token when the binary is missing and no token is configured', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturday-serve-sdk-prompt-'));
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

    const ngrokModule = require('@ngrok/ngrok');
    ngrokModule.forward.mockResolvedValue({
      url: () => 'https://sdk.ngrok.app',
    });

    (spawn as unknown as jest.Mock).mockReturnValue({
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      on: jest.fn((event, cb) => {
        if (event === 'error') {
          process.nextTick(() => cb(new Error('spawn ngrok ENOENT')));
        }
      }),
    });

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    (p.password as jest.Mock).mockResolvedValue('typed-ngrok-token');

    const createSearchTool = jest.fn().mockResolvedValue('tool-123');
    const createAssistant = jest.fn().mockResolvedValue('assistant-456');
    (VapiService as unknown as jest.Mock).mockImplementation(() => ({
      createSearchTool,
      createAssistant,
    }));

    await runServe({
      config: configPath,
      port: '4321',
    });

    expect(p.password).toHaveBeenCalled();
    expect(ngrokModule.forward).toHaveBeenCalledWith({
      addr: 4321,
      authtoken: 'typed-ngrok-token',
    });
  });
});
