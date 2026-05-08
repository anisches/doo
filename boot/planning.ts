import { renderToolCatalog } from '../tools/registry.ts';

export function bootPlanning() {
  return {
    section: 'planning',
    content:
      [
        'Planning layer active.',
        'Before acting, identify the smallest useful set of tools and prefer the least complex path that can solve the task.',
        'The action planner may choose one of: answer_directly, use_web_search, use_tools, or ask_clarifying_question.',
        'If you are unsure which tools are available or relevant, use query_tools.',
        'Do not narrate the plan to the user unless they ask for it; use the plan internally to choose tools.',
        '',
        renderToolCatalog(),
      ].join('\n'),
  };
}
