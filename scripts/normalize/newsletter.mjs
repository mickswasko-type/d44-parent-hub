/**
 * Turns a school's ParentSquare newsletter into a short, structured digest.
 *
 * Everything here is deterministic — fixed rules, no AI — because it runs
 * unattended every morning, and a summariser that occasionally garbles a date
 * is the one failure this site cannot afford.
 *
 * It never stores the newsletter's prose. What survives is facts: dates and
 * their event names, short topic labels taken from section headings, action
 * verbs chosen by rule, and links. Anything that looks like a personal email
 * address or phone number is dropped, because these posts routinely include a
 * parent volunteer's contact details.
 */

import { needsAction } from './categorize.mjs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /\b\d{3}[-.\s)]{1,2}\d{3}[-.\s]\d{4}\b/;

export const containsPersonalContact = (s = '') => EMAIL.test(s) || PHONE.test(s);

const decode = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/ /g, ' ');

/** HTML to text with a line break at every block boundary, so list items stay separate. */
function toLines(fragment) {
  return decode(
    fragment
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(div|p|li|ul|ol|h[1-6]|tr|td|table|section)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const clean = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ widget */

/** The school's public ParentSquare widget: latest posts, newest first. */
export function parseWidget(html) {
  const posts = [];
  for (const item of html.split('rss-widget-feed-list-item').slice(1)) {
    const url = item.match(/href="(https:\/\/www\.parentsquare\.com\/feeds\/\d+)"/)?.[1];
    const title = item.match(/aria-label="([^"]+?): Opens in new tab"/)?.[1];
    const posted = item.match(/aria-label="Posted on ([^"]+)"/)?.[1];
    if (url && title) posts.push({ url, title: clean(title), postedOn: posted ? toIsoDate(posted) : null });
  }
  return posts;
}

