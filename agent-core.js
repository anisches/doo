import { setTimeout as sleep } from 'node:timers/promises';
import { Config } from './config.js';
import { TOOLS, dispatch } from './tools/registry.js';

export const SYSTEM_PROMPT = `
You are a helpful and friendly AI agent. Be conversational, clear, and a little fun. No need to be stiff.

You have tools available:
- web_search   -> use when the user needs current info, news, or anything worth looking up
- switch_model -> call when the user says "switch to X", "use X model", "change model to X"
- set_config   -> call when the user wants to store a setting, for example:
                 "set my ollama api key to sk-xxx"
                 "set ollama host to http://192.168.1.10:11434"
                 "set search_api_key to ..."

If web_search returns a message starting with MISSING_OLLAMA_API_KEY:
  1. Tell the user you need an Ollama API key to search the web.
  2. Ask them to paste it in.
  3. Once they give it, call set_config with key=ollama_api_key and their value.
  4. Then retry the search.

Use tools silently. No need to narrate them. Just get things done.
`.trim();

function apiBase(host) {
  const trimmed = host.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function makeHeaders(config) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (config.ollamaApiKey) {
    headers.Authorization = `Bearer ${config.ollamaApiKey}`;
  }

  return headers;
}

async function chat(messages, config) {
  const response = await fetch(`${apiBase(config.ollamaHost)}/chat`, {
    method: 'POST',
    headers: makeHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: TOOLS,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama chat failed (${response.status}): ${text}`);
  }

  return response.json();
}

function normalizeToolArgs(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return { value: args };
    }
  }

  return args && typeof args === 'object' ? args : {};
}

function messageToHistory(message) {
  const entry = {
    role: message.role || 'assistant',
    content: message.content || '',
  };

  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    entry.tool_calls = message.tool_calls;
  }

  return entry;
}

export async function runAgent(messages, config) {
  const runtimeConfig = config instanceof Config ? config : config;

  for (;;) {
    process.stdout.write(`\n[${runtimeConfig.model}] thinking...\r`);
    const response = await chat(messages, runtimeConfig);
    process.stdout.write('\x1b[2K\r');

    const msg = response.message || {};
    messages.push(messageToHistory(msg));

    if (!Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0) {
      return msg.content || '';
    }

    for (const toolCall of msg.tool_calls) {
      const name = toolCall?.function?.name;
      const args = normalizeToolArgs(toolCall?.function?.arguments);

      console.log(`  -> ${name}(${JSON.stringify(args)})`);
      const result = await dispatch(name, args, runtimeConfig);

      if (name === 'switch_model') {
        console.log(`  model -> ${runtimeConfig.model}`);
      } else if (name === 'set_config') {
        console.log(`  saved ${args.key}`);
      }

      messages.push({
        role: 'tool',
        tool_name: name,
        name,
        content: result,
      });
    }

    await sleep(0);
  }
}
