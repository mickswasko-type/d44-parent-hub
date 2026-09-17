/** The one event shape every source normalizes into. Imported and manual records are identical. */
export interface HubEvent {
  id: string;
  title: string;
  description: string | null;
  /** ISO 8601. All-day events are date-only (YYYY-MM-DD); timed events carry an offset. */
  startDate: string;
  endDate: string | null;
  allDay: boolean;
  location: string | null;
  schoolIds: string[];
  category: EventCategory;
  /** Provenance — required on every record, imported or manual. */
  sourceName: string;
  sourceUrl: string;
  sourceType: SourceType;
  lastChecked: string;
  importedAt: string;
  /** True when a human edited an imported record; sync must not overwrite it. */
  manualOverride: boolean;
  /** Surfaces in "Don't forget" instead of the ordinary event stream. */
  featured: boolean;
  /** Optional hard deadline, for action items rather than things you attend. */
  actionDeadline: string | null;
}

export type SourceType = 'ics' | 'manual' | 'html';

export type EventCategory =
  | 'no-school'
  | 'early-dismissal'
  | 'holiday'
  | 'conference'
  | 'deadline'
  | 'sports'
  | 'performance'
  | 'meeting'
  | 'pta'
  | 'event';

export interface School {
  id: string;
  name: string;
  shortName: string;
  level: 'district' | 'early-childhood' | 'elementary' | 'middle';
  isDistrict: boolean;
  website: string;
  address: string | null;
  mainPhone: string | null;
  attendancePhone: string | null;
  principal: string | null;
  calendarUrl: string | null;
  ptaUrl: string | null;
  sourceName: string;
  sourceUrl: string;
  lastChecked: string;
  /** Fields that could not be verified from an official source. Never guessed. */
  needsReview: string[];
}

/** A "I need to..." shortcut. Always points at the authoritative official destination. */
export interface ParentTask {
  id: string;
  label: string;
  intent: string;
  icon: string;
  url: string;
  /** Per-school override, e.g. an attendance line that differs by building. */
  perSchool?: Record<string, string>;
  sourceName: string;
  sourceUrl: string;
  lastChecked: string;
  primary: boolean;
}

export interface ResourceAnswer {
  id: string;
  question: string;
  answer: string;
  links: { label: string; url: string }[];
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  lastChecked: string;
}

export interface SyncStatus {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  eventCount: number;
  lastChecked: string;
  /** Set when the most recent run failed and stale-but-valid data was kept. */
  error: string | null;
  servingStaleData: boolean;
}
