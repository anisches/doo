import process from 'node:process';
import readline from 'node:readline';

import { buildSystemPrompt, runAgent } from './agent-core.ts';
import { boot } from './boot/index.ts';
import {
  captureMissingPrimitiveAnswer,
  getMissingPrimitives,
  loadMemoryData,
  nextPrimitiveReminder,
  resetPrimitiveReminder,
} from './memory/index.ts';
import { watchTurn } from './memory/watcher.ts';
import { startScheduler } from './scheduler.ts';
import { describeProviders, providerDisplayName } from './providers.ts';
import { renderToolCatalog } from './tools/registry.ts';

type LogKind = 'system' | 'user' | 'assistant' | 'tool' | 'status' | 'scheduled' | 'command';

type LogEntry = {
  kind: LogKind;
  text: string;
  at: number;
};

type TuiState = {
  busy: boolean;
  status: string;
  exit: boolean;
  startedAt: number;
  turnCount: number;
};

type TuiConfig = {
  provider: string;
  model: string;
  ollamaHost: string;
  ollamaApiKey?: string | null;
};

const supportsColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);

function esc(code: string) {
  return supportsColor ? `\x1b[${code}m` : '';
}

function paint(code: string, text: string) {
  if (!supportsColor) {
    return String(text);
  }

  return `${esc(code)}${text}${esc('0')}`;
}

function dim(text: string) {
  return paint('2', text);
}

function bold(text: string) {
  return paint('1', text);
}

function cyan(text: string) {
  return paint('36', text);
}

function green(text: string) {
  return paint('32', text);
}

function yellow(text: string) {
  return paint('33', text);
}

function magenta(text: string) {
  return paint('35', text);
}

function blue(text: string) {
  return paint('34', text);
}

function brightBlack(text: string) {
  return paint('90', text);
}

function termWidth() {
  return Math.max(72, process.stdout.columns || 80);
}

function termHeight() {
  return Math.max(20, process.stdout.rows || 24);
}

function padLine(text: string, width: number) {
  const value = String(text || '');
  if (value.length >= width) {
    return value.slice(0, width);
  }
  return value + ' '.repeat(width - value.length);
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
  if (lines.length <= maxLines) {
    return lines;
  }

  if (maxLines <= 1) {
    return ['...'];
  }

  return ['...', ...lines.slice(lines.length - (maxLines - 1))];
}

