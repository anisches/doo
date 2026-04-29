import { renderRhizome } from '../rhizome/index.js';

export async function bootRhizome() {
  const awareness = await renderRhizome();
  return { section: 'awareness', content: awareness };
}
