import { sendChat, stripThinkingText } from './providers.ts';
import { renderToolCatalog } from './tools/registry.ts';
import { providerSnapshot } from './providers.ts';

function lastUserText(messages) {
  return [...messages].reverse().find((message) => message?.role === 'user')?.content || '';
}

function isLiveInfoQuery(text) {
  const value = String(text || '').toLowerCase();
  return /\b(latest|current|today|news|breaking|price|stock|stocks|earnings|market|now|recent|update|updates|headlines)\b/.test(value);
}

function isToolInquiry(text) {
  const value = String(text || '').toLowerCase();
  return /\b(tool|tools|capabilities|available tools|what can you do|query_tools|provider|providers)\b/.test(value);
}

function needsClarification(text) {
  const value = String(text || '').trim().toLowerCase();
  if (!value) return true;
  if (value.length < 3) return true;
  return /^(this|that|it|here|there|what about it|and then|then what)\b/.test(value);
}

function fallbackPlan(messages, config) {
  const userText = lastUserText(messages);
  const providerInfo = providerSnapshot(config).find((entry) => entry.active);

  if (isLiveInfoQuery(userText)) {
    return {
      action: 'use_web_search',
      reason: 'user asked for current or time-sensitive information',
      query: userText,
      provider: providerInfo?.label || config.provider,
      note: 'prefetch search results before answering',
    };
  }

  if (isToolInquiry(userText)) {
    return {
      action: 'use_tools',
      reason: 'user asked about tools or capabilities',
      query: userText,
      tool_catalog: renderToolCatalog(),
      provider: providerInfo?.label || config.provider,
    };
  }

  if (needsClarification(userText)) {
    return {
      action: 'ask_clarifying_question',
      reason: 'user request is too short or ambiguous to act safely',
      query: userText,
      provider: providerInfo?.label || config.provider,
    };
  }

  return {
    action: 'answer_directly',
    reason: 'no special tool or clarification needed',
    query: userText,
    provider: providerInfo?.label || config.provider,
  };
}

function parseJsonBlock(text) {
  const value = stripThinkingText(String(text || ''));
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizePlan(plan, messages, config) {
  const fallback = fallbackPlan(messages, config);
  const action = String(plan?.action || '').trim();
  const allowed = new Set([
    'answer_directly',
    'use_web_search',
    'use_tools',
    'ask_clarifying_question',
  ]);

  if (!allowed.has(action)) {
    return fallback;
  }

  return {
    action,
    reason: String(plan?.reason || fallback.reason || '').trim() || fallback.reason,
    query: String(plan?.query || fallback.query || '').trim() || fallback.query,
    tools: Array.isArray(plan?.tools) ? plan.tools : [],
    provider: String(plan?.provider || fallback.provider || '').trim() || fallback.provider,
    note: String(plan?.note || '').trim(),
  };
}

function buildPlannerPrompt(messages, config) {
  const userText = lastUserText(messages);
  const providerInfo = providerSnapshot(config).find((entry) => entry.active);
  return [
    'You are a planner for an AI agent.',
    'Your job is to inspect the user request and decide the next action before the agent acts.',
    'Return ONLY a JSON object, no markdown, no explanation, no code fences.',
    '',
    'Allowed actions:',
    '- answer_directly',
    '- use_web_search',
    '- use_tools',
    '- ask_clarifying_question',
    '',
    'Decision rules:',
    '- use_web_search for current, latest, news, price, earnings, market, or other time-sensitive requests.',
    '- use_tools when the user asks about tools, files, shell, providers, or capabilities.',
    '- ask_clarifying_question when the request is too short or ambiguous.',
    '- answer_directly when no tool is needed.',
    '',
    'Output schema:',
    '{',
    '  "action": "answer_directly | use_web_search | use_tools | ask_clarifying_question",',
    '  "reason": "short explanation",',
    '  "query": "the user request being planned for",',
    '  "tools": ["optional list of likely tools"],',
    '  "provider": "active provider label",',
    '  "note": "optional short note"',
    '}',
    '',
    `Active provider: ${providerInfo?.label || config.provider}`,
    `Active model: ${config.model}`,
    'Available tools:',
    renderToolCatalog(),
    '',
    `User request: ${userText}`,
  ].join('\n');
}

export async function planAction(messages, config) {
  const plannerMessages = [
    { role: 'system', content: buildPlannerPrompt(messages, config) },
    { role: 'user', content: lastUserText(messages) },
  ];

  try {
    const response = await sendChat(plannerMessages, config, { tools: [] });
    const parsed = parseJsonBlock(response?.message?.content || '');
    if (parsed) {
      return normalizePlan(parsed, messages, config);
    }
  } catch {
    // Fall back to heuristic planning below.
  }

  return fallbackPlan(messages, config);
}
