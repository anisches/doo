import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const STORE_DIR = path.join(os.homedir(), '.doo');

function filePath(name) {
  return path.join(STORE_DIR, `${name}.json`);
}

function ensure() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

export function storeGet(name, key) {
  try {
    const raw = fs.readFileSync(filePath(name), 'utf8');
    return JSON.parse(raw)[key] ?? null;
  } catch {
    return null;
  }
}

export function storeSet(name, key, value) {
  ensure();
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch {}
  data[key] = value;
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2) + '\n', 'utf8');
}
