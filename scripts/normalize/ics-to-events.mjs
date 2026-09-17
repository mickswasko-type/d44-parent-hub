import ICAL from 'ical.js';
import { categorize } from './categorize.mjs';
import { inferSchoolIds } from './school-affinity.mjs';
import { createHash } from 'node:crypto';

/** How far back and forward to materialize events. Keeps recurring series bounded. */
export const WINDOW_BACK_DAYS = 30;
export const WINDOW_FORWARD_DAYS = 400;
const MAX_OCCURRENCES_PER_SERIES = 400;

const isoDate = (d) => d.toISOString().slice(0, 10);

/**
 * Convert an ICS document into normalized HubEvent records.
 * Pure: same input + same `now` always produces the same output.
 */
export function normalizeIcs(icsText, source, now = new Date()) {
  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const windowStart = new Date(now.getTime() - WINDOW_BACK_DAYS * 864e5);
  const windowEnd = new Date(now.getTime() + WINDOW_FORWARD_DAYS * 864e5);
  const checkedAt = now.toISOString();

  const vevents = comp.getAllSubcomponents('vevent');

  // A moved or edited occurrence of a recurring series appears twice in the
  // feed: once as a VEVENT carrying RECURRENCE-ID, and once inside its master
  // series. ical.js folds the override into the master when both are present,
  // so processing the standalone copy as well would duplicate the event.
  const masterUids = new Set(
    vevents.filter((v) => !v.getFirstPropertyValue('recurrence-id')).map((v) => v.getFirstPropertyValue('uid')),
  );

  const events = [];
  for (const vevent of vevents) {
    if ((vevent.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') continue;
    if (vevent.getFirstPropertyValue('recurrence-id') && masterUids.has(vevent.getFirstPropertyValue('uid'))) continue;

    const event = new ICAL.Event(vevent);
    if (!event.startDate) continue;

    const occurrences = event.isRecurring()
      ? expandRecurring(event, windowStart, windowEnd)
      : [{ startDate: event.startDate, endDate: event.endDate }];

    for (const occ of occurrences) {
      const start = occ.startDate.toJSDate();
      if (start < windowStart || start > windowEnd) continue;
      events.push(toHubEvent(event, occ, source, checkedAt));
    }
  }

  // Belt and braces: ids are content-derived, so an exact id collision is an
  // exact duplicate. Upstream calendars do occasionally contain them.
  const byId = new Map();
  for (const e of events) if (!byId.has(e.id)) byId.set(e.id, e);
  const unique = [...byId.values()];

  // Stable ordering keeps generated JSON diffs readable in git.
  unique.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
  return unique;
}

function expandRecurring(event, windowStart, windowEnd) {
  const out = [];
  const iterator = event.iterator();
  let next;
  let guard = 0;
  while ((next = iterator.next()) && guard++ < MAX_OCCURRENCES_PER_SERIES) {
    const jsDate = next.toJSDate();
    if (jsDate > windowEnd) break;
    if (jsDate < windowStart) continue;
    const detail = event.getOccurrenceDetails(next);
    out.push({ startDate: detail.startDate, endDate: detail.endDate });
  }
  return out;
}

function toHubEvent(event, occ, source, checkedAt) {
  const allDay = occ.startDate.isDate;
  const startJs = occ.startDate.toJSDate();
  const endJs = occ.endDate ? occ.endDate.toJSDate() : null;

  // ICS all-day DTEND is exclusive. Store an inclusive end so the UI never
  // shows a break running one day longer than it does.
  const endDate = !endJs
    ? null
    : allDay
      ? isoDate(new Date(endJs.getTime() - 864e5))
      : endJs.toISOString();

  const title = (event.summary || 'Untitled event').trim();
  const description = event.description ? event.description.trim() : null;

  return {
    id: stableId(source.id, event.uid, startJs.toISOString()),
    title,
    description,
    startDate: allDay ? isoDate(startJs) : startJs.toISOString(),
    endDate,
    allDay,
    location: event.location ? event.location.trim() : null,
    schoolIds: inferSchoolIds(title, source.schoolIds),
    category: categorize(title, description || ''),
    sourceId: source.id,
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    sourceType: 'ics',
    lastChecked: checkedAt,
    importedAt: checkedAt,
    manualOverride: false,
    featured: false,
    actionDeadline: null,
  };
}

function stableId(sourceId, uid, startIso) {
  return `${sourceId}-${createHash('sha1').update(`${uid}|${startIso}`).digest('hex').slice(0, 12)}`;
}
