#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { syncCommand } from './commands/sync';
import { serveCommand } from './commands/serve';

const program = new Command();

program
  .name('voice-coach')
  .description('Talk to your codebase through voice')
  .version('1.0.0');

initCommand(program);
syncCommand(program);
serveCommand(program);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
