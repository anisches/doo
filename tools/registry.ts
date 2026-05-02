import { search } from './web-search.ts';
import { readFile, writeFile, editFile } from './file-ops.ts';
import { callOllama } from './ollama.ts';
import { runCommand } from './shell.ts';
import { addSchedule, removeSchedule, listSchedules } from './cron.ts';
import { renderRhizome, learnSkill } from '../rhizome/index.ts';
import { setMemoryField } from '../memory/index.ts';

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        "Search the web for current information, news, documentation, or anything that may not be in the model's training data.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command on this machine and return the output.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'call_ollama',
      description: 'Call any Ollama API endpoint directly (e.g. /tags to list models, /show to inspect a model, /pull to download one).',
      parameters: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', description: 'API path, e.g. /tags or /show' },
          method: { type: 'string', description: 'HTTP method, default GET', enum: ['GET', 'POST', 'DELETE'] },
          body: { type: 'object', description: 'Request body for POST requests' },
        },
        required: ['endpoint'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'switch_model',
      description: 'Switch the active Ollama model when the user asks to change or use a different model.',
      parameters: {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            description: 'Ollama model name, e.g. llama3.2, mistral, gemma3',
          },
        },
        required: ['model'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file from the filesystem.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file, creating it if it does not exist or overwriting it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace an exact string inside a file with new text.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          old_str: { type: 'string', description: 'Exact string to find and replace' },
          new_str: { type: 'string', description: 'Replacement string' },
        },
        required: ['path', 'old_str', 'new_str'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'learn_skill',
      description: 'Persist a newly discovered skill so the agent remembers it across sessions. Returns the updated rhizome immediately.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short skill name' },
          description: { type: 'string', description: 'What this skill does' },
        },
        required: ['name', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_rhizome',
      description: 'Get a live snapshot of what this agent can currently do — raw tools, preset skills, and learned skills.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule',
      description: 'Schedule a recurring task. The agent will perform the task at the given interval automatically.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'What to do, e.g. "say hi" or "check disk space"' },
          interval: { type: 'string', description: 'How often: e.g. 5m, 1h, 30s, 1d' },
        },
        required: ['task', 'interval'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unschedule',
      description: 'Remove a scheduled task by its ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Schedule ID returned when the task was created' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_schedules',
      description: 'List all active scheduled tasks.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_config',
      description:
        'Save a configuration value or primitive memory field. Use this when the user wants to set an API key, change the Ollama host URL, or store a required memory primitive. Known keys: ollama_api_key, ollama_host, user_name, agent_name, interests.',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Config key, e.g. ollama_api_key or ollama_host',
          },
          value: {
            type: 'string',
            description: 'The value to store',
          },
        },
        required: ['key', 'value'],
      },
    },
  },
];

export async function dispatch(name, args, config) {
  if (name === 'web_search') {
    return search(args.query, config);
  }

  if (name === 'run_command') {
    return runCommand(args.command);
  }

  if (name === 'call_ollama') {
    return callOllama(args.endpoint, args.method || 'GET', args.body || null, config);
  }

  if (name === 'switch_model') {
    config.model = args.model;
    return `Model switched to ${args.model}.`;
  }

  if (name === 'read_file') {
    return readFile(args.path);
  }

  if (name === 'write_file') {
    return writeFile(args.path, args.content);
  }

  if (name === 'edit_file') {
    return editFile(args.path, args.old_str, args.new_str);
  }

  if (name === 'learn_skill') {
    return learnSkill(args.name, args.description);
  }

  if (name === 'query_rhizome') {
    return renderRhizome();
  }

  if (name === 'schedule') {
    return addSchedule(args.task, args.interval);
  }

  if (name === 'unschedule') {
    return removeSchedule(args.id);
  }

  if (name === 'list_schedules') {
    return listSchedules();
  }

  if (name === 'set_config') {
    if (args.key === 'user_name' || args.key === 'agent_name' || args.key === 'interests') {
      setMemoryField('primitives', args.key, args.value);
    } else {
      config.set(args.key, args.value);
    }
    return `Saved ${args.key}.`;
  }

  return `Unknown tool: ${name}`;
}
