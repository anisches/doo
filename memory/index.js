import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MEMORY_PATH = path.join(os.homedir(), '.doo', 'memory.md');

const SECTION_ORDER = ['primitives', 'preferences', 'context', 'last_seen'];

const EMPTY_DATA = () => ({
  primitives: {},
  preferences: {},
  context: {},
  last_seen: [],
});

const DEFAULT_AGENT_NAMES = [
  'Crumb',
  'Echo',
  'Mote',
  'Spark',
  'Nib',
  'Twig',
  'Rune',
];

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

    if (section === 'context' && key === 'primitive_ask_count') {
      data.context.primitive_ask_count = Number.parseInt(value, 10) || 0;
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

export function getPrimitiveAskCount(data = loadMemoryData()) {
  return Number.parseInt(data?.context?.primitive_ask_count, 10) || 0;
}

export function incrementPrimitiveAskCount() {
  const data = loadMemoryData();
  const next = getPrimitiveAskCount(data) + 1;
  data.context.primitive_ask_count = next;
  saveMemoryData(data);
  return next;
}

export function resetPrimitiveAskCount() {
  const data = loadMemoryData();
  data.context.primitive_ask_count = 0;
  saveMemoryData(data);
  return 0;
}

export function chooseAgentName(existing = '') {
  const current = String(existing || '').trim();
  if (current) {
    return current;
  }

  const idx = Math.floor(Math.random() * DEFAULT_AGENT_NAMES.length);
  return DEFAULT_AGENT_NAMES[idx];
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
