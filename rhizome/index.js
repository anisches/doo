import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS } from '../tools/registry.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const PRESET_PATH = resolve(__dir, '../skills/preset.md');
const LEARNED_PATH = resolve(__dir, '../skills/learned.md');

function parseSkillsFromMd(raw) {
  return raw
    .split('\n')
    .filter((l) => l.startsWith('- **'))
    .map((l) => {
      const match = l.match(/^- \*\*(.+?)\*\*: (.+?)(?:\s+\[(.+)\])?$/);
      if (!match) return null;
      return {
        name: match[1],
        description: match[2],
        ...(match[3] ? { uses: match[3].split(', ') } : {}),
      };
    })
    .filter(Boolean);
}

async function loadPresetSkills() {
  try {
    return parseSkillsFromMd(await readFile(PRESET_PATH, 'utf8'));
  } catch {
    return [];
  }
}

async function loadLearnedSkills() {
  try {
    return parseSkillsFromMd(await readFile(LEARNED_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function rawCapabilities() {
  return TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
  }));
}

export async function learnSkill(name, description) {
  const skills = await loadLearnedSkills();
  if (skills.find((s) => s.name === name)) {
    return renderRhizome();
  }
  skills.push({ name, description });
  const lines = ['## Learned Skills', ...skills.map((s) => `- **${s.name}**: ${s.description}`)];
  await writeFile(LEARNED_PATH, lines.join('\n') + '\n', 'utf8');
  return renderRhizome();
}

export async function buildRhizome() {
  const raw = rawCapabilities();
  const preset = await loadPresetSkills();
  const learned = await loadLearnedSkills();

  return {
    raw,
    skills: { preset, learned },
  };
}

export async function renderRhizome() {
  const { raw, skills } = await buildRhizome();

  const lines = [];

  lines.push('## Raw Capabilities');
  for (const cap of raw) {
    lines.push(`- ${cap.name}: ${cap.description}`);
  }

  lines.push('');
  lines.push('## Preset Skills');
  for (const skill of skills.preset) {
    const uses = skill.uses ? ` [${skill.uses.join(', ')}]` : '';
    lines.push(`- **${skill.name}**: ${skill.description}${uses}`);
  }

  if (skills.learned.length > 0) {
    lines.push('');
    lines.push('## Learned Skills');
    for (const skill of skills.learned) {
      lines.push(`- **${skill.name}**: ${skill.description}`);
    }
  }

  return lines.join('\n');
}
