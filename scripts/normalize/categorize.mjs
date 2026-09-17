/**
 * Deterministic category inference. No AI, no network, no randomness.
 *
 * Rules are ordered: the first matching rule wins. Keep them boring and
 * explicit so that when a title stops matching, the fix is obvious.
 */
const RULES = [
  { category: 'no-school', match: /\b(no school|schools closed|non-attendance|institute day|school closed)\b/i },
  { category: 'early-dismissal', match: /\b(early dismissal|early release|half day|noon dismissal)\b/i },
  { category: 'conference', match: /\b(conferences?|parent[- ]teacher)\b/i },
  { category: 'deadline', match: /\b(deadline|due date|last day to|registration (opens|closes)|order by|sign[- ]?ups? (due|close)|forms? due)\b/i },
  { category: 'performance', match: /\b(concert|performance|recital|musical|showcase|art show|band|choir|orchestra)\b/i },
  { category: 'pta', match: /\b(pta|pto|parent teacher (association|organization)|booster)\b/i },
  // Deliberately narrow: a bare "meet" or "game" is usually a family event,
  // not athletics ("Meet the Teacher", "Family Game Night").
  { category: 'sports', match: /\b(vs\.?|basketball|volleyball|track meet|soccer|wrestling|cross country|baseball|softball|tournament|scrimmage)\b/i },
  { category: 'holiday', match: /\b(break|recess|vacation|holiday)\b/i },
  { category: 'meeting', match: /\b(board (of education )?meeting|meeting|committee|forum)\b/i },
];

export function categorize(title = '', description = '') {
  const haystack = `${title} ${description}`;
  for (const rule of RULES) {
    if (rule.match.test(haystack)) return rule.category;
  }
  return 'event';
}

/** Categories that change a parent's morning. These get visual priority. */
export const DISRUPTIVE = new Set(['no-school', 'early-dismissal', 'holiday']);

export const CATEGORY_LABELS = {
  'no-school': 'No school',
  'early-dismissal': 'Early dismissal',
  holiday: 'Break',
  conference: 'Conferences',
  deadline: 'Deadline',
  sports: 'Sports',
  performance: 'Performance',
  meeting: 'Meeting',
  pta: 'PTA',
  event: 'Event',
};
