import { loadMemory, saveMemory } from './index.js';

function apiBase(host) {
  const trimmed = host.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const PROMPT = (memory, user, agent) => `
You are a memory distiller. You observe one conversation exchange and decide if anything is worth remembering long-term.

Current memory:
${memory}

Exchange:
User: ${user}
Agent: ${agent}

What to save (only this):
- User section: facts about the person (name, job, preferences, what they're building)
- Patterns section: how they communicate or work (prefers brevity, corrects often, technical)
- If 


Rules:
- If something matches/extends an existing entry → update it, don't duplicate
- If genuinely new about the user or their patterns → add it
- Otherwise → discard

Respond with ONLY a JSON object, nothing else:
{ "action": "update" | "new" | "discard", "section": "User" | "Patterns", "entry": "one line fact" }

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
