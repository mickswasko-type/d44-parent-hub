import type { HubEvent } from './types';

const stamp = (iso: string, allDay: boolean): string =>
  allDay ? iso.slice(0, 10).replace(/-/g, '') : `${iso.replace(/[-:]/g, '').slice(0, 15)}Z`;

const esc = (s: string): string => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

/**
 * A single-event .ics file as a data: URL, so "Add to calendar" works with no
 * server, no tracking and no third party in the middle.
 */
export function icsDataUrl(event: HubEvent): string {
  const dt = event.allDay ? ';VALUE=DATE' : '';
  const end = event.endDate ?? event.startDate;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//D44 Parent Hub//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@d44-parent-hub`,
    `DTSTAMP:${stamp(new Date().toISOString(), false)}`,
    `DTSTART${dt}:${stamp(event.startDate, event.allDay)}`,
    `DTEND${dt}:${stamp(event.allDay ? addOneDay(end) : end, event.allDay)}`,
    `SUMMARY:${esc(event.title)}`,
    event.location ? `LOCATION:${esc(event.location)}` : null,
    `DESCRIPTION:${esc([event.description, `Source: ${event.sourceName} — ${event.sourceUrl}`].filter(Boolean).join('\n\n'))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}

/** ICS all-day DTEND is exclusive, so put it back before writing the file. */
function addOneDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const icsFileName = (event: HubEvent): string =>
  `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}.ics`;
