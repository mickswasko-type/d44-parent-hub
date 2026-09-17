#!/usr/bin/env node
/**
 * Fetch every enabled source in data/sources/sources.json, normalize it, and
 * write one JSON file per source into data/events/generated/.
 *
 * Guarantees, in priority order:
 *  1. One source failing never affects another.
 *  2. A failed fetch keeps the previous good file rather than emptying it.
 *  3. Every failure is written to data/events/_sync-status.json AND makes the
 *     process exit non-zero, so a broken source is visible in GitHub Actions.
 *
 * Run it yourself with:  npm run sync
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalizeIcs } from '../normalize/ics-to-events.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT_DIR = path.join(ROOT, 'data/events/generated');
const STATUS_FILE = path.join(ROOT, 'data/events/_sync-status.json');
const FETCH_TIMEOUT_MS = 20_000;

const icsUrl = (calendarId) =>
  `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Response was not an iCalendar document');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function syncSource(source, now) {
  const outFile = path.join(OUT_DIR, `${source.id}.json`);
  try {
    const ics = await fetchWithTimeout(icsUrl(source.calendarId));
    const events = normalizeIcs(ics, source, now);

    // A feed that suddenly returns nothing is far more likely to be a broken
    // upstream than a genuinely empty school calendar. Keep what we had.
    if (events.length === 0 && existsSync(outFile)) {
      throw new Error('Feed parsed but produced 0 events; keeping previous data');
    }

    await writeFile(
      outFile,
      JSON.stringify(
        { sourceId: source.id, sourceName: source.sourceName, sourceUrl: source.sourceUrl, lastChecked: now.toISOString(), events },
        null,
        2,
      ) + '\n',
    );
    return { sourceId: source.id, sourceName: source.sourceName, ok: true, eventCount: events.length, lastChecked: now.toISOString(), error: null, servingStaleData: false };
  } catch (err) {
    const hasStale = existsSync(outFile);
    let staleCount = 0;
    let staleChecked = null;
    if (hasStale) {
      const prev = JSON.parse(await readFile(outFile, 'utf8'));
      staleCount = prev.events?.length ?? 0;
      staleChecked = prev.lastChecked ?? null;
    }
    console.error(`[sync] FAILED ${source.id}: ${err.message}${hasStale ? ' (previous data kept)' : ' (no previous data)'}`);
    return { sourceId: source.id, sourceName: source.sourceName, ok: false, eventCount: staleCount, lastChecked: staleChecked, error: err.message, servingStaleData: hasStale };
  }
}

async function main() {
  const now = new Date();
  await mkdir(OUT_DIR, { recursive: true });
  const registry = JSON.parse(await readFile(path.join(ROOT, 'data/sources/sources.json'), 'utf8'));
  const enabled = registry.sources.filter((s) => s.enabled);

  console.log(`[sync] ${enabled.length} enabled source(s) of ${registry.sources.length}`);
  const statuses = await Promise.all(enabled.map((s) => syncSource(s, now)));

  // Drop status rows for sources that were disabled and whose files are gone.
  const present = new Set((await readdir(OUT_DIR)).map((f) => f.replace(/\.json$/, '')));
  const kept = statuses.filter((s) => present.has(s.sourceId) || !s.ok);

  await writeFile(STATUS_FILE, JSON.stringify({ ranAt: now.toISOString(), statuses: kept }, null, 2) + '\n');

  for (const s of kept) {
    console.log(`[sync] ${s.ok ? 'ok  ' : 'FAIL'} ${s.sourceId.padEnd(14)} ${String(s.eventCount).padStart(5)} events`);
  }

  const failed = kept.filter((s) => !s.ok);
  if (failed.length) {
    console.error(`\n[sync] ${failed.length} source(s) failed: ${failed.map((f) => f.sourceId).join(', ')}`);
    process.exit(1);
  }
  console.log('[sync] all sources ok');
}

main().catch((err) => {
  console.error('[sync] fatal:', err);
  process.exit(2);
});
