import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { loadConfig, saveConfig, Config } from '../lib/config';
import { VapiService } from '../lib/vapi-client';

export function serveCommand(program: Command) {
  program
    .command('serve')
    .description('Start voice UI server')
    .option('--config <path>', 'Config file path', '.voicecoach.config.json')
    .option('--port <port>', 'Server port', '3000')
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
  const configPath = path.join(process.cwd(), options.config || '.voicecoach.config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error('Config not found. Run `voice-coach init` first.');
  }

  const config: Config = loadConfig(configPath);
  const port = parseInt(options.port || '3000') || config.server.port;

  console.log('🚀 Starting Voice Coach server...\n');

  console.log('🌐 Starting ngrok tunnel...');
  const ngrokUrl = await startNgrok(port);
  console.log(` Public URL: ${ngrokUrl}`);

  console.log('\n🤖 Creating Vapi assistant...');
  const vapi = new VapiService(config.vapi.privateKey);

  const tool = await vapi.createSearchTool(`${ngrokUrl}/api/search`);
  console.log(` Created tool: ${tool.toolId}`);

  const assistant = await vapi.createAssistant({
    name: 'Voice Coach',
    model: 'gpt-4o',
    voiceId: 'Harry',
    toolId: tool.toolId
  });
  console.log(` Created assistant: ${assistant.id}`);

  config.vapi.assistantId = assistant.id;
  saveConfig(configPath, config);

  console.log(`\n🖥️ Starting server on port ${port}...`);
  console.log('\n✅ Voice Coach ready!');
  console.log(`\n📖 Open ${ngrokUrl} in your browser\n`);

  console.log('\nNote: For full server functionality, import and run startServer from src/server');
}

async function startNgrok(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const ngrok = spawn('ngrok', ['http', port.toString()]);

    let output = '';
    let resolved = false;

    ngrok.stdout?.on('data', (data) => {
      output += data.toString();
      if (!resolved && output.includes('https://')) {
        const match = output.match(/https:\/\/[^\s]+/);
        if (match) {
          resolved = true;
          resolve(match[0]);
        }
      }
    });

    ngrok.stderr?.on('data', (data) => {
      console.error('ngrok:', data.toString());
    });

    ngrok.on('error', (error) => {
      reject(new Error(`ngrok failed: ${error.message}. Make sure ngrok is installed.`));
    });

    setTimeout(() => {
      if (!resolved) {
        reject(new Error('ngrok timeout'));
      }
    }, 10000);
  });
}
