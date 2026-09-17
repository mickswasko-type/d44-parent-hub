import type { HubEvent, School, ParentTask, ResourceAnswer, SyncStatus } from './types';
import schoolsDoc from '../../data/schools/schools.json';
import tasksDoc from '../../data/resources/tasks.json';
import questionsDoc from '../../data/resources/questions.json';
import manualDoc from '../../data/manual/manual-events.json';
import statusDoc from '../../data/events/_sync-status.json';
import sourcesDoc from '../../data/sources/sources.json';

/**
 * Every generated source file is picked up automatically, so adding a source
 * means adding a row to sources.json — no code change here.
 */
const generated = import.meta.glob<{ lastChecked: string; events: HubEvent[] }>(
  '../../data/events/generated/*.json',
  { eager: true },
);

export const schools = schoolsDoc.schools as School[];
export const tasks = tasksDoc.tasks as ParentTask[];
export const questions = questionsDoc.questions as ResourceAnswer[];
export const syncStatuses = statusDoc.statuses as SyncStatus[];
export const syncRanAt: string = statusDoc.ranAt;
export const sources = sourcesDoc.sources;

/** The sync result for a school's own calendar feed, if it has one. */
export function sourceStatusForSchool(schoolId: string): SyncStatus | undefined {
  const source = sources.find((s) => s.enabled && s.schoolIds.includes(schoolId) && schoolId !== 'district');
  return source ? syncStatuses.find((st) => st.sourceId === source.id) : undefined;
}

export const schoolsById = new Map(schools.map((s) => [s.id, s]));
export const selectableSchools = schools.filter((s) => !s.isDistrict);

function dedupe(events: HubEvent[]): HubEvent[] {
  // A manual record always wins over an imported one with the same id, so a
  // human correction survives the next sync.
  const byId = new Map<string, HubEvent>();
  for (const e of events) {
    const existing = byId.get(e.id);
    if (!existing || (e.manualOverride && !existing.manualOverride)) byId.set(e.id, e);
  }
  return [...byId.values()];
}

const manualEvents = manualDoc.events as HubEvent[];
// `lastChecked` is stored once per file rather than on every record, so that a
// sync with no upstream changes produces a one-line diff. The UI still shows it
// per card, so it is stamped back on here.
const importedEvents = Object.values(generated).flatMap((file) =>
  file.events.map((event) => ({ ...event, lastChecked: file.lastChecked })),
);

export const allEvents: HubEvent[] = dedupe([...importedEvents, ...manualEvents]).sort(
  (a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title),
);

/** An event is relevant to a school if it names that school, or is district-wide. */
export function isRelevant(event: HubEvent, selected: string[]): boolean {
  if (selected.length === 0) return true;
  return event.schoolIds.some((id) => id === 'district' || selected.includes(id));
}

export function eventsForSchool(schoolId: string): HubEvent[] {
  return allEvents.filter((e) => e.schoolIds.includes(schoolId));
}

export function upcomingFrom(today: string, events: HubEvent[] = allEvents): HubEvent[] {
  return events.filter((e) => (e.endDate?.slice(0, 10) ?? e.startDate.slice(0, 10)) >= today);
}

export const schoolLabel = (id: string): string => schoolsById.get(id)?.shortName ?? id;

/** Extra names a school is known by in calendar titles. */
const SCHOOL_ALIASES: Record<string, string[]> = {
  gw: ['gwms'],
  ec: ['jsecc'],
};

/**
 * A normalized title used only for duplicate detection. The district prefixes
 * per-school events with the school name ("Hammerschmidt PTA Meeting") while
 * the school's own feed does not ("PTA Meeting - LRC"), so the prefix is
 * stripped before comparing.
 */
export function titleKeyFor(event: HubEvent): string {
  const flatten = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let key = flatten(event.title);

  const names = event.schoolIds
    .filter((id) => id !== 'district')
    .flatMap((id) => {
      const school = schoolsById.get(id);
      if (!school) return [];
      return [
        school.shortName,
        school.name.replace(/ (Elementary|Middle) School$/, ''),
        ...(SCHOOL_ALIASES[id] ?? []),
      ];
    })
    .map(flatten)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const name of names) {
    if (key.startsWith(name + ' ')) { key = key.slice(name.length).trim(); break; }
  }
  return key.slice(0, 48);
}
