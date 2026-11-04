/* What each demo course teaches, as modules. Invented for the demo. The lesson counts add up to the course's own total,
   so the numbers a buyer sees on the card and in the curriculum always agree. */
const MODULES = {
  'data-foundations': ['Think in tables', 'Clean the mess', 'Shape your data', 'Find the pattern', 'Tell the story'],
  'sql-that-works': [
    'Your first query',
    'Filter and sort',
    'Join the dots',
    'Group and count',
    'Make it fast',
    'Ship a report',
  ],
  'dashboards-that-decide': [
    'Start from the decision',
    'Pick the right chart',
    'Layouts that read fast',
    'Make it live',
    'Present it',
  ],
  'ai-for-work': ['How AI thinks', 'Write with AI', 'Research with AI', 'Plan your week', 'Stay in control'],
  'prompt-craft': ['The anatomy of a prompt', 'Context and examples', 'Format and tone', 'Test and improve'],
  'build-with-llms': [
    'Models and their limits',
    'Your first feature',
    'Tools and functions',
    'Retrieval',
    'Evaluate',
    'Ship it safely',
  ],
  'automate-without-code': [
    'Spot the busywork',
    'Triggers and actions',
    'Connect your tools',
    'Handle errors',
    'Run it every day',
  ],
  'agents-in-practice': [
    'What an agent is',
    'Give it tools',
    'Set the guardrails',
    'Memory and state',
    'Review and trust',
  ],
}

const FALLBACK = ['Getting started', 'Core skills', 'In practice', 'Next steps']

/* [{ id, title, lessons }] for a course { slug, lessons }. */
export function curriculumFor({ slug, lessons }) {
  const titles = MODULES[slug] ?? FALLBACK
  const base = Math.floor(lessons / titles.length)
  const extra = lessons % titles.length
  return titles.map((title, index) => ({ id: `m${index + 1}`, title, lessons: base + (index < extra ? 1 : 0) }))
}
