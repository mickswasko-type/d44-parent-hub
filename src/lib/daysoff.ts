import type { HubEvent } from './types';
import { allEvents, schoolsById } from './data';
import { addDays, dateOf, weekdayOf } from './dates';

/**
 * One entry per school day that is off or ends early, for the rest of the
 * school year, with the schools it applies to. The browser groups these into
 * runs ("5 days in a row") for whichever schools the parent picked; this file
 * only gathers the facts.
 */
export interface PlannerDay {
  date: string;
  kind: 'off' | 'early';
  /** schoolId → what that school calls the day. 'district' means every school. */
  labels: Record<string, string>;
  /** Dismissal time if any source states one, e.g. "1:15pm". */
  time: string | null;
}

const OFF = new Set(['no-school', 'holiday']);

/** "No School- Institute Day" → "Institute Day". "No School-Non Attendance Day" → "". */
export function tidyDayLabel(title: string): string {
  return title
    .replace(/^\s*no\s*school\s*[-–:]?\s*/i, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(non[- ]?attendance day)\b/i, '')
    .replace(/[!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The last time in a title — "School Hours 8:35-1:15" and "Dismissal @1:15pm" both give 1:15pm. */
function dismissalTime(title: string): string | null {
  const times = [...title.matchAll(/\b(\d{1,2}):(\d{2})\s*(am|pm)?/gi)];
  if (!times.length) return null;
  const [, h, m, ampm] = times[times.length - 1];
  const hour = Number(h);
  // School ends in the afternoon; a bare "1:15" means 1:15pm.
  const suffix = ampm ? ampm.toLowerCase() : hour >= 7 && hour < 12 ? 'am' : 'pm';
  return `${hour}:${m}${suffix}`;
}

/**
 * The expected last day, and the latest it could fall if emergency days are
 * used. Both are read from the district's own "Last Day of School" entries.
 */
export function schoolYearEnd(today: string): { lastDay: string | null; latest: string | null } {
  const candidates = allEvents
    .filter((e) => /last day of (school|student attendance)/i.test(e.title))
    .map((e) => dateOf(e.startDate))
    .filter((d) => d >= today)
    .sort();
  return { lastDay: candidates[0] ?? null, latest: candidates[candidates.length - 1] ?? null };
}

export function plannerDays(today: string): { days: PlannerDay[]; lastDay: string | null; latest: string | null } {
  const { lastDay, latest } = schoolYearEnd(today);
  const until = lastDay ?? addDays(today, 300);
  const byKey = new Map<string, PlannerDay>();

  const relevant = allEvents.filter((e: HubEvent) => OFF.has(e.category) || e.category === 'early-dismissal');

  for (const e of relevant) {
    const kind: PlannerDay['kind'] = OFF.has(e.category) ? 'off' : 'early';
    const first = dateOf(e.startDate);
    const last = dateOf(e.endDate ?? e.startDate);
    for (let d = first; d <= last; d = addDays(d, 1)) {
      if (d < today || d > until) continue;
      const dow = weekdayOf(d);
      if (dow === 0 || dow === 6) continue;
      const key = `${d}|${kind}`;
      const day = byKey.get(key) ?? { date: d, kind, labels: {}, time: null };
      for (const id of e.schoolIds) {
        if (!schoolsById.has(id)) continue;
        const label = kind === 'off' ? tidyDayLabel(e.title) : 'Early dismissal';
        // Prefer the more descriptive name when two sources name the same day.
        if (!day.labels[id] || label.length > day.labels[id].length) day.labels[id] = label;
      }
      if (kind === 'early') day.time = day.time ?? dismissalTime(e.title);
      byKey.set(key, day);
    }
  }

  // A school that is closed all day is not also "dismissed early" that day.
  for (const day of byKey.values()) {
    if (day.kind !== 'early') continue;
    const off = byKey.get(`${day.date}|off`);
    if (!off) continue;
    const closedAll = 'district' in off.labels;
    for (const id of Object.keys(day.labels)) if (closedAll || id in off.labels) delete day.labels[id];
    if (!Object.keys(day.labels).length) byKey.delete(`${day.date}|early`);
  }

  const days = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  return { days, lastDay, latest };
}
