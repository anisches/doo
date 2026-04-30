import { loadMemory, saveMemory } from './index.js';

function apiBase(host) {
  const trimmed = host.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const PROMPT = (memory, user, agent) => `
You are a memory distiller for an AI agent. Your job is to keep a lean, living schema of what's worth remembering about the user and the conversation context.

Read the prior memory:

${memory}

New exchange:
User: ${user}
Agent: ${agent}

Rules:
- Only save things that are genuinely new(novelty), revealing, or recurring 
- Routine chit-chat, simple questions, one-off tasks → discard consider them as noise . 
- If it updates an existing entry → merge, don't duplicate 
- If it's new → add as a bullet under the right section (User, Patterns, or Context)
- Keep entries short, factual, timeless 


Respond with ONLY a JSON object, nothing else:
{ "action": "update" | "new" | "discard", "section": "User" | "Patterns" | "Context", "entry": "one line fact" }

If discarding: { "action": "discard" }
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

  const current = loadMemory();
  const section = `## ${result.section}`;
  const entry = `- ${result.entry}`;

  if (current.includes(entry)) return;

  const updated = current.includes(section)
    ? current.replace(section, `${section}\n${entry}`)
    : current + `\n${section}\n${entry}\n`;

  saveMemory(updated);
}

export function watchTurn(userMsg, agentReply, config) {
  distill(userMsg, agentReply, config).catch(() => { });
}
