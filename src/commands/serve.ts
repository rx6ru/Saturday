import { Command } from 'commander';
import * as p from '@clack/prompts';
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
    .option('--phone', 'Create a free Vapi inbound phone number')
    .option('--area-code <code>', 'US area code to use when creating a Vapi number', '415')
    .addHelpText(
      'after',
      `
Examples:
  satur-day serve
  satur-day serve --port 4010

Notes:
  If the ngrok binary is missing, Saturday can fall back to the official ngrok SDK.
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
  phone?: boolean;
  areaCode?: string;
}

export async function runServe(options: ServeOptions): Promise<void> {
  const configPath = path.resolve(process.cwd(), options.config || '.saturday.config.json');
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (!fs.existsSync(configPath)) {
    throw new Error('Config not found. Run `satur-day init` first.');
  }

  const config: Config = loadConfig(configPath);
  const port = parseInt(options.port || '', 10) || config.server?.port || 3000;
  const host = config.server?.host || '127.0.0.1';
  const phoneOptions = await resolvePhoneOptions(options, interactive, config);
  config.server = {
    port,
    host,
  };

  if (interactive) {
    p.intro('Saturday serve');
  } else {
    console.log('Starting Saturday server...');
  }
  const server = await startServer(config, { configPath });
  installSignalHandlers(server);
  if (interactive) {
    p.log.step(`Local server: http://${host}:${port}`);
  } else {
    console.log(`Local server: http://${host}:${port}`);
  }

  const spinner = interactive ? p.spinner() : null;
  if (spinner) spinner.start('Starting ngrok tunnel');
  else console.log('Starting ngrok tunnel...');
  const ngrokUrl = await startNgrok({
    port,
    interactive,
    config,
  });
  if (spinner) spinner.stop(`Public URL: ${ngrokUrl}`);
  else console.log(`Public URL: ${ngrokUrl}`);

  if (spinner) spinner.start('Creating Vapi assistant');
  else console.log('Creating Vapi assistant...');
  const vapi = new VapiService(config.vapi.privateKey);

  const toolId = await vapi.createSearchTool(`${ngrokUrl}/api/search`);
  if (!interactive) console.log(`Created tool: ${toolId}`);

  const assistantId = await vapi.createAssistant({
    name: 'Saturday',
    modelProvider: config.assistant?.model.provider || 'openai',
    model: config.assistant?.model.model || 'gpt-4o',
    modelUrl: config.assistant?.model.url,
    providerApiKey: config.assistant?.model.apiKey,
    toolId,
    systemPrompt:
      'You are Saturday, a voice assistant for navigating code. Use the search_codebase tool whenever the user asks about code, architecture, modules, functions, or errors. Cite file paths in your answer.',
  });
  if (spinner) spinner.stop(`Assistant ready: ${assistantId}`);
  else console.log(`Created assistant: ${assistantId}`);

  config.vapi.assistantId = assistantId;
  saveConfig(configPath, config);

  let phoneSummary = '';
  if (phoneOptions.enabled) {
    if (spinner) spinner.start('Creating Vapi phone number');
    else console.log('Creating Vapi phone number...');
    const phoneNumber = await vapi.createPhoneNumber({
      areaCode: phoneOptions.areaCode,
      assistantId,
      name: 'Saturday inbound',
    });
    phoneSummary = phoneNumber.number || phoneNumber.sipUri || '';
    config.vapi.phoneNumberId = phoneNumber.id;
    config.vapi.phoneNumber = phoneNumber.number || null;
    config.vapi.sipUri = phoneNumber.sipUri || null;
    if (spinner) spinner.stop(phoneSummary ? `Phone ready: ${phoneSummary}` : `Phone created: ${phoneNumber.id}`);
    else console.log(`Phone ready: ${phoneSummary || phoneNumber.id}`);
  }

  saveConfig(configPath, config);

  if (interactive) {
    p.note(
      `${host}:${port}\n${ngrokUrl}${phoneSummary ? `\n${phoneSummary}` : ''}`,
      'Endpoints',
    );
    p.outro('Saturday is ready.');
  } else {
    console.log('Saturday ready.');
    console.log(`Open ${ngrokUrl} in your browser.`);
    if (phoneSummary) {
      console.log(`Call ${phoneSummary} to talk to the assistant.`);
    }
  }
}

function installSignalHandlers(server: import('http').Server): void {
  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function resolvePhoneOptions(
  options: ServeOptions,
  interactive: boolean,
  config: Config,
): Promise<{ enabled: boolean; areaCode: string }> {
  if (options.phone !== undefined) {
    return {
      enabled: Boolean(options.phone),
      areaCode: options.areaCode || '415',
    };
  }

  if (!interactive) {
    return { enabled: false, areaCode: options.areaCode || '415' };
  }

  if (config.vapi.phoneNumber || config.vapi.sipUri) {
    return { enabled: false, areaCode: options.areaCode || '415' };
  }

  const shouldCreate = await p.confirm({
    message: 'Create a Vapi phone number for inbound calls?',
    initialValue: false,
  });
  if (p.isCancel(shouldCreate)) {
    p.cancel('Serve cancelled.');
    process.exit(0);
  }
  if (!shouldCreate) {
    return { enabled: false, areaCode: options.areaCode || '415' };
  }

  const areaCode = await p.text({
    message: 'US area code',
    initialValue: options.areaCode || '415',
    placeholder: '415',
  });
  if (p.isCancel(areaCode)) {
    p.cancel('Serve cancelled.');
    process.exit(0);
  }

  return {
    enabled: true,
    areaCode: areaCode || options.areaCode || '415',
  };
}

async function startNgrok(options: { port: number; interactive: boolean; config: Config }): Promise<string> {
  return new Promise((resolve, reject) => {
    const ngrok = spawn('ngrok', ['http', options.port.toString()]);

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
      if (/ENOENT/.test(error.message || '')) {
        startNgrokViaSdk(options)
          .then(resolve)
          .catch(reject);
        return;
      }
      reject(new Error(`ngrok failed: ${error.message}.`));
    });
  });
}

async function startNgrokViaSdk(options: { port: number; interactive: boolean; config: Config }): Promise<string> {
  const ngrokToken =
    options.config.ngrok?.authtoken ||
    process.env.NGROK_AUTHTOKEN ||
    (options.interactive ? await promptForNgrokToken() : '');

  if (!ngrokToken) {
    throw new Error('ngrok is not installed and no ngrok auth token is configured. Install ngrok or provide NGROK_AUTHTOKEN.');
  }

  const ngrok = require('@ngrok/ngrok');
  const listener = await ngrok.forward({
    addr: options.port,
    authtoken: ngrokToken,
  });

  return listener.url();
}

async function promptForNgrokToken(): Promise<string> {
  const answer = await p.password({
    message: 'ngrok auth token',
  });

  if (p.isCancel(answer)) {
    p.cancel('Serve cancelled.');
    process.exit(0);
  }

  return answer;
}
