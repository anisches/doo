const NEEDS_KEY =
  'MISSING_OLLAMA_API_KEY: No Ollama API key is configured. Ask the user for their Ollama API key and save it with set_config key=ollama_api_key.';

function apiBase(host) {
  const trimmed = host.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export async function search(query, config = null, maxResults = 5) {
  const apiKey = config?.ollamaApiKey;
  if (!apiKey) {
    return NEEDS_KEY;
  }

  try {
    const host = config?.ollamaHost || 'https://ollama.com';
    const response = await fetch(`${apiBase(host)}/web_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) {
      return 'No results found.';
    }

    return results
      .map((result) => `**${result.title || 'Untitled'}**\n${result.url || ''}\n${result.content || ''}`)
      .join('\n\n---\n\n');
  } catch (error) {
    return `Search error: ${error instanceof Error ? error.message : String(error)}`;
  }
}
