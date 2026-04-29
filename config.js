import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.doo');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  model: 'qwen-a3b-32k:latest',
  ollama_host: 'http://localhost:11434',
  ollama_api_key: null,
};

export class Config {
  constructor() {
    this.data = this.load();
  }

  load() {
    if (!fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULTS };
    }

    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const saved = JSON.parse(raw);
      return { ...DEFAULTS, ...saved };
    } catch {
      return { ...DEFAULTS };
    }
  }

  save() {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.data, null, 2) + '\n', 'utf8');
  }

  get model() {
    return this.data.model;
  }

  set model(value) {
    this.data.model = value;
    this.save();
  }

  get ollamaHost() {
    return process.env.OLLAMA_HOST || this.data.ollama_host || 'http://localhost:11434';
  }

  get ollamaApiKey() {
    return this.data.ollama_api_key || null;
  }

  get telegramBotToken() {
    return process.env.TELEGRAM_BOT_TOKEN || null;
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  get(key) {
    return this.data[key];
  }
}
