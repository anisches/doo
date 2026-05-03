import process from 'node:process';
import readline from 'node:readline';

import { buildSystemPrompt, runAgent } from './agent-core.ts';
import { boot } from './boot/index.ts';
import { watchTurn } from './memory/watcher.ts';
import { startScheduler } from './scheduler.ts';

type LogKind = 'system' | 'user' | 'assistant' | 'tool' | 'status' | 'scheduled';

type LogEntry = {
  kind: LogKind;
  text: string;
};

function termWidth() {
  return Math.max(60, process.stdout.columns || 80);
}

function wrapText(text: string, width = termWidth()) {
  const out: string[] = [];
  for (const paragraph of String(text || '').split('\n')) {
    if (!paragraph) {
      out.push('');
      continue;
    }

    let remaining = paragraph;
    while (remaining.length > width) {
      let cut = remaining.lastIndexOf(' ', width);
      if (cut <= 0) cut = width;
      out.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }
    out.push(remaining);
  }
  return out;
}

function truncateLines(lines: string[], maxLines: number) {
  if (lines.length <= maxLines) return lines;
  return ['…', ...lines.slice(lines.length - (maxLines - 1))];
}

function keyOf(entry: LogEntry) {
  return `[${entry.kind}] ${entry.text}`;
}

export async function runTui(config: { model: string; ollamaHost: string; ollamaApiKey?: string | null }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('TUI requires an interactive terminal.');
  }

  const bootSections = await boot();
  const history = [{ role: 'system', content: buildSystemPrompt(bootSections) }];
  const logs: LogEntry[] = [];
  const input = { value: '' };
  const state = { busy: false, status: 'idle', exit: false };

  const pushLog = (kind: LogKind, text: string) => {
    logs.push({ kind, text });
    if (logs.length > 200) logs.splice(0, logs.length - 200);
  };

  const render = () => {
    const width = termWidth();
    const height = Math.max(12, process.stdout.rows || 24);
    const usableLines = height - 7;
    const flattened = logs.flatMap((entry) => wrapText(keyOf(entry), width));
    const visible = truncateLines(flattened, usableLines);

    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(`doo\n`);
    process.stdout.write(`model: ${config.model} | host: ${config.ollamaHost} | status: ${state.status}\n`);
    process.stdout.write(`Ctrl+C exit | Enter send | Ctrl+L redraw | Ctrl+U clear\n`);
    process.stdout.write(`\n`);
    for (const line of visible) {
      process.stdout.write(`${line}\n`);
    }
    const prompt = `> ${input.value}`;
    process.stdout.write(`\n${prompt}\n`);
  };

  const startRawMode = () => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
  };

  const stopRawMode = () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  };

  const submit = async () => {
    const text = input.value.trim();
    if (!text || state.busy) return;
    if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit') {
      state.exit = true;
      return;
    }

    input.value = '';
    state.busy = true;
    state.status = 'thinking';
    pushLog('user', text);
    render();

    history.push({ role: 'user', content: text });
    const hooks = {
      silent: true,
      onStatus: (status: string) => {
        state.status = status;
        render();
      },
      onToolCall: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
        pushLog('tool', `-> ${name}(${JSON.stringify(args)})`);
        render();
      },
      onToolResult: ({ name, result }: { name: string; result: string }) => {
        pushLog('tool', `<- ${name}: ${String(result).slice(0, 180)}`);
        render();
      },
    };

    try {
      const reply = await runAgent(history, config, hooks);
      history.push({ role: 'assistant', content: reply });
      pushLog('assistant', reply || '(no response)');
      watchTurn(text, reply, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushLog('status', `error: ${message}`);
    } finally {
      state.busy = false;
      state.status = 'idle';
      render();
    }
  };

  const onKeypress = async (_str: string, key: readline.Key) => {
    if (key.ctrl && key.name === 'c') {
      state.exit = true;
      return;
    }
    if (key.ctrl && key.name === 'l') {
      render();
      return;
    }
    if (key.ctrl && key.name === 'u') {
      input.value = '';
      render();
      return;
    }
    if (key.name === 'backspace') {
      input.value = input.value.slice(0, -1);
      render();
      return;
    }
    if (key.name === 'return') {
      await submit();
      return;
    }
    if (typeof key.sequence === 'string' && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      input.value += key.sequence;
      render();
    }
  };

  startScheduler((text) => {
    pushLog('scheduled', text);
    render();
  }, config);

  startRawMode();
  process.stdin.on('keypress', onKeypress);
  render();

  try {
    while (!state.exit) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    process.stdin.off('keypress', onKeypress);
    stopRawMode();
    process.stdout.write('\x1b[2J\x1b[H');
  }
}
