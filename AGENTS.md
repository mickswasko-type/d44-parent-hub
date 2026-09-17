# CLAUDE.md — D44 Parent Hub

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
- **Client-side JavaScript is limited to three jobs**, all in the inline scripts
  in `src/layouts/Base.astro` and `src/components/SchoolPicker.astro`:
  1. read/write school preferences in `localStorage`,
  2. hide events that are not relevant to the chosen schools,
  3. re-partition Today / This week / Coming up against the *device* clock, so a
     cached or stale build can never claim the wrong day.
  Every page renders correctly with JavaScript disabled — just not personalized.
- **Service worker** (`public/sw.js`) is network-first, so an online parent never
  sees stale events; the cache only covers being offline.

```
src/components   presentational .astro components
src/layouts      Base.astro — head, nav, footer, personalization script
src/lib          types, data loading, date math, ICS export
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
| `sourceName`, `sourceUrl`, `sourceType` | **provenance — never optional** |
| `lastChecked`, `importedAt` | freshness |
| `manualOverride` | a human edited this; sync must not clobber it |
| `featured`, `actionDeadline` | drives the "Don't forget" section |

Conventions worth knowing:

- All-day events store **date-only** strings (`YYYY-MM-DD`); timed events store
  full ISO timestamps.
- ICS `DTEND` for all-day events is *exclusive* upstream; we store an
  **inclusive** `endDate` so a break never appears a day too long. `src/lib/ics.ts`
  converts back when exporting.
- Manual records win over imported ones with the same `id` (`dedupe()` in
  `src/lib/data.ts`).

## Trusted source rules

- District 44 publishes nine **public Google Calendars** (district + eight
  schools). They are the primary source and are read as ICS. IDs live in
  `data/sources/sources.json`.
- Task and resource links must point at the **authoritative official
  destination** — `sd44.org`, the school subdomains, Skyward, MySchoolBucks.
  Never link to a copy, a cache, or a third-party aggregator.
- Adding a source means adding a row to `data/sources/sources.json`. Generated
  files are picked up automatically.
- **Never hand-edit files in `data/events/generated/`.** They are overwritten by
  every sync. Corrections belong in `data/manual/manual-events.json`.

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
- Colors meet WCAG AA contrast in both light and dark mode. Never encode meaning
  in color alone — every coloured card also carries a text badge.
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

- `.github/workflows/sync.yml` runs daily at 09:20 UTC and on demand.
- Each source is fetched independently. One failing source never affects another.
- On failure the previous good file is **kept**, not emptied. A feed that parses
  but returns zero events is treated as a failure for the same reason.
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
6. **Never imitate District 44 branding**, use district logos, or word anything
   so that the site could be mistaken for an official district service. The
   footer disclaimer is required on every page.
7. **Never add credential fields, payment forms, or student data collection.**
   Support payments go to an external provider link only.
8. **Never remove provenance** (`sourceName` / `sourceUrl` / `lastChecked`) from
   a record or a card to save space.
9. **Never widen scope** past the MVP definition of done without being asked.
