import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.doo');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  provider: 'ollama',
  model: 'qwen-a3b-32k:latest',
  ollama_model: 'qwen-a3b-32k:latest',
  ollama_host: 'http://localhost:11434',
  ollama_api_key: null,
  nvidia_model: 'mistralai/mistral-nemotron',
  nvidia_base_url: 'https://integrate.api.nvidia.com/v1',
  nvidia_api_key: null,
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
    if (this.provider === 'nvidia') {
      return this.data.nvidia_model || DEFAULTS.nvidia_model;
    }

    return this.data.ollama_model || this.data.model || DEFAULTS.model;
  }

  set model(value) {
    if (this.provider === 'nvidia') {
      this.data.nvidia_model = value;
    } else {
      this.data.ollama_model = value;
    }
    this.data.model = value;
    this.save();
  }

  get provider() {
    return process.env.DOO_PROVIDER || this.data.provider || 'ollama';
  }

  set provider(value) {
    this.data.provider = value;
    this.save();
  }

  get ollamaHost() {
    return process.env.OLLAMA_HOST || this.data.ollama_host || 'http://localhost:11434';
  }

  get ollamaApiKey() {
    return this.data.ollama_api_key || null;
  }

  get nvidiaBaseUrl() {
    return process.env.NVIDIA_BASE_URL || this.data.nvidia_base_url || 'https://integrate.api.nvidia.com/v1';
  }

  get nvidiaApiKey() {
    return process.env.NVIDIA_API_KEY || this.data.nvidia_api_key || null;
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
