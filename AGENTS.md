# CLAUDE.md — My D44 PASS (repository: d44-parent-hub)

Instructions for any AI agent (or human) working in this repository. Read this
before changing anything.

## Product purpose

An independent, parent-built information hub for families in Lombard School
District 44. It aggregates and simplifies information that District 44,
individual schools and PTAs already publish, and organizes it around **what a
parent needs to know or do** rather than around district departments.

It is **not** a replacement for official district communication. Where this site
and the district disagree, the district is right.

## Product principles

1. **Urgency beats organizational structure.** Something happening tomorrow must
   be easier to find than a permanent administrative resource.
2. **Answer the question, then link to the source.** Never restate policy at
   length when linking to the authoritative page is more accurate.
3. **Missing beats wrong.** If a fact cannot be verified from an official
   source, it stays blank and is listed in `needsReview`.
4. **One-handed, at breakfast.** Every decision is judged on a phone.
5. **The feature test:** does this make it easier for a parent to know what is
   happening or to accomplish something they need to do? If not, it does not
   belong in the MVP.

## Architecture

- **Astro 7**, static output, TypeScript. No UI framework, no client router.
- **GitHub Pages** project site. `site.config.ts` holds `base` (`/d44-parent-hub/`);
  it must match the repository name and the `start_url`/`scope` in
  `public/manifest.webmanifest`.
- **Data lives in `data/` as plain JSON** and is imported at build time by
  `src/lib/data.ts`. There is no database and no runtime API.
- **Client-side JavaScript is limited to a few well-defined jobs**, all in the
  inline scripts in `src/layouts/Base.astro` and `src/components/SchoolPicker.astro`:
  1. read/write school preferences in `localStorage`,
  2. hide events that are not relevant to the chosen schools,
  3. re-partition Today / This week / Coming up against the *device* clock, so a
     cached or stale build can never claim the wrong day,
  4. collapse an event that arrives from both the district and a school feed,
  5. cap the visible "Coming up" list, and build a one-event `.ics` on click,
  6. offer "Add to home screen" (`InstallCard.astro`) — a real install button
     where `beforeinstallprompt` fires, Safari's Share steps on iOS, which has
     no programmatic install at all, and nothing where installing is impossible.
  Every page renders correctly with JavaScript disabled — just not personalized,
  and without "Add to calendar", which is hidden until the script enables it.
- **Service worker** (`public/sw.js`) is network-first, so an online parent never
  sees stale events; the cache only covers being offline.
- **Icons come in two shapes** (`npm run icons`). The rounded-square versions are
  for browser tabs and the `any` purpose; `icon-180.png` (iOS) and
  `icon-maskable-512.png` (Android) are full bleed, because both platforms crop
  the icon themselves and a light backdrop behind a rounded square leaves pale
  wedges in the corners. Keep the glyph inside the centre 80% safe zone.

```
src/components   presentational .astro components
src/layouts      Base.astro — head, nav, footer, personalization script
src/lib          types, data loading, date math, duplicate-title keys
src/pages        routes (index, calendar, resources, schools, settings, about)
data/schools     curated school records
data/sources     the source registry — add a feed here, not in code
data/events/generated   sync output, committed to git on purpose
data/manual      hand-curated events
data/resources   task shortcuts and the question/answer finder
scripts/sync     fetch + write
scripts/normalize   ICS → normalized events, categorization, school attribution
scripts/validate    structural + provenance validation
```

## Data schema

Every event — imported or manual — uses the `HubEvent` shape in
`src/lib/types.ts`. Required on **every** record:

| field | meaning |
|---|---|
| `id` | stable across syncs; derived from source id + UID + start |
| `title`, `description`, `startDate`, `endDate`, `allDay`, `location` | the event |
| `schoolIds` | `['district']` or specific school ids |
| `category` | one of the values in `EventCategory` |
| `sourceId`, `sourceName`, `sourceUrl`, `sourceType` | **provenance — never optional** |
| `importedAt` | when this record was first seen; preserved across syncs |
| `manualOverride` | a human edited this; sync must not clobber it |
| `needsAction` | a parent must send, sign, dress or order something beforehand |
| `featured`, `actionDeadline` | drives the "Don't forget" section |

Conventions worth knowing:

- All-day events store **date-only** strings (`YYYY-MM-DD`); timed events store
  full ISO timestamps.
- **Never read a date off a timed event's string.** Timed events are UTC
  instants; `startDate.slice(0, 10)` is the UTC date, which put every event
  after ~7pm Chicago on the next day (145 of 603). Use `dateOf()` in
  `src/lib/dates.ts`, which converts to Chicago. `npm run check:dist` verifies
  the built pages and runs in CI.
- **Never derive an all-day date through `toJSDate()`.** It returns *local*
  midnight, so the result differs between a laptop and a UTC CI runner — which
  silently rewrote every event id on each sync. Use `canonicalStamp()` in
  `scripts/normalize/ics-to-events.mjs`.
