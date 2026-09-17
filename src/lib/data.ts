import type { HubEvent, School, ParentTask, ResourceAnswer, SyncStatus } from './types';
import schoolsDoc from '../../data/schools/schools.json';
import tasksDoc from '../../data/resources/tasks.json';
import questionsDoc from '../../data/resources/questions.json';
import manualDoc from '../../data/manual/manual-events.json';
import statusDoc from '../../data/events/_sync-status.json';

/**
 * Every generated source file is picked up automatically, so adding a source
 * means adding a row to sources.json — no code change here.
 */
const generated = import.meta.glob<{ events: HubEvent[] }>('../../data/events/generated/*.json', { eager: true });

export const schools = schoolsDoc.schools as School[];
export const tasks = tasksDoc.tasks as ParentTask[];
export const questions = questionsDoc.questions as ResourceAnswer[];
export const syncStatuses = statusDoc.statuses as SyncStatus[];
export const syncRanAt: string = statusDoc.ranAt;

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
const importedEvents = Object.values(generated).flatMap((m) => m.events);

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
