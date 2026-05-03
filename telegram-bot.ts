import { runAgent, buildSystemPrompt } from './agent-core.ts';
import { boot } from './boot/index.ts';
import { watchTurn } from './memory/watcher.ts';
import { captureMissingPrimitiveAnswer } from './memory/index.ts';
import { startScheduler } from './scheduler.ts';

const REQUEST_TIMEOUT_MS = 45_000;

function chunkText(text, limit = 4096) {
  if (text.length <= limit) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + limit, text.length);
    if (end < text.length) {
      const split = text.lastIndexOf('\n', end);
      if (split > start + 100) {
        end = split + 1;
      }
    }

    chunks.push(text.slice(start, end));
    start = end;
  }

  return chunks;
}

function describeError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;
  if (cause && typeof cause === 'object') {
    const parts = [];
    if (typeof cause.code === 'string') parts.push(cause.code);
    if (typeof cause.message === 'string') parts.push(cause.message);
    if (parts.length > 0) {
      return `${error.message} (${parts.join(': ')})`;
    }
  }

  return error.message;
}

async function telegramRequest(token, method, body, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telegram API ${method} failed (${response.status}): ${text}`);
    }

    return response.json();
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? `Telegram API ${method} timed out after ${timeoutMs}ms`
      : `Telegram API ${method} request failed: ${describeError(error)}`;
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

class TelegramBot {
  constructor(config) {
    this.config = config;
    this.histories = new Map();
    this.lastChatId = null;
  }

  async historyFor(chatId) {
    if (!this.histories.has(chatId)) {
      const bootSections = await boot();
      this.histories.set(chatId, [{ role: 'system', content: buildSystemPrompt(bootSections) }]);
    }

    return this.histories.get(chatId);
  }

  async reply(chatId, text) {
    for (const chunk of chunkText(text || '(no response)')) {
      await telegramRequest(this.config.telegramBotToken, 'sendMessage', {
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true,
      });
    }
  }

  async sendTyping(chatId) {
    await telegramRequest(this.config.telegramBotToken, 'sendChatAction', {
      chat_id: chatId,
      action: 'typing',
    });
  }

  async start(chatId) {
    await this.sendTyping(chatId);
    await this.reply(chatId, 'Hey! Send me a message.');
  }

  async reset(chatId) {
    const bootSections = await boot();
    this.histories.set(chatId, [{ role: 'system', content: buildSystemPrompt(bootSections) }]);
    await this.reply(chatId, 'Conversation reset.');
  }

  async handleText(chatId, text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return;
    }

    await this.sendTyping(chatId);
    const history = await this.historyFor(chatId);
    captureMissingPrimitiveAnswer(trimmed);
    history.push({ role: 'user', content: trimmed });

    const reply = await runAgent(history, this.config);
    history.push({ role: 'assistant', content: reply });
    watchTurn(trimmed, reply, this.config);
    await this.reply(chatId, reply);
  }

  async processUpdate(update) {
    const message = update.message;
    if (!message || typeof message.text !== 'string') {
      return;
    }

    const chatId = message.chat?.id;
    if (chatId == null) {
      return;
    }

    const text = message.text.trim();
    if (text.startsWith('/start')) {
      await this.start(chatId);
      return;
    }

    if (text.startsWith('/reset')) {
      await this.reset(chatId);
      return;
    }

    if (text.startsWith('/')) {
      return;
    }

    this.lastChatId = chatId;
    await this.handleText(chatId, text);
  }

  async run() {
    const token = this.config.telegramBotToken;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set.');
    }

    await telegramRequest(token, 'deleteWebhook', {
      drop_pending_updates: true,
    });

    startScheduler(async (text) => {
      if (this.lastChatId) await this.reply(this.lastChatId, text);
    }, this.config);

    console.log('Telegram bot is running. Press Ctrl+C to stop.');
    let offset = 0;
    let backoffMs = 2000;

    for (;;) {
      try {
        const response = await telegramRequest(token, 'getUpdates', {
          offset,
          timeout: 30,
          allowed_updates: ['message'],
        });

        const updates = Array.isArray(response.result) ? response.result : [];
        backoffMs = 2000;
        for (const update of updates) {
          offset = Math.max(offset, (update.update_id || 0) + 1);
          await this.processUpdate(update);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Telegram polling error: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 30_000);
      }
    }
  }
}

export async function runTelegramBot(config) {
  if (!config.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  }

  await new TelegramBot(config).run();
}