- `lastChecked` is stored **once per generated file**, not on every record, so a
  sync with no upstream changes is a one-line diff instead of a two-thousand
  line one. `src/lib/data.ts` stamps it back onto each event at load time, and
  the UI still shows it per card. Manual records carry their own.
- `importedAt` is carried forward for events that already existed, for the same
  reason. It means "first seen", not "last synced".
- ICS `DTEND` for all-day events is *exclusive* upstream; we store an
  **inclusive** `endDate` so a break never appears a day too long. The
  "Add to calendar" builder in `Base.astro` converts back when exporting.
- A moved occurrence of a recurring series (`RECURRENCE-ID`) appears twice in a
  feed. ical.js folds it into the master, so the standalone copy is skipped —
  see `scripts/normalize/ics-to-events.mjs`.
- The district calendar and a school calendar often publish the *same* day with
  different wording. Both are kept in the data (they have different sources);
  the district copy is hidden in the browser when the school's own version is
  visible to that parent.
- Manual records win over imported ones with the same `id` (`dedupe()` in
  `src/lib/data.ts`).
- `needsAction` is a separate axis from `category`, not a category: a book fair
  is still a PTA event and picture day is still an ordinary event. The badge says
  only "Plan ahead" and never guesses *what* to do — "send money" would be wrong
  for a free dress-down day, and a confidently wrong instruction is worse than a
  vague correct one. The title next to it says the rest.
- **Never cap a personalized list at build time.** Slicing before the browser
  filters by school hands the quota to other schools' events and can empty the
  section entirely. Render the window and cap visible items in `apply()` — this
  bit both "Coming up" and "Don't forget".

## Trusted source rules

- District 44 publishes nine **public Google Calendars** (district + eight
  schools). They are the primary source and are read as ICS. IDs live in
  `data/sources/sources.json`.
- School supply lists come from the district's public "School Supply Lists -
  Current Year" Drive folder, one PDF per school, stored as `supplyListUrl`.
  **The file ids change every year.** When the district publishes next year's
  lists, re-read the folder and map id→school from the rendered listing rather
  than from row order. See `$supplyListSource` in `data/schools/schools.json`.
- Task and resource links must point at the **authoritative official
  destination** — `sd44.org`, the school subdomains, Skyward, MySchoolBucks.
  Never link to a copy, a cache, or a third-party aggregator.
- Adding a source means adding a row to `data/sources/sources.json`. Generated
  files are picked up automatically.
- **Never hand-edit files in `data/events/generated/`.** They are overwritten by
  every sync. Corrections belong in `data/manual/manual-events.json`.
- **School newsletters** (`data/sources/newsletters.json`) are read from each
  school's public ParentSquare widget, `parentsquare.com/schools/<id>/rss_widget`,
  which the school itself embeds on its "Weekly Updates" page. It lists the ten
  latest posts, no login needed. ParentSquare's terms require the **owner's**
  written consent to reuse post content — the owner is the school — so a
  newsletter is `enabled` only once its principal has agreed, recorded in
  `consent`. Hammerschmidt: yes. JSECC: not yet.
  - `scripts/normalize/newsletter.mjs` summarises by rule. **No prose is ever
    stored**: only dates with their event names, topic names from headings, an
    action verb chosen by rule, and links. Never switch this to an LLM summary —
    it runs unattended, and a garbled date is the failure this site cannot afford.
  - Posts routinely include parent volunteers' personal emails and phone
    numbers. The parser drops them, the sync refuses to write them, and
    `npm run validate` fails if one appears. Keep all three layers.
  - Only dates the school calendar lacks become events
    (`data/events/generated/<id>.json`, `sourceType: 'newsletter'`), re-checked
    daily, so a date the school later adds to its calendar is not shown twice.
  - An issue is shown for 10 days, then hidden: last week's news presented as
    this week's is worse than nothing.
  - The layout is the principal's and will change. If a parse finds nothing the
    sync fails loudly and keeps last week's digest; fix the rules, never
    hand-edit the output.
- **Lunch menus (FD MealPlanner) must not be ingested.** The district publishes
  no menus itself; its only channel is fdmealplanner.com (Whitsons Culinary
  Group). Their Terms of Use prohibit "systematic retrieval of data or other
  Site Content ... to create or compile, directly or indirectly, a collection,
  compilation, database or directory without written permission", and every API
  endpoint is gated behind an RSA-encrypted anonymous-token handshake.
  Reproducing that handshake is technically possible and was deliberately not
  done. The menu shortcut links to `fdmealplanner.com/#menu/mp/LombardElemSD`
  — the exact entry point seven of the eight school sites publish, which lands
  on FD MealPlanner's picker filtered to Lombard schools. JSECC is not on it.
  Food services sits under Finance & Facilities (Neil Perry, Assistant
  Superintendent; Hans Budach, Director of Operations) — the people to ask. If written permission is ever obtained, record it here; the pieces
  are `GET {apiservicelocatorstenant}/api/v2/data-locator-webapi/3/meals`,
  tenantId 3, accountId 466 (Lombard Elementary SD), and a per-school
  locationId (Hammerschmidt is 2058).

