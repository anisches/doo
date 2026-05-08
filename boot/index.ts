import { bootRhizome } from './rhizome.ts';
import { bootIdentity } from './identity.ts';
import { bootPlanning } from './planning.ts';
import { bootMemory } from './memory.ts';

const BRANCHES = [
  () => bootIdentity(),
  () => bootPlanning(),
  () => bootRhizome(),
  () => bootMemory(),
];

export async function boot() {
  const results = await Promise.all(BRANCHES.map((branch) => branch()));
  return results.filter((b) => b.content !== null);
}
