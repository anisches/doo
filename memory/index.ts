import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MEMORY_PATH = path.join(os.homedir(), '.doo', 'memory.md');

const SECTION_ORDER = ['primitives', 'preferences', 'context', 'last_seen'];

const primitiveReminderCounts = new Map();

const EMPTY_DATA = () => ({
  primitives: {},
  preferences: {},
  context: {},
  last_seen: [],
});

function normalizeSection(name) {
  const value = String(name || '').trim().toLowerCase();
  if (value === 'memory') return 'context';
  if (SECTION_ORDER.includes(value)) return value;
  if (value === 'user' || value === 'patterns') return 'context';
  return null;
}

function splitKeyValue(line) {
  const idx = line.indexOf(':');
  if (idx === -1) {
    return [line.trim(), ''];
  }

  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  return [key, value];
}

function looksLikePrimitiveName(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (value.length > 60) return false;
  if (/[0-9@/:?#<>{}\[\]\\]/.test(value)) return false;
  if (/\n|\r/.test(value)) return false;

  const tokens = value.split(/\s+/);
  if (tokens.length > 3) return false;
  if (tokens.some((token) => token.length < 2)) return false;

  const validToken = /^[\p{L}][\p{L}.'-]*$/u;
  if (!tokens.every((token) => validToken.test(token))) {
    return false;
  }

  const blocked = new Set(['hi', 'hello', 'hey', 'yes', 'no', 'ok', 'okay', 'thanks', 'thank', 'name', 'my', 'i', "i'm", 'im', 'call', 'me']);
  if (tokens.some((token) => blocked.has(token.toLowerCase()))) {
    return false;
  }

  return true;
}

function looksLikeInterests(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (value.length > 120) return false;
  if (/\n|\r/.test(value)) return false;
  return /,|\/|\band\b/i.test(value) || value.split(/\s+/).length >= 3;
}

function ordinal(n) {
  const value = Math.max(1, Number.parseInt(n, 10) || 1);
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function missingPrimitiveLabel(key) {
  if (key === 'user_name') return 'how you would like to be addressed';
  if (key === 'agent_name') return 'what you want to call me';
  if (key === 'interests') return 'your primary interests';
  return key;
}

function primitiveReminderText(missing, count) {
  const fields = missing.map(missingPrimitiveLabel).join(', ');
  const lead =
    count <= 1
      ? 'Before anything else'
      : `This is the ${ordinal(count)} time we are asking in this session. Keep it calm, persuasive, and non-frustrating.`;

  return [
    lead,
    `Ask the user for the missing primitive memory fields: ${fields}.`,
    'Keep it to one short casual sentence.',
    'Do not answer the user\'s task yet.',
    'This is cached session memory only, so do not save the ask count.',
    'Once they answer, save the values into memory and continue.',
  ].join(' ');
}

export function getPrimitiveReminder(sessionKey = 'default') {
  const key = String(sessionKey || 'default');
  return primitiveReminderCounts.get(key) || 0;
}

export function resetPrimitiveReminder(sessionKey = 'default') {
  const key = String(sessionKey || 'default');
  primitiveReminderCounts.delete(key);
  return 0;
}

export function nextPrimitiveReminder(sessionKey = 'default', data = loadMemoryData()) {
  const missing = getMissingPrimitives(data);
  if (missing.length === 0) {
    resetPrimitiveReminder(sessionKey);
    return null;
  }

  const key = String(sessionKey || 'default');
  const next = getPrimitiveReminder(key) + 1;
  primitiveReminderCounts.set(key, next);
  return primitiveReminderText(missing, next);
}

function parseRawMemory(raw) {
  const data = EMPTY_DATA();
  let section = null;
  const counters = { primitives: 0, preferences: 0, context: 0 };

  for (const line of String(raw || '').split(/\r?\n/)) {
    const sectionMatch = line.match(/^##\s*(.+?)\s*$/);
    if (sectionMatch) {
      section = normalizeSection(sectionMatch[1]);
      continue;
    }

    if (!section) {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (!trimmed.startsWith('- ')) {
      continue;
    }

    const item = trimmed.slice(2).trim();
    if (!item) {
      continue;
    }

    if (section === 'last_seen') {
      data.last_seen.push(item);
      continue;
    }

    const [key, value] = splitKeyValue(item);
    if (!key) {
      continue;
    }

    if (!value && !item.includes(':')) {
      counters[section] += 1;
      data[section][`note_${counters[section]}`] = key;
      continue;
    }

    data[section][key] = value;
  }

  return data;
}

function formatSectionHeader(title) {
  return `## ${title}`;
}

function formatKeyValueSection(title, entries) {
  const lines = [formatSectionHeader(title)];
  const keys = Object.keys(entries || {});
  if (keys.length === 0) {
    lines.push('');
    return lines;
  }

  for (const key of keys) {
    const value = entries[key];
    if (value == null || value === '') {
      continue;
    }
    lines.push(`- ${key}: ${value}`);
  }
  lines.push('');
  return lines;
}

function formatListSection(title, entries) {
  const lines = [formatSectionHeader(title)];
  const values = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (values.length === 0) {
    lines.push('');
    return lines;
  }

  for (const value of values) {
    lines.push(`- ${value}`);
  }
  lines.push('');
  return lines;
}

export function loadMemoryData() {
  try {
    const raw = fs.readFileSync(MEMORY_PATH, 'utf8');
    return parseRawMemory(raw);
  } catch {
    return EMPTY_DATA();
  }
}

export function formatMemoryData(data) {
  const normalized = {
    primitives: { ...(data?.primitives || {}) },
    preferences: { ...(data?.preferences || {}) },
    context: { ...(data?.context || {}) },
    last_seen: Array.isArray(data?.last_seen) ? [...data.last_seen] : [],
  };

  const lines = ['# memory', ''];
  for (const section of SECTION_ORDER) {
    if (section === 'last_seen') {
      lines.push(...formatListSection(section, normalized[section]));
    } else {
      lines.push(...formatKeyValueSection(section, normalized[section]));
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function loadMemory() {
  return formatMemoryData(loadMemoryData());
}

export function saveMemory(content) {
  fs.mkdirSync(path.dirname(MEMORY_PATH), { recursive: true });
  fs.writeFileSync(MEMORY_PATH, content, 'utf8');
}

export function saveMemoryData(data) {
  saveMemory(formatMemoryData(data));
}

export function getMissingPrimitives(data = loadMemoryData()) {
  const required = ['user_name', 'agent_name', 'interests'];
  return required.filter((key) => !String(data?.primitives?.[key] || '').trim());
}

export function setMemoryField(section, key, value) {
  const data = loadMemoryData();
  if (!SECTION_ORDER.includes(section)) {
    throw new Error(`Unknown memory section: ${section}`);
  }

  if (section === 'last_seen') {
    const entry = String(value || '').trim();
    if (!entry) {
      return loadMemory();
    }

    data.last_seen = [entry, ...(data.last_seen || [])].slice(0, 20);
  } else {
    data[section][key] = String(value || '').trim();
  }

  saveMemoryData(data);
  return loadMemory();
}

export function appendMemoryLastSeen(note) {
  return setMemoryField('last_seen', null, note);
}

export function captureMissingPrimitiveAnswer(text) {
  const data = loadMemoryData();
  const missing = getMissingPrimitives(data);
  const value = String(text || '').trim();

  if (!value || missing.length === 0) {
    return { saved: false, key: null, value: null };
  }

  if (missing.includes('user_name') && looksLikePrimitiveName(value)) {
    data.primitives.user_name = value;
    saveMemoryData(data);
    return { saved: true, key: 'user_name', value };
  }

  if (missing.includes('agent_name') && looksLikePrimitiveName(value)) {
    data.primitives.agent_name = value;
    saveMemoryData(data);
    return { saved: true, key: 'agent_name', value };
  }

  if (missing.includes('interests') && looksLikeInterests(value)) {
    data.primitives.interests = value;
    saveMemoryData(data);
    return { saved: true, key: 'interests', value };
  }

  return { saved: false, key: null, value: null };
}
