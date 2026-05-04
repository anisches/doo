import {
  getMissingPrimitives,
  loadMemoryData,
} from '../memory/index.ts';

function renderKnownPrimitiveLabels(data) {
  const primitives = data?.primitives || {};
  const labels = [];

  if (primitives.user_name) labels.push(`user_name=${primitives.user_name}`);
  if (primitives.agent_name) labels.push(`agent_name=${primitives.agent_name}`);
  if (primitives.interests) labels.push(`interests=${primitives.interests}`);

  return labels;
}

export async function bootIdentity() {
  const data = loadMemoryData();
  const missing = getMissingPrimitives(data);

  if (missing.length === 0) {
    const labels = renderKnownPrimitiveLabels(data);
    return {
      section: 'identity',
      content: `Primitive memory loaded: ${labels.join('; ')}.`,
    };
  }

  const askFor = missing
    .map((key) => {
      if (key === 'user_name') return 'how you would like to be addressed';
      if (key === 'agent_name') return 'what you want to call me';
      if (key === 'interests') return 'your primary interests';
      return key;
    })
    .join(', ');

  return {
    section: 'identity',
    content:
      `Before anything else, ask the user for the missing primitive memory fields: ${askFor}. Keep it to one short casual sentence. Do not answer the user's task yet. If the user ignores the question or asks something else, keep the missing primitive memory in view and ask again on the next turn. Keep this reminder active until the missing primitives are actually saved. Once they answer, save the values into memory and continue.`,
  };
}
