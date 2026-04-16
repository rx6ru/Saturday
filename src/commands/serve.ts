import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { loadConfig, saveConfig, Config } from '../lib/config';
import { VapiService } from '../lib/vapi-client';
import { startServer } from '../server';

export function serveCommand(program: Command) {
  program
    .command('serve')
    .description('Start voice UI server')
    .option('--config <path>', 'Config file path', '.saturday.config.json')
    .option('--port <port>', 'Server port', '3000')
    .addHelpText(
      'after',
      `
Examples:
  saturday serve
  saturday serve --port 4010

Notes:
  ngrok must be installed and available on PATH.
`,
    )
    .action(async (options) => {
      try {
        await runServe(options);
      } catch (error: any) {
        console.error('Serve failed:', error.message);
        process.exit(1);
      }
    });
}

export interface ServeOptions {
  config?: string;
  port?: string;
}

export async function runServe(options: ServeOptions): Promise<void> {
  const configPath = path.resolve(process.cwd(), options.config || '.saturday.config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error('Config not found. Run `saturday init` first.');
  }

  const config: Config = loadConfig(configPath);
  const port = parseInt(options.port || '', 10) || config.server?.port || 3000;
  const host = config.server?.host || '127.0.0.1';
  config.server = {
    port,
    host,
  };

  console.log('Starting Saturday server...');
  await startServer(config, { configPath });
  console.log(`Local server: http://${host}:${port}`);

  console.log('Starting ngrok tunnel...');
  const ngrokUrl = await startNgrok(port);
  console.log(`Public URL: ${ngrokUrl}`);

  console.log('Creating Vapi assistant...');
  const vapi = new VapiService(config.vapi.privateKey);

  const toolId = await vapi.createSearchTool(`${ngrokUrl}/api/search`);
  console.log(`Created tool: ${toolId}`);

  const assistantId = await vapi.createAssistant({
    name: 'Saturday',
    modelProvider: config.assistant?.model.provider || 'openai',
    model: config.assistant?.model.model || 'gpt-4o',
    modelUrl: config.assistant?.model.url,
    providerApiKey: config.assistant?.model.apiKey,
    voiceId: 'Harry',
    toolId,
    systemPrompt:
      'You are Saturday, a voice assistant for navigating code. Use the search_codebase tool whenever the user asks about code, architecture, modules, functions, or errors. Cite file paths in your answer.',
  });
  console.log(`Created assistant: ${assistantId}`);

  config.vapi.assistantId = assistantId;
  saveConfig(configPath, config);

  console.log('Saturday ready.');
  console.log(`Open ${ngrokUrl} in your browser.`);
}

async function startNgrok(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const ngrok = spawn('ngrok', ['http', port.toString()]);

    let output = '';
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        reject(new Error('ngrok timeout'));
      }
    }, 10000);

    ngrok.stdout?.on('data', (data) => {
      output += data.toString();
      if (!resolved && output.includes('https://')) {
        const match = output.match(/https:\/\/[^\s]+/);
        if (match) {
          resolved = true;
          clearTimeout(timeout);
          resolve(match[0]);
        }
      }
    });

    ngrok.stderr?.on('data', (data) => {
      console.error('ngrok:', data.toString());
    });

    ngrok.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`ngrok failed: ${error.message}. Make sure ngrok is installed.`));
    });
  });
}