## Privacy rules

- No accounts, no login, no analytics that identify individual parents.
- Never collect or store: student names, student IDs, ParentSquare or Skyward
  credentials, children's schedules, or any personally identifiable educational
  information.
- School and grade preferences live in `localStorage` only and are never
  transmitted.
- Never add a form that posts to this site. Parent submissions go to an external
  reviewed form, configured in `site.config.ts`, and never publish automatically.

## Accessibility expectations

- Minimum touch target 48px (`--tap`); chips 44px.
- Visible focus rings on everything interactive (`:focus-visible`).
- Colors meet WCAG AA contrast in both light and dark mode, verified before use,
  not assumed. Current accents: `#a4161a` on white (7.75:1) and `#ff7a7a` on
  `#1c1c1c` (6.75:1). Text drawn *on* the accent uses `--accent-ink`.
- Never encode meaning in color alone — every coloured card also carries a text
  badge.
- A selected control must be obvious at a glance on a phone in daylight. A tinted
  background that differs from the unselected state only in hue is not enough:
  the selected school chips previously went from `rgb(30,32,37)` to
  `rgb(29,56,49)`, which read as "nothing happened" and caused parents to tap
  twice and deselect.
- Semantic headings in order; `aria-current` on the active nav item;
  `aria-pressed` on toggle chips.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## Coding conventions

- TypeScript in `src/lib`. Plain `.mjs` in `scripts/` so a curious non-developer
  can read and run them with `node` and no build step.
- Comments explain *why*, not *what*. Prefer deleting code to commenting it out.
- No new dependencies without a strong reason. Current runtime deps: `astro`,
  `ical.js`. That is the whole list, and it should stay short.
- Keep inline scripts ES5-compatible and defensive — they run before anything
  else and must never throw.

## Deployment

- `main` → `.github/workflows/deploy.yml` → validate → build → GitHub Pages.
- Pages must be configured with **Source: GitHub Actions**.
- `npm run build` locally produces `dist/`. `public/.nojekyll` keeps Pages from
  mangling `_astro/`.

## Data synchronization

```
public Google Calendar → ICS → scripts/normalize → normalized JSON → committed → site
```

- `.github/workflows/sync.yml` runs daily at 09:20 UTC and on demand: calendars
  first, then newsletters (which compare against the calendars).
- Each source is fetched independently. One failing source never affects another.
- On failure the previous good file is **kept**, not emptied. A feed that used
  to have events and suddenly returns none is treated as a failure for the same
  reason.
- A feed that parses but has genuinely never had events in the window is marked
  `empty` rather than `ok`. It does not fail the build — some schools simply
  stop maintaining their calendar — but it is surfaced in `npm run validate`,
  on the About page, and on that school's page.
- Failures are written to `data/events/_sync-status.json`, surfaced in the UI
  (homepage banner and the About page), reported as a GitHub issue, and make the
  workflow red.
- Recurring events are expanded into a bounded window (30 days back, 400 days
  forward) so output stays finite and diffs stay readable.

## Things an agent must NEVER do automatically

1. **Never invent school information.** No addresses, phone numbers, principal
   names, PTA links, start times or deadlines that are not verified from an
   official source. If it cannot be verified, leave it `null` and add the field
   name to that school's `needsReview` array. Guessing is the single worst
   failure mode this project has.
2. **Never use an LLM as part of routine sync.** Ingestion must stay
   deterministic. An agent may be used to *diagnose* a changed feed format and
   fix the parser; it must not be in the per-run path.
3. **Never publish a parent submission automatically.** All submissions require
   human review.
4. **Never replace good data with empty data.** Prefer stale-but-labelled over
   blank.
5. **Never hand-edit `data/events/generated/`.**
6. **Never imitate District 44 branding.** The palette is red/black/white at the
   site owner's request, echoing the district's colours — that is a deliberate
   decision, so do not "fix" it back. The line it must not cross: no district
   logo or crest, no official-sounding wording, and layout and typography stay
   distinct. Red is reserved for brand and interaction; alerts and deadlines use
   amber, so red never means two things at once. The footer disclaimer is
   required on every page.
7. **Never add credential fields, payment forms, or student data collection.**
   Support payments go to an external provider link only.
8. **Never remove provenance** (`sourceName` / `sourceUrl` / `lastChecked`) from
   a record or a card to save space.
9. **Never widen scope** past the MVP definition of done without being asked.
