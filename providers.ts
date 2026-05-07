import { Config } from './config.ts';

const PROVIDERS = {
  ollama: {
    key: 'ollama',
    label: 'Ollama',
    envKey: 'OLLAMA_API_KEY',
    baseUrl: (config) => config.ollamaHost,
    apiKey: (config) => config.ollamaApiKey,
    endpoint: '/chat',
    defaultModel: 'qwen-a3b-32k:latest',
  },
  nvidia: {
    key: 'nvidia',
    label: 'NVDA',
    envKey: 'NVIDIA_API_KEY',
    baseUrl: (config) => config.nvidiaBaseUrl,
    apiKey: (config) => config.nvidiaApiKey,
    endpoint: '/chat/completions',
    defaultModel: 'mistralai/mistral-nemotron',
  },
  openrouter: {
    key: 'openrouter',
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: (config) => config.openrouterBaseUrl,
    apiKey: (config) => config.openrouterApiKey,
    endpoint: '/chat/completions',
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b:free',
  },
};

function normalizeProvider(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'nvda' || v === 'nvidia') return 'nvidia';
  if (v === 'openrouter' || v === 'router' || v === 'open' || v === 'or') return 'openrouter';
  if (v === 'ollama' || v === 'local' || v === '') return 'ollama';
  return 'ollama';
}

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function providerSpec(provider) {
  return PROVIDERS[normalizeProvider(provider)] || PROVIDERS.ollama;
}

function providerUrl(config, provider = config.provider) {
  const normalized = normalizeProvider(provider);
  const spec = providerSpec(normalized);
  const base = trimTrailingSlash(spec.baseUrl(config));
  if (normalized === 'ollama') {
    if (base.endsWith('/api/chat')) {
      return base;
    }
    return base.endsWith('/api') ? `${base}/chat` : `${base}/api/chat`;
  }
  if (base.endsWith('/chat/completions')) {
    return base;
  }
  if (base.endsWith('/v1/chat/completions')) {
    return base;
  }
  if (base.endsWith('/chat') || base.endsWith('/v1/chat')) {
    return `${base.replace(/\/(?:v1\/)?chat$/, '')}/v1/chat/completions`;
  }
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

function providerHeaders(config, provider = config.provider) {
  const normalized = normalizeProvider(provider);
  const spec = providerSpec(normalized);
  const apiKey = spec.apiKey(config);

  if (!apiKey) {
    throw new Error(`${spec.label} API key is not set.`);
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (normalized === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER || 'https://doo.local';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'doo';
  }

  return headers;
}

function normalizeMessage(response, provider) {
  const normalized = normalizeProvider(provider);
  if (normalized === 'ollama') {
    if (response?.message) {
      return { ...response.message, content: stripThinkingText(response.message.content) };
    }
  } else {
    const message = response?.choices?.[0]?.message;
    if (message) {
      return { ...message, content: stripThinkingText(message.content) };
    }
  }

  return { role: 'assistant', content: '' };
}

export function stripThinkingText(content) {
  return String(content || '')
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
    .trim();
}

function currentModel(config, provider) {
  const normalized = normalizeProvider(provider);
  if (normalized === 'openrouter') {
    return config.openrouter_model || PROVIDERS.openrouter.defaultModel;
  }
  if (normalized === 'nvidia') {
    return config.nvidia_model || PROVIDERS.nvidia.defaultModel;
  }
  return config.ollama_model || PROVIDERS.ollama.defaultModel;
}

export function normalizeProviderName(value) {
  return normalizeProvider(value);
}

export function providerDisplayName(value) {
  return providerSpec(value).label;
}

export function providerSnapshot(config) {
  const active = normalizeProvider(config.provider);
  return Object.values(PROVIDERS).map((spec) => ({
    key: spec.key,
    label: spec.label,
    active: spec.key === active,
    model: currentModel(config, spec.key),
    endpoint: providerUrl(config, spec.key),
    hasApiKey: Boolean(spec.apiKey(config)),
    envKey: spec.envKey,
  }));
}

export function describeProviders(config) {
  const active = normalizeProvider(config.provider);
  const lines = [
    `active: ${providerDisplayName(active)} (${currentModel(config, active)})`,
  ];

  for (const provider of providerSnapshot(config)) {
    const activeMark = provider.active ? '*' : '-';
    const keyStatus = provider.hasApiKey ? 'key: yes' : `key: no (${provider.envKey})`;
    lines.push(`${activeMark} ${provider.label} | model: ${provider.model} | ${keyStatus}`);
  }

  return lines.join('\n');
}

export function sendChat(messages, config, options = {}) {
  const runtimeConfig = config;
  const provider = normalizeProvider(runtimeConfig.provider);
  const spec = providerSpec(provider);
  const tools = Array.isArray(options.tools) ? options.tools : [];
  const model = currentModel(runtimeConfig, provider);
  const body = {
    messages,
    tools,
    stream: false,
  };

  body.model = model;

  return fetch(providerUrl(runtimeConfig, provider), {
    method: 'POST',
    headers: providerHeaders(runtimeConfig, provider),
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${spec.label} chat failed (${response.status}): ${text}`);
    }

    const json = await response.json();
    return normalizeMessage(json, provider);
  });
}