function stripMd(text: string) {
  return String(text || '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
}

function kindLabel(kind: LogKind, agentName: string) {
  switch (kind) {
    case 'user':
      return cyan('you');
    case 'assistant':
      return green(agentName || 'agent');
    case 'tool':
      return yellow('tool');
    case 'status':
      return blue('status');
    case 'scheduled':
      return magenta('scheduled');
    case 'command':
      return brightBlack('command');
    default:
      return brightBlack('system');
  }
}

function kindFrame(kind: LogKind) {
  switch (kind) {
    case 'user':
      return cyan('|');
    case 'assistant':
      return green('|');
    case 'tool':
      return yellow('|');
    case 'status':
      return blue('|');
    case 'scheduled':
      return magenta('|');
    case 'command':
      return brightBlack('|');
    default:
      return brightBlack('|');
  }
}

function sectionTitle(title: string) {
  return bold(title.toUpperCase());
}

function renderListSection(title: string, values: string[], width: number) {
  const lines = [sectionTitle(title)];
  if (!values.length) {
    lines.push(dim('  - none'));
    lines.push('');
    return lines;
  }

  for (const value of values) {
    for (const line of wrapText(value, Math.max(12, width - 2))) {
      lines.push(`  - ${line}`);
    }
  }
  lines.push('');
  return lines;
}

function renderKeyValueSection(title: string, entries: Array<[string, string]>, width: number) {
  const lines = [sectionTitle(title)];
  if (!entries.length) {
    lines.push(dim('  - none'));
    lines.push('');
    return lines;
  }

  for (const [key, value] of entries) {
    const valueLines = wrapText(value, Math.max(12, width - key.length - 6));
    valueLines.forEach((line, index) => {
      if (index === 0) {
        lines.push(`  - ${key}: ${line}`);
      } else {
        lines.push(`    ${line}`);
      }
    });
  }
  lines.push('');
  return lines;
}

function memorySnapshotLines(config: TuiConfig, width: number) {
  const memory = loadMemoryData();
  const primitives = memory.primitives || {};
  const preferences = memory.preferences || {};
  const context = memory.context || {};
  const lastSeen = Array.isArray(memory.last_seen) ? memory.last_seen : [];
  const missing = getMissingPrimitives(memory);
  const agentName = primitives.agent_name || 'agent';
  const pending = missing.length ? `pending: ${missing.join(', ')}` : 'pending: none';

  return [
    sectionTitle('Session'),
    `  - provider: ${config.provider}`,
    `  - model: ${config.model}`,
    `  - host: ${config.ollamaHost}`,
    `  - agent: ${agentName}`,
    `  - ${pending}`,
    '',
    ...renderKeyValueSection(
      'Primitives',
      [
        ['user', primitives.user_name || '-'],
        ['agent', primitives.agent_name || '-'],
        ['interests', primitives.interests || '-'],
      ],
      width,
    ),
    ...renderKeyValueSection(
      'Preferences',
      Object.entries(preferences)
        .slice(0, 4)
        .map(([key, value]) => [key, String(value)] as [string, string]),
      width,
    ),
    ...renderKeyValueSection(
      'Context',
      Object.entries(context)
        .slice(0, 4)
        .map(([key, value]) => [key, String(value)] as [string, string]),
      width,
    ),
    ...renderListSection('Last seen', lastSeen.slice(0, 4), width),
  ];
}

function renderTranscriptLines(logs: LogEntry[], width: number, agentName: string) {
  const lines: string[] = [];

  if (logs.length === 0) {
    lines.push(sectionTitle('Transcript'));
    lines.push(dim('  - waiting for the first prompt'));
    lines.push(dim('  - type /help for commands'));
    lines.push('');
    return lines;
  }

  for (const entry of logs) {
    const label = kindLabel(entry.kind, agentName);
    const frame = kindFrame(entry.kind);
    const time = dim(formatTime(entry.at));
    const bubblePad = Math.max(18, width - 6);
    const bodyWidth = Math.max(18, width - 8);
    lines.push(`${frame} ${label} ${time}`);
    for (const paragraph of String(entry.text || '').split('\n')) {
      const wrapped = wrapText(paragraph, bodyWidth);
      if (wrapped.length === 0) {
        lines.push(`${frame}  `);
        continue;
      }
      for (const line of wrapped) {
        lines.push(`${frame} ${line.padEnd(bubblePad - 2, ' ')}`);
      }
    }
    lines.push('');
  }

  return lines;
}

function recentToolTrail(logs: LogEntry[]) {
  return logs
    .filter((entry) => entry.kind === 'tool')
    .slice(-4)
    .map((entry) => entry.text);
}

function availableCommands() {
  return [
    '/help   show commands',
    '/clear  clear the transcript',
    '/reset  clear session state',
    '/memory show the current memory snapshot',
    '/providers show provider catalog',
    '/tools show tool catalog',
    '/exit   quit the app',
  ];
}

export async function runTui(config: TuiConfig) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('TUI requires an interactive terminal.');
  }

  process.stdout.write('\x1b[?25l');

  const bootSections = await boot();
  const systemPrompt = buildSystemPrompt(bootSections);

  const state: TuiState = {
    busy: false,
    status: 'idle',
    exit: false,
    startedAt: Date.now(),
    turnCount: 0,
  };
  const logs: LogEntry[] = [];
  const input = { value: '' };
  const userHistory: string[] = [];
  const conversation = [{ role: 'system', content: systemPrompt }];
  const sessionKey = 'tui';
  let historyIndex = -1;

  const pushLog = (kind: LogKind, text: string) => {
    logs.push({ kind, text, at: Date.now() });
    if (logs.length > 200) {
      logs.splice(0, logs.length - 200);
    }
  };

  const clearLogs = () => {
    logs.splice(0, logs.length);
  };

  const render = () => {
    const width = termWidth();
    const height = termHeight();
    const headerLines = 4;
    const footerLines = 3;
    const usableLines = Math.max(8, height - headerLines - footerLines);
    const memory = loadMemoryData();
    const primitives = memory.primitives || {};
    const agentName = primitives.agent_name || 'agent';
    const agentTitle = agentName === 'agent' ? 'doo' : agentName;
    const providerTitle = providerDisplayName(config.provider);
    const pending = getMissingPrimitives(memory);
    const statusLine = [
      `state: ${state.status}`,
      `turns: ${state.turnCount}`,
      `uptime: ${formatDuration(Date.now() - state.startedAt)}`,
      pending.length ? `missing: ${pending.join(', ')}` : 'missing: none',
    ].join(' | ');

    const transcript = renderTranscriptLines(logs, width, agentTitle);
    const left = truncateLines(transcript, usableLines);

    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(`${bold('doo')} ${dim('workspace terminal')}\n`);
    process.stdout.write(
      `${dim('provider')}: ${providerTitle} ${dim('|')} ${dim('model')}: ${config.model} ${dim('|')} ${dim('agent')}: ${agentTitle} ${dim('|')} ${dim(state.status)}\n`,
    );
    process.stdout.write(`${dim(statusLine)}\n`);
    process.stdout.write(`${'-'.repeat(Math.min(width, 120))}\n`);

    for (let i = 0; i < left.length; i += 1) {
      process.stdout.write(`${left[i]}\n`);
    }

    process.stdout.write(`${'-'.repeat(Math.min(width, 120))}\n`);
    const promptHint = state.busy
      ? dim('assistant is working')
      : dim('enter to send, /help, /providers, /tools, /memory');
    const prompt = `${cyan('you')} > ${input.value || dim('type a message')}`;
    process.stdout.write(`${prompt}\n`);
    process.stdout.write(`${promptHint}\n`);
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

  const requestExit = () => {
    state.exit = true;
  };

  const showMemorySnapshot = () => {
    const memory = loadMemoryData();
    const missing = getMissingPrimitives(memory);
    const primitives = memory.primitives || {};
    pushLog(
      'system',
      [
        `memory snapshot`,
        `user: ${primitives.user_name || '-'}`,
        `agent: ${primitives.agent_name || '-'}`,
        `interests: ${primitives.interests || '-'}`,
        `missing: ${missing.length ? missing.join(', ') : 'none'}`,
      ].join('\n'),
    );
  };

  const showProviders = () => {
    pushLog('system', describeProviders(config));
  };

  const showTools = () => {
    pushLog('system', renderToolCatalog());
  };

  const resetSession = () => {
    conversation.splice(1);
    userHistory.splice(0);
    historyIndex = -1;
    clearLogs();
    state.turnCount = 0;
    state.status = 'reset';
    resetPrimitiveReminder(sessionKey);
    pushLog('system', 'session reset; system prompt kept, turn history cleared');
  };

  const executeCommand = async (line: string) => {
    const command = line.slice(1).trim();
    const [nameRaw, ...args] = command.split(/\s+/);
    const name = (nameRaw || '').toLowerCase();
    pushLog('command', line);

    switch (name) {
      case 'help':
        pushLog('system', `commands:\n${availableCommands().join('\n')}`);
        return true;
      case 'clear':
        clearLogs();
        pushLog('system', 'transcript cleared');
        return true;
      case 'reset':
        resetSession();
        return true;
      case 'memory':
        showMemorySnapshot();
        return true;
      case 'providers':
        showProviders();
        return true;
      case 'tools':
        showTools();
        return true;
      case 'exit':
      case 'quit':
        state.exit = true;
        return true;
      case '':
        pushLog('system', 'empty command');
        return true;
      default:
        pushLog('status', `unknown command: ${name || args.join(' ')}`);
        return true;
    }
  };

  const submit = async () => {
    const text = input.value.trim();
    if (!text || state.busy) {
      return;
    }

    input.value = '';
    historyIndex = -1;

    if (text === '/exit' || text === '/quit') {
      state.exit = true;
      render();
      return;
    }

    if (text.startsWith('/')) {
      await executeCommand(text);
      render();
      return;
    }

    state.busy = true;
    state.status = 'thinking';
    state.turnCount += 1;
    pushLog('user', text);
    render();

    captureMissingPrimitiveAnswer(text);
    userHistory.push(text);
    const messages = [...conversation];
    const reminder = nextPrimitiveReminder(sessionKey);
    if (reminder) {
      messages.push({ role: 'system', content: reminder });
    }
    messages.push({ role: 'user', content: text });

    const hooks = {
      silent: true,
      onStatus: (status: string) => {
        state.status = status;
        render();
      },
      onToolCall: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
        const label = name || 'unknown';
        pushLog('tool', `-> ${label}(${JSON.stringify(args)})`);
        state.status = `tool:${label}`;
        render();
      },
      onToolResult: ({ name, result }: { name: string; result: string }) => {
        const label = name || 'unknown';
        pushLog('tool', `<- ${label}: ${String(result).slice(0, 220)}`);
        state.status = `tool:${label}:done`;
        render();
      },
      onAssistantMessage: (content: string) => {
        pushLog('assistant', stripMd(content || '(no response)'));
      },
    };

    try {
      const reply = await runAgent(messages, config, hooks);
      conversation.push({ role: 'user', content: text });
      conversation.push({ role: 'assistant', content: reply });
      watchTurn(text, reply, config);
      state.status = 'ready';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushLog('status', `error: ${message}`);
      state.status = 'error';
    } finally {
      state.busy = false;
      render();
    }
  };

  const moveHistory = (direction: 'up' | 'down') => {
    if (userHistory.length === 0) {
      return;
    }

    if (direction === 'up') {
      if (historyIndex === -1) {
        historyIndex = userHistory.length - 1;
      } else {
        historyIndex = Math.max(0, historyIndex - 1);
      }
    } else if (historyIndex !== -1) {
      historyIndex += 1;
      if (historyIndex >= userHistory.length) {
        historyIndex = -1;
        input.value = '';
        render();
        return;
      }
    }

    if (historyIndex >= 0) {
      input.value = userHistory[historyIndex] || '';
    }
    render();
  };

  const deleteWord = () => {
    const trimmed = input.value.replace(/\s+$/, '');
    const next = trimmed.replace(/[^\s]+$/, '');
    input.value = next;
    render();
  };

  const onKeypress = async (_str: string, key: readline.Key) => {
    if (key.ctrl && key.name === 'c') {
      requestExit();
      return;
    }
    if (key.sequence === '\u0003') {
      requestExit();
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
    if (key.ctrl && key.name === 'w') {
      deleteWord();
      return;
    }
    if (key.name === 'up') {
      moveHistory('up');
      return;
    }
    if (key.name === 'down') {
      moveHistory('down');
      return;
    }

    if (state.busy) {
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

  startScheduler(
    (text) => {
      pushLog('scheduled', stripMd(text));
      state.status = 'scheduled';
      render();
    },
    config,
  );

  startRawMode();
  process.stdin.on('keypress', onKeypress);
  process.once('SIGINT', requestExit);
  process.once('SIGTERM', requestExit);
  pushLog('system', 'workspace ready');
  render();

  try {
    while (!state.exit) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    process.stdin.off('keypress', onKeypress);
    process.off('SIGINT', requestExit);
    process.off('SIGTERM', requestExit);
    stopRawMode();
    process.stdout.write('\x1b[?25h');
    process.stdout.write('\x1b[2J\x1b[H');
  }
}
