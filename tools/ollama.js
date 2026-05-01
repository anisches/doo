function apiBase(host) {
  const trimmed = host.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export async function callOllama(endpoint, method = 'GET', body = null, config) {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${apiBase(config.ollamaHost)}${path}`;

  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (config.ollamaApiKey) opts.headers.Authorization = `Bearer ${config.ollamaApiKey}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    return JSON.stringify(data, null, 2);
  } catch (err) {
    return `Error calling Ollama ${endpoint}: ${err.message}`;
  }
}
