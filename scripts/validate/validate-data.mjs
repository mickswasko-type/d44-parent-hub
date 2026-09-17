#!/usr/bin/env node
/**
 * Structural validation of everything under data/. Run in CI before deploy so
 * a malformed record can never reach parents.
 *
 *   npm run validate              structure + provenance only (fast, offline)
 *   npm run validate -- --links   also HEAD every official url
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/;
const CATEGORIES = new Set(['no-school','early-dismissal','holiday','conference','deadline','sports','performance','meeting','pta','event']);

const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));

function validateEvent(e, where, schoolIds) {
  const at = `${where} [${e.id ?? 'no-id'}]`;
  for (const field of ['id','title','startDate','sourceId','sourceName','sourceUrl','sourceType','lastChecked','importedAt']) {
    if (!e[field]) fail(`${at}: missing required field "${field}"`);
  }
  if (typeof e.allDay !== 'boolean') fail(`${at}: allDay must be a boolean`);
  if (!CATEGORIES.has(e.category)) fail(`${at}: unknown category "${e.category}"`);
  if (e.allDay && !ISO_DATE.test(e.startDate)) fail(`${at}: all-day startDate must be YYYY-MM-DD`);
  if (!e.allDay && !ISO_DATETIME.test(e.startDate)) fail(`${at}: timed startDate must be a full ISO timestamp`);
  if (e.endDate && !e.allDay && new Date(e.endDate) < new Date(e.startDate)) fail(`${at}: endDate is before startDate`);
  if (!Array.isArray(e.schoolIds) || e.schoolIds.length === 0) fail(`${at}: schoolIds must be a non-empty array`);
  else for (const id of e.schoolIds) if (!schoolIds.has(id)) fail(`${at}: unknown schoolId "${id}"`);
  if (e.sourceUrl && !/^https?:\/\//.test(e.sourceUrl)) fail(`${at}: sourceUrl must be an absolute http(s) url`);
}

async function main() {
  const checkLinks = process.argv.includes('--links');

  const { schools } = await readJson('data/schools/schools.json');
  const schoolIds = new Set(schools.map((s) => s.id));
  if (schoolIds.size !== schools.length) fail('schools.json: duplicate school id');
  for (const s of schools) {
    for (const field of ['id','name','shortName','level','website','sourceName','sourceUrl','lastChecked']) {
      if (!s[field]) fail(`school ${s.id}: missing required field "${field}"`);
    }
    if (!Array.isArray(s.needsReview)) fail(`school ${s.id}: needsReview must be an array`);
    for (const field of ['address','mainPhone','attendancePhone','principal','ptaUrl']) {
      const na = s.notApplicable ?? [];
      if (s[field] === null && !s.needsReview.includes(field) && !na.includes(field)) {
        warn(`school ${s.id}: "${field}" is unverified but not listed in needsReview`);
      }
    }
  }

  const { sources } = await readJson('data/sources/sources.json');
  for (const s of sources) {
    if (!s.sourceUrl) fail(`source ${s.id}: missing sourceUrl`);
    for (const id of s.schoolIds) if (!schoolIds.has(id)) fail(`source ${s.id}: unknown schoolId "${id}"`);
  }

  const generatedDir = path.join(ROOT, 'data/events/generated');
  let totalEvents = 0;
  if (existsSync(generatedDir)) {
    for (const file of (await readdir(generatedDir)).filter((f) => f.endsWith('.json'))) {
      const doc = await readJson(`data/events/generated/${file}`);
      if (!Array.isArray(doc.events)) { fail(`${file}: "events" must be an array`); continue; }
      const seen = new Set();
      if (!doc.lastChecked) fail(`${file}: missing file-level "lastChecked"`);
      for (const e of doc.events) {
        if (seen.has(e.id)) fail(`${file}: duplicate event id ${e.id}`);
        seen.add(e.id);
        // lastChecked lives on the file; validate the record as the site sees it.
        validateEvent({ ...e, lastChecked: doc.lastChecked }, file, schoolIds);
      }
      totalEvents += doc.events.length;
    }
  }

  const manual = await readJson('data/manual/manual-events.json');
  for (const e of manual.events) validateEvent(e, 'manual-events.json', schoolIds);
  const samples = manual.events.filter((e) => e.sample);
  if (samples.length) warn(`manual-events.json: ${samples.length} SAMPLE fixture(s) still present (${samples.map((e) => e.id).join(', ')}) — remove before launch`);
  totalEvents += manual.events.length;

  const { tasks } = await readJson('data/resources/tasks.json');
  const urls = [];
  for (const t of tasks) {
    for (const field of ['id','label','intent','url','sourceName','sourceUrl','lastChecked']) {
      if (!t[field]) fail(`task ${t.id}: missing required field "${field}"`);
    }
    if (!/^(https?:\/\/|internal:|tel:)/.test(t.url)) fail(`task ${t.id}: url must be http(s), tel: or internal:`);
    if (t.url.startsWith('http')) urls.push([t.id, t.url]);
  }

  const { questions } = await readJson('data/resources/questions.json');
  for (const q of questions) {
    if (!q.question || !q.answer) fail(`question ${q.id}: missing question or answer`);
    if (!q.sourceUrl) fail(`question ${q.id}: missing sourceUrl`);
  }

  const status = existsSync(path.join(ROOT, 'data/events/_sync-status.json'))
    ? await readJson('data/events/_sync-status.json') : { statuses: [] };
  for (const s of status.statuses) {
    if (!s.ok) warn(`source "${s.sourceId}" last sync FAILED: ${s.error}${s.servingStaleData ? ' (serving previous data)' : ''}`);
    else if (s.empty) warn(`source "${s.sourceId}" parsed but has no events — check whether the school still publishes this calendar`);
  }

  if (checkLinks) {
    console.log(`[validate] checking ${urls.length} official links...`);
    await Promise.all(urls.map(async ([id, url]) => {
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
        if (!res.ok) warn(`task ${id}: ${url} returned HTTP ${res.status}`);
      } catch (err) {
        warn(`task ${id}: ${url} unreachable (${err.message})`);
      }
    }));
  }

  console.log(`[validate] ${schools.length} schools, ${totalEvents} events, ${tasks.length} tasks, ${questions.length} questions`);
  for (const w of warnings) console.warn(`[validate] warn  ${w}`);
  for (const e of errors) console.error(`[validate] ERROR ${e}`);
  if (errors.length) { console.error(`\n[validate] ${errors.length} error(s)`); process.exit(1); }
  console.log(`[validate] ok${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
}

main().catch((err) => { console.error('[validate] fatal:', err); process.exit(2); });
