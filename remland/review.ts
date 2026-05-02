import { readRemlandEvents, saveRemlandReview, loadLatestRemlandReview, formatRemlandSnapshot } from './index.ts';
import { TOOLS } from '../tools/registry.ts';

function apiBase(host) {
  const trimmed = host.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function makeHeaders(config) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.ollamaApiKey) {
    headers.Authorization = `Bearer ${config.ollamaApiKey}`;
  }
  return headers;
}

function toolCatalog() {
  return TOOLS.map((tool) => `- ${tool.function.name}: ${tool.function.description}`).join('\n');
}

function renderEvents(events) {
  if (!events.length) {
    return '(no events yet)';
  }

  return events.map((event) => {
    if (event.type === 'turn_start') {
      return `TURN_START ${event.turnId} ${JSON.stringify(event.meta || {})}`;
    }
    if (event.type === 'tool_call') {
      return `TOOL_CALL ${event.turnId} ${event.name} ${event.args}`;
    }
    if (event.type === 'tool_result') {
      return `TOOL_RESULT ${event.turnId} ${event.name} [${event.status}] ${event.result}`;
    }
    if (event.type === 'turn_end') {
      return `TURN_END ${event.turnId} [${event.status}] tools=${event.toolCount || 0} reply=${event.reply || ''} error=${event.error || ''}`;
    }
    return `${event.type || 'event'} ${event.turnId || ''} ${JSON.stringify(event)}`;
  }).join('\n');
}

function buildPrompt(sessionId, events, previousReview) {
  return `
You are REMland, a post-session analyst for this agent.

Your job:
- list the tooling available
- explain how the tools were used in this session
- identify what went wrong
- identify what is missing or incomplete
- suggest concrete improvements
- if work was not completed, do a deeper dive on what was missing first
- compare this session to the previous self-eval if one exists

Session snapshot:
${formatRemlandSnapshot(sessionId)}

Available tooling:
${toolCatalog()}

Session log:
${renderEvents(events)}

Previous self-eval:
${previousReview || '(none)'}

Write a concise markdown report with these sections:
## Tooling Available
## How I Used It
## What Went Wrong
## What I Am Missing
## Comparison To Previous Self-Eval
## Next Steps

Be specific. Prefer concrete failures, missing actions, and direct improvements over generic advice.
`.trim();
}

async function callOllamaReview(prompt, config) {
  const response = await fetch(`${apiBase(config.ollamaHost)}/chat`, {
    method: 'POST',
    headers: makeHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama review failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return (data.message?.content || '').trim();
}

export async function reviewRemlandSession(sessionId, config) {
  const events = readRemlandEvents(sessionId, 200);
  if (!events.length) {
    return `No REMland events found for session ${sessionId}.`;
  }

  try {
    const previousReview = loadLatestRemlandReview();
    const prompt = buildPrompt(sessionId, events, previousReview);
    const report = await callOllamaReview(prompt, config);
    if (!report) {
      return `REMland review for ${sessionId} returned no content.`;
    }

    saveRemlandReview(sessionId, report);
    return report;
  } catch (error) {
    return `Error generating REMland review for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function queryRemlandSession(sessionId) {
  const events = readRemlandEvents(sessionId, 80);
  const previousReview = loadLatestRemlandReview();
  const lines = [];

  lines.push(`# REMland`);
  lines.push('');
  lines.push(`## Current Session`);
  lines.push(formatRemlandSnapshot(sessionId));

  lines.push('');
  lines.push('## Recent Events');
  lines.push(renderEvents(events.slice(-20)));

  if (previousReview) {
    lines.push('');
    lines.push('## Latest Self-Eval');
    lines.push(previousReview);
  }

  return lines.join('\n');
}
