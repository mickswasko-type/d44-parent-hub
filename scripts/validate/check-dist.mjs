#!/usr/bin/env node
/**
 * Checks the *built* site, not the data: every timed event card must display
 * on the calendar date its start time falls on in Chicago.
 *
 * This exists because the data can be perfect and the page still wrong. Timed
 * events are stored as UTC instants, and reading the date straight off that
 * string put every event after ~7pm Chicago on the following day — a quarter
 * of all timed events, found only because a school newsletter disagreed with
 * us. Runs after `astro build` in CI.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '../../dist');
const chicagoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
});

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

let checked = 0;
const failures = [];
for (const file of await htmlFiles(DIST)) {
  const html = await readFile(file, 'utf8');
  for (const tag of html.match(/<article[^>]*data-start-at="[^"]+"[^>]*>/g) ?? []) {
    const shown = tag.match(/data-date="([^"]+)"/)?.[1];
    const startAt = tag.match(/data-start-at="([^"]+)"/)?.[1];
    if (!shown || !startAt) continue;
    checked++;
    const actual = chicagoDate.format(new Date(startAt));
    if (shown !== actual) failures.push(`${path.relative(DIST, file)}: shows ${shown}, starts ${startAt} = ${actual} in Chicago`);
  }
}

if (checked === 0) {
  console.error('[check-dist] no timed event cards found — did the build run, or did the markup change?');
  process.exit(1);
}
if (failures.length) {
  console.error(`[check-dist] ${failures.length} of ${checked} timed cards show the wrong date:`);
  for (const f of failures.slice(0, 10)) console.error('  ' + f);
  process.exit(1);
}
console.log(`[check-dist] ok — ${checked} timed event cards, all on their Chicago date`);
