#!/usr/bin/env node
/**
 * For each enabled newsletter in data/sources/newsletters.json:
 *   1. read the school's public ParentSquare widget and find the newest issue,
 *   2. summarise it by rule (scripts/normalize/newsletter.mjs),
 *   3. write the digest to data/newsletters/<id>.json, and
 *   4. write any dates the school calendar does NOT already have to
 *      data/events/generated/<id>.json, so they join the calendar like any
 *      other source.
 *
 * Runs after the calendar sync, because step 4 compares against it.
 * Same guarantees as the calendar sync: one newsletter failing never affects
 * another, a failure keeps the previous good files, and it exits non-zero.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseWidget, buildDigest, containsPersonalContact } from '../normalize/newsletter.mjs';
import { categorize, needsAction } from '../normalize/categorize.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIGEST_DIR = path.join(ROOT, 'data/newsletters');
const EVENTS_DIR = path.join(ROOT, 'data/events/generated');
const STATUS_FILE = path.join(DIGEST_DIR, '_status.json');

const chicago = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
});
const localDate = (iso) => (iso.length <= 10 ? iso : chicago.format(new Date(iso)));

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (/\/signin\b/.test(res.url)) throw new Error(`Redirected to sign-in: ${url} is no longer public`);
  return res.text();
}

async function calendarEventsFor(schoolId) {
  const files = [`${schoolId}-calendar.json`, 'd44-district.json'];
  const out = [];
  for (const f of files) {
    const p = path.join(EVENTS_DIR, f);
    if (!existsSync(p)) continue;
    const doc = JSON.parse(await readFile(p, 'utf8'));
    out.push(...doc.events.filter((e) => e.schoolIds.includes(schoolId) || e.schoolIds.includes('district')));
  }
  return out;
}

const stableId = (sourceId, start, label) =>
  `${sourceId}-${createHash('sha1').update(`${start}|${label.toLowerCase()}`).digest('hex').slice(0, 12)}`;

async function syncNewsletter(nl, now) {
  const today = chicago.format(now);
  const checkedAt = now.toISOString();
  try {
    const posts = parseWidget(await fetchText(nl.widgetUrl));
    if (!posts.length) throw new Error('Widget returned no posts — layout may have changed');
    const pattern = new RegExp(nl.titlePattern, 'i');
    const post = posts.find((p) => pattern.test(p.title));
    if (!post) throw new Error(`No recent post matches /${nl.titlePattern}/ — has the newsletter been renamed?`);

    const html = await fetchText(post.url);
    const digest = buildDigest({ post, html, today, calendarEvents: await calendarEventsFor(nl.schoolId), localDate });

    // A newsletter that yields nothing at all is far more likely to be a
    // layout change than an empty issue. Keep last week's rather than blank.
    if (!digest.todo.length && !digest.dates.length && !digest.topics.length) {
      throw new Error('Parsed the newsletter but found nothing — layout may have changed');
    }

    const issueDate = new Date(`${post.postedOn}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
    const sourceName = `${nl.name}, ${issueDate} issue`;
    const doc = {
      id: nl.id,
      schoolId: nl.schoolId,
      name: nl.name,
      postTitle: post.title,
      postUrl: post.url,
      postedOn: post.postedOn,
      sourceName,
      sourceUrl: nl.schoolPageUrl,
      lastChecked: checkedAt,
      ...digest,
    };
    assertNoPersonalContact(doc);

    // Only dates the school calendar is missing become events; the rest are
    // already on the site. Re-checked daily, so a date the school later adds
    // to its calendar drops out of here instead of appearing twice.
    const events = digest.dates
      .filter((d) => !d.onCalendar)
      .map((d) => ({
        id: stableId(nl.id, d.start, d.label),
        title: d.label,
        description: null,
        startDate: d.start,
        endDate: d.end ?? d.start,
        allDay: true,
        location: null,
        schoolIds: [nl.schoolId],
        category: categorize(d.label),
        needsAction: needsAction(d.label),
        sourceId: nl.id,
        sourceName,
        sourceUrl: post.url,
        sourceType: 'newsletter',
        importedAt: checkedAt,
        manualOverride: false,
        featured: false,
        actionDeadline: null,
      }));

    await writeFile(path.join(DIGEST_DIR, `${nl.id}.json`), JSON.stringify(doc, null, 2) + '\n');
    await writeFile(
      path.join(EVENTS_DIR, `${nl.id}.json`),
      JSON.stringify({ sourceId: nl.id, sourceName, sourceUrl: post.url, lastChecked: checkedAt, events }, null, 2) + '\n',
    );
    console.log(`[newsletters] ok   ${nl.id}: "${post.title}" — ${digest.todo.length} to-dos, ${digest.dates.length} dates (${events.length} new to the calendar)`);
    return { id: nl.id, ok: true, postedOn: post.postedOn, newDates: events.length, error: null, lastChecked: checkedAt };
  } catch (err) {
    console.error(`[newsletters] FAIL ${nl.id}: ${err.message} (previous digest kept)`);
    return { id: nl.id, ok: false, postedOn: null, newDates: 0, error: err.message, lastChecked: checkedAt };
  }
}

/** Belt and braces: the parser already drops these, but nothing that looks
 *  like a personal email or phone number may ever reach the site. */
function assertNoPersonalContact(value, where = 'digest') {
  if (typeof value === 'string') {
    // Links are allowed to contain digits; only visible text is checked.
    if (!/^https?:\/\//.test(value) && containsPersonalContact(value)) {
      throw new Error(`Personal contact details found in ${where}; refusing to write`);
    }
  } else if (Array.isArray(value)) value.forEach((v, i) => assertNoPersonalContact(v, `${where}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) assertNoPersonalContact(v, `${where}.${k}`);
}

async function main() {
  const now = new Date();
  await mkdir(DIGEST_DIR, { recursive: true });
  const { newsletters } = JSON.parse(await readFile(path.join(ROOT, 'data/sources/newsletters.json'), 'utf8'));
  const enabled = newsletters.filter((n) => n.enabled);
  const statuses = [];
  for (const nl of enabled) statuses.push(await syncNewsletter(nl, now));
  await writeFile(STATUS_FILE, JSON.stringify({ ranAt: now.toISOString(), statuses }, null, 2) + '\n');
  if (statuses.some((s) => !s.ok)) process.exit(1);
}

main().catch((err) => { console.error('[newsletters] fatal:', err); process.exit(2); });
