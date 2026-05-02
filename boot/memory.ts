import { loadMemory } from '../memory/index.ts';

export function bootMemory() {
  const content = loadMemory();
  const isEmpty = !content.replace(/##\s*\w+/g, '').trim();
  if (isEmpty) return { section: 'memory', content: null };
  return { section: 'memory', content: `<!-- memory -->\n${content}\n<!-- end memory -->` };
}
