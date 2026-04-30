import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MEMORY_PATH = path.join(os.homedir(), '.doo', 'memory.md');

const EMPTY = `## User\n\n## Patterns\n\n## Context\n`;

export function loadMemory() {
  try {
    return fs.readFileSync(MEMORY_PATH, 'utf8');
  } catch {
    return EMPTY;
  }
}

export function saveMemory(content) {
  fs.mkdirSync(path.dirname(MEMORY_PATH), { recursive: true });
  fs.writeFileSync(MEMORY_PATH, content, 'utf8');
}
