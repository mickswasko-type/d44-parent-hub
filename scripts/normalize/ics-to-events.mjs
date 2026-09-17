import ICAL from 'ical.js';
import { categorize } from './categorize.mjs';
import { inferSchoolIds } from './school-affinity.mjs';
import { createHash } from 'node:crypto';

/** How far back and forward to materialize events. Keeps recurring series bounded. */
export const WINDOW_BACK_DAYS = 30;
export const WINDOW_FORWARD_DAYS = 400;
const MAX_OCCURRENCES_PER_SERIES = 400;


/**
 * Convert an ICS document into normalized HubEvent records.
 * Pure: same input + same `now` always produces the same output.
 */
export function normalizeIcs(icsText, source, now = new Date()) {
  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const windowStart = new Date(now.getTime() - WINDOW_BACK_DAYS * 864e5);
  const windowEnd = new Date(now.getTime() + WINDOW_FORWARD_DAYS * 864e5);
  const importedAt = now.toISOString();

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
      events.push(toHubEvent(event, occ, source, importedAt));
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

/**
 * A timezone-independent string for an ICS time value.
 *
 * `toJSDate()` on an all-day value returns *local* midnight, so its ISO form
 * differs between a laptop in Chicago and a GitHub runner in UTC. That silently
 * rewrote every event id on each sync and could shift a date across the day
 * boundary in eastern timezones. All-day values therefore use the calendar
 * date as written; timed values are absolute instants and are safe.
 */
function canonicalStamp(time) {
  if (!time) return null;
  if (time.isDate) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
  }
  return time.toJSDate().toISOString();
}

/** Subtract a day from a YYYY-MM-DD string without going through local time. */
function previousDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

function toHubEvent(event, occ, source, importedAt) {
  const allDay = occ.startDate.isDate;
  const startDate = canonicalStamp(occ.startDate);
  const rawEnd = canonicalStamp(occ.endDate);

  // ICS all-day DTEND is exclusive. Store an inclusive end so the UI never
  // shows a break running one day longer than it does.
  const endDate = !rawEnd ? null : allDay ? previousDay(rawEnd) : rawEnd;

  const title = (event.summary || 'Untitled event').trim();
  const description = event.description ? event.description.trim() : null;

  return {
    id: stableId(source.id, event.uid, startDate),
    title,
    description,
    startDate,
    endDate,
    allDay,
    location: event.location ? event.location.trim() : null,
    schoolIds: inferSchoolIds(title, source.schoolIds),
    category: categorize(title, description || ''),
    sourceId: source.id,
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    sourceType: 'ics',
    // `lastChecked` lives on the file, not on every record: stamping each
    // event would rewrite the whole file on every sync and bury real changes.
    importedAt,
    manualOverride: false,
    featured: false,
    actionDeadline: null,
  };
}

function stableId(sourceId, uid, startIso) {
  return `${sourceId}-${createHash('sha1').update(`${uid}|${startIso}`).digest('hex').slice(0, 12)}`;
}
