import { renderRhizome } from '../rhizome/index.ts';

export async function bootRhizome() {
  const awareness = await renderRhizome();
  return { section: 'awareness', content: awareness };
}
