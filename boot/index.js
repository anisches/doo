import { bootRhizome } from './rhizome.js';
import { bootIdentity } from './identity.js';
import { bootRemland } from './remland.js';
import { bootMemory } from './memory.js';

const BRANCHES = [
  () => bootRhizome(),
  () => bootIdentity(),
  () => bootRemland(),
  () => bootMemory(),
];

export async function boot() {
  const results = await Promise.all(BRANCHES.map((branch) => branch()));
  return results.filter((b) => b.content !== null);
}
