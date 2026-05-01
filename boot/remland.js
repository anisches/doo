import { loadLatestRemlandReview, loadRemlandBootState, saveRemlandBootState, digestRemlandReview } from '../remland/index.js';

export function bootRemland() {
  const content = loadLatestRemlandReview();
  if (!content.trim()) {
    return { section: 'remland', content: null };
  }

  const digest = digestRemlandReview(content);
  const state = loadRemlandBootState();
  if (state.lastDigest === digest) {
    return { section: 'remland', content: null };
  }

  saveRemlandBootState({
    lastDigest: digest,
    seenAt: new Date().toISOString(),
  });

  return {
    section: 'remland',
    content: `<!-- remland -->\n${content}\n<!-- end remland -->`,
  };
}
