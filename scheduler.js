import { getDueSchedules, bumpSchedule } from './tools/cron.js';
import { buildSystemPrompt, runAgent } from './agent-core.js';
import { boot } from './boot/index.js';

const TICK_MS = 30_000;

export function startScheduler(deliver, config) {
  setInterval(async () => {
    const due = getDueSchedules();
    if (!due.length) return;

    const bootSections = await boot();
    const systemPrompt = buildSystemPrompt(bootSections);

    for (const schedule of due) {
      try {
        const history = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: schedule.task },
        ];
        const reply = await runAgent(history, config);
        await deliver(reply);
        bumpSchedule(schedule.id, schedule.interval_ms);
      } catch (err) {
        console.error(`Scheduler error for "${schedule.task}": ${err.message}`);
      }
    }
  }, TICK_MS);
}
