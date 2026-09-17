# My D44 PASS

An independent, parent-built guide to what is happening in **Lombard School
District 44** — organized around what a parent needs to know or do, rather than
around district departments.

> Independent parent-built resource. Not affiliated with or endorsed by Lombard
> School District 44. Information is aggregated from publicly available sources
> and links back to official sources whenever possible.

## What it does

- **Today / This week / Coming up** — what actually affects your morning, first.
- **Don't forget** — deadlines and action items, visually separated from ordinary events.
- **I need to…** — thumb-sized shortcuts to report an absence, pay for lunch, open
  ParentSquare, check grades, and so on. Every one links to the official destination.
- **Calendar** — one chronological list across the district and your schools, filterable, with "Add to calendar".
- **School pages** — phone, attendance line, address, website, upcoming events.
- **Source on everything** — every card says where the information came from and when it was last checked.

No account. No student data. School preferences live in your browser.

## How the data works

You can inspect all of it without running anything — it is plain JSON.

```
data/sources/sources.json       which feeds we read, and their official page
data/schools/schools.json       curated school records (+ what we could NOT verify)
data/events/generated/*.json    output of the last sync, one file per source
data/events/_sync-status.json   what worked, what failed, when
data/manual/manual-events.json  hand-curated events with the same provenance rules
data/resources/*.json           task shortcuts and the question/answer finder
```

District 44 publishes public Google Calendars. A scheduled GitHub Action reads
them as iCalendar feeds, normalizes them into one event shape, and commits the
result. **No AI is involved in routine syncing** — it is a parser.

If a feed fails, the previous good data is kept, the failure is written to
`_sync-status.json`, shown on the site, and raised as a GitHub issue.

## Running it locally

```bash
npm install
npm run sync       # fetch the enabled calendar feeds
npm run validate   # structural + provenance checks
npm run dev        # http://localhost:4321/d44-parent-hub/
```

| script | what it does |
|---|---|
| `npm run sync` | fetch every enabled source, normalize, write `data/events/generated/` |
| `npm run validate` | check structure, provenance, school ids; `-- --links` also checks official URLs |
| `npm run build` | static build into `dist/` |
| `npm run icons` | regenerate the PWA icons |

## Configuration

Everything a non-developer might change is in [`site.config.ts`](site.config.ts):
the site name, the GitHub Pages `base`, the timezone, the submissions form URL,
and the optional support link. Setting the last two to `null` hides those
features entirely rather than linking somewhere broken.

To enable another school's calendar, flip `enabled` to `true` in
[`data/sources/sources.json`](data/sources/sources.json). No code change needed.

## Contributing a correction

Found something missing or wrong? Open an issue. Submissions are always reviewed
by a person before they appear — nothing publishes automatically.

## For AI agents

Read [CLAUDE.md](CLAUDE.md) first. The short version: never invent school
information, never hand-edit generated data, never let an LLM into the sync path.
