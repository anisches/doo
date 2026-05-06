import { setTimeout as sleep } from 'node:timers/promises';
import { Config } from './config.ts';
import { TOOLS, dispatch } from './tools/registry.ts';
import { providerDisplayName, sendChat } from './providers.ts';

export const SYSTEM_PROMPT = `
You are a helpful and friendly AI agent. Be conversational, clear, and a little fun. No need to be stiff.

You have four model providers:
- OpenRouter for hosted models. This is the default provider.
- Ollama for local models.
- NVDA / NVIDIA for hosted models.
- Unsloth for your own hosted OpenAI-compatible endpoint, like a local or SSH-served model on grizzly.

Switching the model only changes the model within the current provider. If the user asks to use OpenRouter, switch_provider to openrouter. If they ask to use Unsloth or grizzly, switch the provider to unsloth. If they ask to use NVDA or NVIDIA, switch the provider to nvidia. If they ask for Ollama or local, switch back to Ollama.

Use query_providers when you need to inspect the active provider or the supported provider list.

If web_search returns a message starting with MISSING_OLLAMA_API_KEY:
  1. Tell the user you need an Ollama API key to search the web.
  2. Ask them to paste it in.
  3. Once they give it, call set_config with key=ollama_api_key and their value.
  4. Tell them it's saved — do not retry the search automatically.

Use tools silently. No need to narrate them. Just get things done.

When creating files, apps, scripts, or any project — always work inside ~/.doo/workspace/. Create subdirectories there as needed. Use run_command to mkdir if the folder doesn't exist yet.

Be curious ,  answer in a friendly manner , bee keen on doing things !!
`.trim();

export function buildSystemPrompt(bootSections = []) {
  const sections = bootSections.map((b) => b.content).join('\n\n');
  return sections ? `${SYSTEM_PROMPT}\n\n${sections}` : SYSTEM_PROMPT;
}

function parseTextToolCalls(content) {
  const calls = [];
  const re = /<function=(\w+)>([\s\S]*?)<\/function>/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const args = {};
    const paramRe = /<parameter=(\w+)>([\s\S]*?)<\/parameter>/g;
    let p;
    while ((p = paramRe.exec(body)) !== null) {
      args[p[1]] = p[2].trim();
    }
    calls.push({ name, args });
  }
  return calls;
}

function stripTextToolCalls(content) {
  return content.replace(/<function=[\s\S]*?<\/function>/g, '').trim();
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

export async function runAgent(messages, config, hooks = {}) {
  const runtimeConfig = config instanceof Config ? config : config;
  let emptyRetries = 0;
  let fallbackRetries = 0;

  for (; ;) {
    hooks.onStatus?.('thinking');
    if (!hooks.silent) {
      process.stdout.write(`\n[${providerDisplayName(runtimeConfig.provider)}:${runtimeConfig.model}] thinking...\r`);
    }
    const response = await sendChat(messages, runtimeConfig, { tools: TOOLS });
    if (!hooks.silent) {
      process.stdout.write('\x1b[2K\r');
    }
    hooks.onStatus?.('thinking');

    const msg = response.message || {};

    const structuredCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
    const textCalls = !structuredCalls ? parseTextToolCalls(msg.content || '') : [];
    const assistantText = String(msg.content || '').trim();

    if (!structuredCalls && textCalls.length === 0) {
      if (!assistantText && emptyRetries < 1) {
        emptyRetries += 1;
        messages.push({
          role: 'system',
          content:
            'The previous assistant response was empty. Answer the user directly in one short, complete reply. Do not use tools for this retry.',
        });
        hooks.onStatus?.('retrying');
        continue;
      }

      if (!assistantText && fallbackRetries < 1) {
        fallbackRetries += 1;
        const fallbackMessages = [
          ...messages,
          {
            role: 'system',
            content:
              'The assistant response was empty. Answer the user directly in one short complete sentence. Do not use tools.',
          },
        ];
        const fallbackResponse = await sendChat(fallbackMessages, runtimeConfig, { tools: [] });
        const fallbackMsg = fallbackResponse || {};
        const fallbackText = String(fallbackMsg.content || '').trim();
        if (fallbackText) {
          hooks.onAssistantMessage?.(fallbackText);
          messages.push(messageToHistory(fallbackMsg));
          hooks.onStatus?.('ready');
          return fallbackText;
        }
      }

      hooks.onAssistantMessage?.(msg.content || '');
      messages.push(messageToHistory(msg));
      hooks.onStatus?.('ready');
      return assistantText;
    }

    if (textCalls.length > 0) {
      msg.content = stripTextToolCalls(msg.content || '');
    }

    messages.push(messageToHistory(msg));

    const toolCalls = structuredCalls
      ? msg.tool_calls.map((tc) => ({ name: tc?.function?.name, args: normalizeToolArgs(tc?.function?.arguments) }))
      : textCalls;

    for (const { name, args } of toolCalls) {
      hooks.onStatus?.(`tool:${name || 'unknown'}`);
      hooks.onToolCall?.({ name, args });

      if (!hooks.silent) {
        console.log(`  -> ${name}(${JSON.stringify(args)})`);
      }
      const result = await dispatch(name, args, runtimeConfig);
      hooks.onToolResult?.({ name, args, result });

      if (name === 'switch_model') {
        if (!hooks.silent) {
          console.log(`  model -> ${runtimeConfig.model}`);
        }
      } else if (name === 'set_config') {
        if (!hooks.silent) {
          console.log(`  saved ${args.key}`);
        }
      }

      messages.push({ role: 'tool', tool_name: name, name, content: result });
    }

    hooks.onStatus?.('thinking');
    await sleep(0);
  }
}
