import { bootRhizome } from './rhizome.js';
import { bootIdentity } from './identity.js';

const BRANCHES = [
  () => bootRhizome(),
  () => bootIdentity(),
];

export async function boot() {
  const results = await Promise.all(BRANCHES.map((branch) => branch()));
  return results.filter((b) => b.content !== null);
}
