import { providerSnapshot } from './providers.ts';
import { renderToolCatalog } from './tools/registry.ts';

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

export function planAction(messages, config) {
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
