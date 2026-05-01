import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const REMLAND_DIR = path.join(os.homedir(), '.doo', 'remland');
const SESSIONS_DIR = path.join(REMLAND_DIR, 'sessions');
const REVIEWS_DIR = path.join(REMLAND_DIR, 'reviews');
const LATEST_REVIEW_PATH = path.join(REMLAND_DIR, 'latest.md');
const BOOT_STATE_PATH = path.join(REMLAND_DIR, 'boot-state.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function preview(value, limit = 320) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!text) return '';
  return text.length <= limit ? text : `${text.slice(0, limit - 3)}...`;
}

function digest(content) {
  return createHash('sha256').update(content || '').digest('hex');
}

function sessionPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
}

export function createRemlandSession(scope, meta = {}) {
  return {
    id: `${scope}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    scope,
    meta,
    startedAt: nowIso(),
  };
}

export function appendRemlandEvent(sessionId, event) {
  ensureDir(SESSIONS_DIR);
  const record = { at: nowIso(), ...event };
  fs.appendFileSync(sessionPath(sessionId), JSON.stringify(record) + '\n', 'utf8');
}

export function readRemlandEvents(sessionId, limit = 200) {
  try {
    const raw = fs.readFileSync(sessionPath(sessionId), 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const slice = limit > 0 ? lines.slice(-limit) : lines;
    return slice.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export function listRemlandSessions() {
  try {
    ensureDir(SESSIONS_DIR);
    return fs.readdirSync(SESSIONS_DIR)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => {
        const full = path.join(SESSIONS_DIR, name);
        const stat = fs.statSync(full);
        return {
          sessionId: name.replace(/\.jsonl$/, ''),
          path: full,
          mtimeMs: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}

export function loadLatestRemlandReview() {
  try {
    return fs.readFileSync(LATEST_REVIEW_PATH, 'utf8');
  } catch {
    return '';
  }
}

export function loadRemlandBootState() {
  try {
    return JSON.parse(fs.readFileSync(BOOT_STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function saveRemlandBootState(state) {
  ensureDir(REMLAND_DIR);
  fs.writeFileSync(BOOT_STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function saveRemlandReview(sessionId, content) {
  ensureDir(REVIEWS_DIR);
  const reviewPath = path.join(REVIEWS_DIR, `${sessionId}.md`);
  fs.writeFileSync(reviewPath, content, 'utf8');
  ensureDir(REMLAND_DIR);
  fs.writeFileSync(LATEST_REVIEW_PATH, content, 'utf8');
  return reviewPath;
}

export function digestRemlandReview(content) {
  return digest(content);
}

export function summarizeRemlandSession(sessionId) {
  const events = readRemlandEvents(sessionId, 500);
  const turnEnds = events.filter((event) => event.type === 'turn_end');
  const toolCalls = events.filter((event) => event.type === 'tool_call');
  const toolNames = [...new Set(toolCalls.map((event) => event.name).filter(Boolean))];
  const failedTurns = turnEnds.filter((event) => event.status && event.status !== 'ok').length;
  const lastTurn = turnEnds[turnEnds.length - 1] || null;

  return {
    sessionId,
    eventCount: events.length,
    turnCount: turnEnds.length,
    failedTurns,
    toolCalls: toolCalls.length,
    toolNames,
    lastTurn,
  };
}

export function formatRemlandSnapshot(sessionId) {
  const summary = summarizeRemlandSession(sessionId);
  const lines = [];

  lines.push(`Session: ${summary.sessionId}`);
  lines.push(`Events: ${summary.eventCount}`);
  lines.push(`Turns: ${summary.turnCount}`);
  lines.push(`Failed turns: ${summary.failedTurns}`);
  lines.push(`Tool calls: ${summary.toolCalls}`);
  lines.push(`Tools used: ${summary.toolNames.length ? summary.toolNames.join(', ') : '(none yet)'}`);

  if (summary.lastTurn) {
    lines.push('');
    lines.push(`Last turn status: ${summary.lastTurn.status || 'unknown'}`);
    if (summary.lastTurn.reply) {
      lines.push(`Last reply: ${preview(summary.lastTurn.reply)}`);
    }
    if (summary.lastTurn.error) {
      lines.push(`Last error: ${preview(summary.lastTurn.error)}`);
    }
  }

  return lines.join('\n');
}

function inferTurnStatus(reply, error, toolResults) {
  if (error) return 'error';
  if (toolResults.some((result) => result.status === 'error')) return 'blocked';

  const text = String(reply || '').toLowerCase();
  if (/(can't|cannot|couldn't|unable|not sure|don't know|need an api key|missing)/.test(text)) {
    return 'needs_attention';
  }

  return 'ok';
}

export function beginRemlandTurn(sessionId, meta = {}) {
  const turnId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const toolResults = [];

  appendRemlandEvent(sessionId, {
    type: 'turn_start',
    turnId,
    meta,
  });

  return {
    sessionId,
    turnId,
    onToolCall(call) {
      appendRemlandEvent(sessionId, {
        type: 'tool_call',
        turnId,
        name: call.name,
        args: preview(call.args),
      });
    },
    onToolResult(result) {
      const status = typeof result.result === 'string' && /^error/i.test(result.result)
        ? 'error'
        : 'ok';
      toolResults.push({ name: result.name, status });
      appendRemlandEvent(sessionId, {
        type: 'tool_result',
        turnId,
        name: result.name,
        status,
        result: preview(result.result),
      });
    },
    finish({ reply = '', error = null } = {}) {
      const status = inferTurnStatus(reply, error, toolResults);
      appendRemlandEvent(sessionId, {
        type: 'turn_end',
        turnId,
        status,
        reply: preview(reply),
        error: error ? preview(error) : null,
        toolCount: toolResults.length,
      });

      return { status, turnId, toolCount: toolResults.length };
    },
  };
}
