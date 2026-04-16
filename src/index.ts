#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { syncCommand } from './commands/sync';
import { serveCommand } from './commands/serve';

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('satur-day')
    .description('Talk to your codebase through voice')
    .version('1.1.0');

  const originalHelpInformation = program.helpInformation.bind(program);
  program.helpInformation = () =>
    `${originalHelpInformation()}
Examples:
  satur-day init --qdrant-url <url> --qdrant-key <key> --openai-key <key>
  satur-day sync
  satur-day serve
`;

  initCommand(program);
  syncCommand(program);
  serveCommand(program);

  return program;
}

const program = buildProgram();

if (require.main === module) {
  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}
