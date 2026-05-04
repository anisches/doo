import { appendMemoryLastSeen, loadMemory } from './index.ts';
import { sendChat } from '../providers.ts';

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
  let text = '';
  try {
    const message = await sendChat(
      [{ role: 'user', content: PROMPT(memory, user, agent) }],
      config,
      { tools: [] },
    );
    text = String(message?.content || '').trim();
  } catch {
    return;
  }

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
  distill(userMsg, agentReply, config).catch(() => { });
}
