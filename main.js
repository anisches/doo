import readline from 'node:readline/promises';
import process from 'node:process';

import { Config } from './config.js';
import { buildSystemPrompt, runAgent } from './agent-core.js';
import { boot } from './boot/index.js';
import { runTelegramBot } from './telegram-bot.js';

function printBanner(config) {
  console.log('');
  console.log('doo');
  console.log(`model: ${config.model}`);
  console.log(`host:  ${config.ollamaHost}`);
  console.log('type exit or quit to leave');
  console.log('');
}

async function runCli() {
  const config = new Config();
  printBanner(config);

  const bootSections = await boot();
  const history = [{ role: 'system', content: buildSystemPrompt(bootSections) }];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    for (;;) {
      let userInput;
      try {
        userInput = (await rl.question('You > ')).trim();
      } catch (error) {
        console.log('\nbye.');
        break;
      }

      if (!userInput) {
        continue;
      }

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        console.log('bye.');
        break;
      }

      history.push({ role: 'user', content: userInput });
      const reply = await runAgent(history, config);
      history.push({ role: 'assistant', content: reply });

      console.log('');
      console.log(`doo (${config.model})`);
      console.log(reply || '(no response)');
      console.log('---');
      console.log('');
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2).map((arg) => arg.toLowerCase());
  if (args.includes('telegram') || args.includes('--telegram')) {
    try {
      await runTelegramBot(new Config());
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }

  await runCli();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
