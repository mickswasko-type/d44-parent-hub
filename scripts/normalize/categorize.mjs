/**
 * Deterministic category inference. No AI, no network, no randomness.
 *
 * Rules are ordered: the first matching rule wins. Keep them boring and
 * explicit so that when a title stops matching, the fix is obvious.
 */
const RULES = [
  // Half days say "No School PM" and would otherwise be read as a full day off
  // — which, next to a Monday holiday, invents a long weekend that isn't one.
  { category: 'early-dismissal', match: /\b(no school pm|pm only|1\/2 day|½ day|half[- ]day)\b|\bno school pm\b|\b1\/2 school improvement\b/i },
  { category: 'no-school', match: /\b(no school|schools closed|non-attendance|institute day|school closed)\b/i },
  { category: 'early-dismissal', match: /\b(early dismissal|early release|half day|noon dismissal)\b/i },
  { category: 'conference', match: /\b(conferences?|parent[- ]teacher)\b/i },
  { category: 'deadline', match: /\b(deadline|due date|last day to|registration (opens|closes)|order by|sign[- ]?ups? (due|close)|forms? due)\b/i },
  { category: 'performance', match: /\b(concert|performance|recital|musical|showcase|art show|band|choir|orchestra)\b/i },
  { category: 'pta', match: /\b(pta|pto|parent teacher (association|organization)|booster)\b/i },
  // Dress-up days borrow sports words ("Bears vs. Packers colors") but are not
  // games. Claim them before the sports rule sees the "vs".
  { category: 'event', match: /\b(spirit (days?|weeks?)|dress[- ]?(up|down)|pajama|crazy hair|hat day|colou?rs? day)\b/i },
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

/**
 * Does this event require a parent to *do* something beforehand — send money,
 * sign a slip, dress the child a particular way — as opposed to simply
 * happening?
 *
 * Deliberately says only "plan ahead" rather than naming the action. A rule
 * that guessed "send money" would be wrong for a free dress-down day, and a
 * confidently wrong instruction is worse than a vague correct one. The event
 * title is shown right next to the badge and says the rest.
 *
 * Kept separate from `category` on purpose: a book fair is still a PTA event,
 * and picture day is still an ordinary event. This is an extra axis.
 */
const ACTION_RULES = [
  /\bpicture (day|retake)/i,
  /\bretakes?\b/i,
  /\bbook fair\b/i,
  /\bfield trip\b/i,
  /\b(permission|consent) (slip|form)/i,
  /\b(pajama|pyjama|crazy hair|hat day|dress[- ]?(up|down)|spirit (days?|weeks?)|wear|costume|twin day|colou?rs? day)\b/i,
  /\b(food|coat|clothing|toy|book|supply) drive\b/i,
  /\bdonation|canned goods\b/i,
  /\b(fun ?run|walk[- ]?a[- ]?thon|track[- ]?a[- ]?thon|read[- ]?a[- ]?thon|jog[- ]?a[- ]?thon|fundraiser)\b/i,
  /\b(sign[- ]?ups?|rsvp|register|registration|order)\b/i,
  /\b(forms?|money|payment|slip)s? (due|required)\b/i,
  /\b(bring|send in|turn in|drop off|due)\b/i,
  /\bconferences?\b/i,
];

export function needsAction(title = '', description = '') {
  const haystack = `${title} ${description}`;
  return ACTION_RULES.some((rule) => rule.test(haystack));
}
