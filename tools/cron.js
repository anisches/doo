import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

const SCHEDULES_PATH = path.join(os.homedir(), '.doo', 'schedules.json');

function parseInterval(str) {
  const match = String(str).match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * multipliers[unit];
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(SCHEDULES_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function save(schedules) {
  fs.mkdirSync(path.dirname(SCHEDULES_PATH), { recursive: true });
  fs.writeFileSync(SCHEDULES_PATH, JSON.stringify(schedules, null, 2), 'utf8');
}

export function addSchedule(task, interval) {
  const ms = parseInterval(interval);
  if (!ms) return `Invalid interval "${interval}". Use format like 5m, 1h, 30s, 1d.`;

  const id = randomBytes(4).toString('hex');
  const schedules = load();
  schedules.push({ id, task, interval, interval_ms: ms, next_run: Date.now() + ms });
  save(schedules);
  return `Scheduled "${task}" every ${interval}. ID: ${id}`;
}

export function removeSchedule(id) {
  const schedules = load();
  const filtered = schedules.filter((s) => s.id !== id);
  if (filtered.length === schedules.length) return `No schedule found with ID: ${id}`;
  save(filtered);
  return `Removed schedule ${id}.`;
}

export function listSchedules() {
  const schedules = load();
  if (!schedules.length) return 'No active schedules.';
  return schedules
    .map((s) => `[${s.id}] "${s.task}" every ${s.interval} — next run in ${Math.max(0, Math.round((s.next_run - Date.now()) / 1000))}s`)
    .join('\n');
}

export function getDueSchedules() {
  const now = Date.now();
  return load().filter((s) => s.next_run <= now);
}

export function bumpSchedule(id, interval_ms) {
  const schedules = load();
  const s = schedules.find((s) => s.id === id);
  if (s) s.next_run = Date.now() + interval_ms;
  save(schedules);
}
