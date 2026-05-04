import process from 'node:process';

import { Config } from './config.ts';
import { runTui } from './tui.ts';
import { runTelegramBot } from './telegram-bot.ts';
import { captureMissingPrimitiveAnswer, nextPrimitiveReminder } from './memory/index.ts';

async function runCli() {
  const config = new Config();
  if (process.stdin.isTTY && process.stdout.isTTY) {
    await runTui(config);
    return;
  }

  console.log('');
  console.log('doo');
  console.log(`provider: ${config.provider}`);
  console.log(`model: ${config.model}`);
  console.log(`host:  ${config.ollamaHost}`);
  console.log('type exit or quit to leave');
  console.log('');

  const readline = await import('node:readline/promises');
  const { buildSystemPrompt, runAgent } = await import('./agent-core.ts');
  const { boot } = await import('./boot/index.ts');
  const { watchTurn } = await import('./memory/watcher.ts');
  const { startScheduler } = await import('./scheduler.ts');

  const bootSections = await boot();
  startScheduler((text) => { console.log('\n[scheduled]\n' + text + '\n---\n'); }, config);
  const history = [{ role: 'system', content: buildSystemPrompt(bootSections) }];
  const sessionKey = 'cli';
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    for (;;) {
      let userInput;
      try {
        userInput = (await rl.question('You > ')).trim();
      } catch {
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

      captureMissingPrimitiveAnswer(userInput);
      const messages = [...history];
      const reminder = nextPrimitiveReminder(sessionKey);
      if (reminder) {
        messages.push({ role: 'system', content: reminder });
      }
      messages.push({ role: 'user', content: userInput });
      const reply = await runAgent(messages, config);
      history.push({ role: 'user', content: userInput });
      history.push({ role: 'assistant', content: reply });
      watchTurn(userInput, reply, config);

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
