function normalizeProvider(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'nvda' || v === 'nvidia') return 'nvidia';
  if (v === 'ollama' || v === 'local' || v === '') return 'ollama';
  return 'ollama';
}

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function ollamaBase(config) {
  const host = trimTrailingSlash(config.ollamaHost);
  return host.endsWith('/api') ? host : `${host}/api`;
}

function nvidiaBase(config) {
  const base = trimTrailingSlash(config.nvidiaBaseUrl);
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

function providerHeaders(config) {
  if (normalizeProvider(config.provider) === 'nvidia') {
    if (!config.nvidiaApiKey) {
      throw new Error('NVIDIA API key is not set.');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.nvidiaApiKey}`,
    };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (config.ollamaApiKey) {
    headers.Authorization = `Bearer ${config.ollamaApiKey}`;
  }
  return headers;
}

function normalizeMessage(response, provider) {
  if (provider === 'nvidia') {
    const message = response?.choices?.[0]?.message;
    if (message) {
      return message;
    }
  }

  if (response?.message) {
    return response.message;
  }

  return { role: 'assistant', content: '' };
}

export function normalizeProviderName(value) {
  return normalizeProvider(value);
}

export function providerDisplayName(value) {
  return normalizeProvider(value) === 'nvidia' ? 'NVDA' : 'Ollama';
}

export function providerEndpoint(config) {
  return normalizeProvider(config.provider) === 'nvidia' ? nvidiaBase(config) : ollamaBase(config);
}

export async function sendChat(messages, config, options = {}) {
  const runtimeConfig = config;
  const provider = normalizeProvider(runtimeConfig.provider);
  const tools = Array.isArray(options.tools) ? options.tools : [];
  const body = provider === 'nvidia'
    ? {
        model: runtimeConfig.model,
        messages,
        tools,
        stream: false,
      }
    : {
        model: runtimeConfig.model,
        messages,
        tools,
        stream: false,
      };

  const response = await fetch(
    provider === 'nvidia'
      ? `${nvidiaBase(runtimeConfig)}/chat/completions`
      : `${ollamaBase(runtimeConfig)}/chat`,
    {
      method: 'POST',
      headers: providerHeaders(runtimeConfig),
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${providerDisplayName(provider)} chat failed (${response.status}): ${text}`);
  }

  const json = await response.json();
  return normalizeMessage(json, provider);
}
