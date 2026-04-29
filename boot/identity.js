import { storeGet, storeSet } from '../store.js';

const MAX_ASK_DAYS = 3;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function bootIdentity() {
  const name = storeGet('identity', 'user_name');

  if (name) {
    return { section: 'identity', content: `The user's name is ${name}.` };
  }

  const askedDates = storeGet('identity', 'name_asked_dates') || [];

  if (askedDates.length >= MAX_ASK_DAYS) {
    return { section: 'identity', content: "You don't need the user's name. Don't ask for it." };
  }

  const todayStr = today();
  if (askedDates.includes(todayStr)) {
    return { section: 'identity', content: null };
  }

  storeSet('identity', 'name_asked_dates', [...askedDates, todayStr]);

  return {
    section: 'identity',
    content:
      "In your very first reply, ask the user what their name is. Just once — keep it casual, one sentence. If they tell you, immediately call set_config with key=user_name and their name. If they ignore it, change the subject, or avoid it — drop it and never bring it up again this session.",
  };
}
