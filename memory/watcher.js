import { appendMemoryLastSeen, getMissingPrimitives, incrementPrimitiveAskCount, resetPrimitiveAskCount, loadMemory } from './index.js';

function apiBase(host) {
  const trimmed = host.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const PROMPT = (memory, user, agent) => `
You are a memory logger.

Current memory:
${memory}

Exchange:
User: ${user}
Agent: ${agent}

Your task:
- write a short last_seen note for this exchange
- keep it concrete and one line
- prefer what was discussed, decided, or blocked
- do not repeat stable primitives

Respond with ONLY a JSON object:
{ "action": "update" | "discard", "entry": "2026-05-02: short note" }

If nothing is worth logging, respond with { "action": "discard" }.
`.trim();

async function distill(user, agent, config) {
  const memory = loadMemory();
  const body = {
    model: config.model,
    messages: [{ role: 'user', content: PROMPT(memory, user, agent) }],
    stream: false,
  };

  const headers = { 'Content-Type': 'application/json' };
  if (config.ollamaApiKey) headers.Authorization = `Bearer ${config.ollamaApiKey}`;

  const res = await fetch(`${apiBase(config.ollamaHost)}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) return;

  const data = await res.json();
  const text = (data.message?.content || '').trim();

  let result;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    result = JSON.parse(jsonMatch?.[0] || text);
  } catch {
    return;
  }

  if (!result || result.action === 'discard' || !result.entry) return;

  await appendMemoryLastSeen(result.entry);
}

export function watchTurn(userMsg, agentReply, config) {
  distill(userMsg, agentReply, config).catch(() => { }).finally(() => {
    const missing = getMissingPrimitives();
    if (missing.length > 0) {
      incrementPrimitiveAskCount();
    } else {
      resetPrimitiveAskCount();
    }
  });
}
