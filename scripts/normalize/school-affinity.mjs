/**
 * The district calendar mixes district-wide events with per-school ones, and
 * marks the latter by putting the school name in the title
 * ("Madison Picture Day", "Hammerschmidt PTA Meeting").
 *
 * This maps such a title back to a school id so personalization works before
 * the per-school feeds are enabled. It is deliberately conservative: a title
 * that matches zero schools, or more than one, stays district-wide. Guessing
 * wrong is worse than being generic.
 */
const SCHOOL_PATTERNS = [
  { id: 'bf', match: /\bbutterfield\b/i },
  { id: 'gw', match: /\b(glenn ?westlake|gwms)\b/i },
  { id: 'wh', match: /\bhammerschmidt\b/i },
  { id: 'ec', match: /\b(jsecc|john schroder|early childhood)\b/i },
  { id: 'md', match: /\bmadison\b/i },
  { id: 'mh', match: /\bmanor hill\b/i },
  { id: 'pv', match: /\bpark ?view\b/i },
  { id: 'pl', match: /\bpleasant lane\b/i },
];

/** Titles that mention a street/building rather than the school itself. */
const FALSE_POSITIVES = [/\b150 w\.? madison\b/i, /\bmadison (street|st\.?)\b/i];

export function inferSchoolIds(title, fallbackIds) {
  if (FALSE_POSITIVES.some((p) => p.test(title))) return fallbackIds;
  const hits = SCHOOL_PATTERNS.filter((p) => p.match.test(title)).map((p) => p.id);
  return hits.length === 1 ? hits : fallbackIds;
}