function toIsoDate(text) {
  // "Friday, Sep 18 2026"
  const m = text.match(new RegExp(`${MONTH_RE}\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'));
  if (!m) return null;
  const month = MONTHS.findIndex((name) => name.startsWith(m[1].toLowerCase().slice(0, 3))) + 1;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------- post */

/**
 * Newsletters built in ParentSquare's editor mark blocks with <h1> titles and
 * <h2> subtitles — but authors also stack whole sections as bare <h2>s under
 * the last <h1>. So:
 *   - every <h1> starts a section;
 *   - an <h2> straight after an <h1> (nothing in between) is its subtitle;
 *   - an <h2> that is just a month ("September 2026") stays inside the current
 *     section, where the date list needs it for the year;
 *   - any other <h2> starts a section of its own, remembering its parent.
 * If none of this structure is present the caller reports failure rather than
 * guessing.
 */
export function parsePost(html) {
  const bodyStart = html.search(/<h1\b[^>]*nl-builder_title/i);
  if (bodyStart < 0) return [];
  const body = html.slice(bodyStart);

  const tokens = [...body.matchAll(/<(h1|h2)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((m) => ({
    level: m[1].toLowerCase(),
    text: clean(m[3]),
    start: m.index,
    end: m.index + m[0].length,
  }));

  const monthHeader = new RegExp(`^${MONTH_RE}\\s+\\d{4}$`, 'i');
  const units = [];
  let current = null;
  let prev = null;
  let lastH1 = null;

  for (const t of tokens) {
    const gapIsEmpty = prev && !clean(body.slice(prev.end, t.start));
    if (t.level === 'h1') {
      current = { heading: t.text, subheading: '', parent: null, start: t.start, contentStart: t.end };
      units.push(current);
      lastH1 = current;
    } else if (current && prev?.level === 'h1' && gapIsEmpty && !current.subheading) {
      current.subheading = t.text;
    } else if (current && monthHeader.test(t.text)) {
      // stays in the current section
    } else {
      current = { heading: t.text, subheading: '', parent: lastH1?.heading ?? null, start: t.start, contentStart: t.end };
      units.push(current);
    }
    prev = t;
  }

  return units.map((u, i) => {
    const chunk = body.slice(u.contentStart, units[i + 1]?.start ?? body.length);
    const links = [...chunk.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => ({ href: decode(m[1]), text: clean(m[2]) }))
      .filter((l) => /^https?:\/\//.test(l.href))
      .filter((l) => !/parentsquare\.com\/(signin|schools\/\d+\/users)/.test(l.href));
    return { heading: u.heading, subheading: u.subheading, parent: u.parent, lines: toLines(chunk), links };
  });
}

/* ------------------------------------------------------------------- dates */

/**
 * Reads a newsletter's date list. Two layouts are in use at D44 today:
 *   Hammerschmidt   "10/5 - 10/9: PTA Walk + Roll Week"   (under "October 2026")
 *   Schroder        "October 14- Wear Pink Day"
 * Only sections with at least three such lines are treated as a date list, so
 * a stray "October 5th- 9th" inside prose does not become an event.
 */
export function parseDates(sections, postedOn) {
  const numeric = /^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?(?:\s*[-–]\s*(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?)?\s*:\s*(.+)$/;
  const named = new RegExp(`^${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–]\\s*(\\d{1,2})(?:st|nd|rd|th)?)?\\s*[-–:]\\s*(.+)$`, 'i');
  const header = new RegExp(`^${MONTH_RE}\\s+(\\d{4})$`, 'i');

  const out = [];
  for (const section of sections) {
    const hits = section.lines.filter((l) => numeric.test(l) || named.test(l));
    if (hits.length < 3) continue;

    let year = null;
    for (const line of section.lines) {
      const h = line.match(header);
      if (h) { year = +h[2]; continue; }

      let m;
      let startMonth, startDay, endMonth, endDay, label;
      if ((m = line.match(numeric))) {
        [startMonth, startDay] = [+m[1], +m[2]];
        [endMonth, endDay] = m[3] ? [+m[3], +m[4]] : [null, null];
        label = m[5];
      } else if ((m = line.match(named))) {
        startMonth = MONTHS.findIndex((n) => n.startsWith(m[1].toLowerCase().slice(0, 3))) + 1;
        startDay = +m[2];
        [endMonth, endDay] = m[3] ? [startMonth, +m[3]] : [null, null];
        label = m[4];
      } else continue;

      const start = resolveDate(startMonth, startDay, year, postedOn);
      const end = endMonth ? resolveDate(endMonth, endDay, year, postedOn) : null;
      if (!start || containsPersonalContact(label)) continue;
      out.push({ start, end: end && end > start ? end : null, label: tidyLabel(label) });
    }
  }
  return out;
}

/** Without a "October 2026" header, take the year from the post, rolling into
 *  next year for a January date listed in a December issue. */
function resolveDate(month, day, year, postedOn) {
  if (!month || month > 12 || !day || day > 31) return null;
  let y = year ?? +postedOn.slice(0, 4);
  const iso = (yy) => `${yy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!year && iso(y) < addDays(postedOn, -60)) y += 1;
  return iso(y);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const tidyLabel = (s) => s.replace(/\s+/g, ' ').replace(/[\s,;:.-]+$/, '').trim();

/* ---------------------------------------------------------------- sections */

/** Sections that are furniture rather than news: social links, standing ads. */
const SKIP = /facebook|instagram|socials|givebacks|events calendar on website|phone ?book/i;
/** Evergreen reference links worth keeping, whatever week it is. */
const RESOURCE = /school calendar|breaks|holidays|things to know|handbook|reference guide|supply list/i;

/**
 * What a parent can *do*, decided by rule from the section's own words. An
 * action needs a link to act on; "more information next week" is not a to-do.
 */
const ACTIONS = [
  { verb: 'Propose a session', test: /proposal|share your passion/i, link: /proposal|forms/i },
  { verb: 'Volunteer', test: /volunteer|sign up for a|sign-?up to|help needed/i, link: /forms|signup|sign-?up|volunteer/i },
  { verb: 'Donate', test: /donat|wish ?list/i, link: /wishlist|amazon|donat/i },
  { verb: 'Buy tickets', test: /tickets?|presale/i, link: /ticket|givebacks|event|click/i },
  { verb: 'Give feedback', test: /feedback|share your thoughts|survey/i, link: /forms|survey|feedback/i },
  { verb: 'Join', test: /membership|join (the pta|today)/i, link: /givebacks|join|member/i },
  { verb: 'Sign up', test: /register|registration|rsvp/i, link: /forms|register|rsvp|signup/i },
];

/**
 * Section headings as short topic names: "PTA - Trunk or Treat" → "Trunk or
 * Treat". A generic heading ("Volunteer Opportunity", "Save the Date") takes
 * the topic of the section it sits under instead.
 */
export function topicFrom(section) {
  const generic = /^(volunteer opportunity|please note|save the date|join today|important)/i;
  const raw = generic.test(section.heading) && section.parent ? section.parent : section.heading;
  return raw
    .replace(/^(pta|whs)\s*[-–:]\s+/i, '')
    .replace(/["“”]/g, '')
    .replace(/\s*[-–]\s*(join today)\b.*$/i, '')
    .replace(/\s+(feedback request|request)$/i, '')
    .replace(/\s+at (hammerschmidt|schroder|jsecc)\b/i, '')
    .replace(/[!.:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickLink(section, pattern) {
  return (
    section.links.find((l) => pattern.test(l.href) || pattern.test(l.text)) ??
    section.links.find((l) => /docs\.google\.com\/forms/.test(l.href)) ??
    null
  );
}

/* ------------------------------------------------------------------ digest */

const STOP = new Set(['the', 'and', 'for', 'with', 'whs', 'pta', 'day', 'days', 'week', 'school',
  'student', 'students', 'council', 'event', 'hammerschmidt', 'jsecc', 'schroder', 'adult']);

export function significantWords(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/s$/, ''));
}

/**
 * @param calendarEvents this school's and the district's already-imported
 *        events, used to tell which newsletter dates are genuinely new.
 * @param localDate      converts a stored event date to its Chicago date.
 */
export function buildDigest({ post, html, today, calendarEvents, localDate }) {
  const sections = parsePost(html);
  if (sections.length < 2) throw new Error('Newsletter layout not recognised (no editor sections found)');

  const dates = parseDates(sections, post.postedOn)
    .filter((d) => (d.end ?? d.start) >= today)
    .map((d) => {
      const words = significantWords(d.label);
      const noSchool = /no school|school closed/i.test(d.label);
      const onCalendar = calendarEvents.some((e) => {
        const s = localDate(e.startDate);
        const en = localDate(e.endDate ?? e.startDate);
        if (s > d.start || en < d.start) return false;
        if (noSchool) return e.category === 'no-school' || e.category === 'holiday';
        const ew = significantWords(e.title);
        return words.some((w) => ew.includes(w));
      });
      return { ...d, onCalendar, needsAction: needsAction(d.label) };
    });

  const todo = [];
  const topics = [];
  const resources = [];
  for (const section of sections) {
    const text = [section.heading, section.subheading, ...section.lines].join(' ');
    if (sectionIsDateList(section)) continue;
    if (RESOURCE.test(section.heading)) {
      const link = section.links[0];
      if (link) resources.push({ label: topicFrom(section), url: link.href });
      continue;
    }
    if (SKIP.test(section.heading)) continue;

    const topic = topicFrom(section);
    if (!topic || containsPersonalContact(topic)) continue;

    const words = significantWords(topic);
    const related = dates.find((d) => significantWords(d.label).some((w) => words.includes(w)));

    let acted = 0;
    for (const action of ACTIONS) {
      if (acted >= 2 || !action.test.test(text)) continue;
      const link = pickLink(section, action.link);
      if (!link || todo.some((t) => t.url === link.href)) continue;
      todo.push({ verb: action.verb, topic, date: related?.start ?? null, url: link.href });
      acted++;
    }
    if (!acted && !topics.includes(topic)) topics.push(topic);
  }

  // Most important first, in tiers a parent would recognise:
  //   1. things to do for a dated event the kids are part of, soonest first
  //   2. the same for adult-only events
  //   3. undated asks (feedback, session proposals)
  //   4. standing asks (membership)
  const tier = (t) =>
    t.verb === 'Join' ? 4 : !t.date ? 3 : /adult/i.test(t.topic) ? 2 : 1;
  todo.sort((a, b) => tier(a) - tier(b) || (a.date ?? '').localeCompare(b.date ?? ''));
  dates.sort((a, b) => a.start.localeCompare(b.start));

  // A topic that already has a to-do does not need repeating underneath.
  const actedOn = new Set(todo.map((t) => t.topic));
  return { todo, dates, topics: topics.filter((t) => !actedOn.has(t)).slice(0, 8), resources };
}

function sectionIsDateList(section) {
  return section.lines.filter((l) => /^\d{1,2}\/\d{1,2}/.test(l) || new RegExp(`^${MONTH_RE}\\s+\\d{1,2}\\b.*[-–:]`, 'i').test(l)).length >= 3;
}
