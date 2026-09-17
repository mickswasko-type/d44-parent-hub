/**
 * Single place for every tunable that a non-developer might need to change.
 * Nothing here is secret. Nothing here is required for the site to build.
 */
export const siteConfig = {
  /**
   * What the site calls itself. Change this one string and it updates the
   * header, every page title, and the name under the home-screen icon.
   * It is only a display name — it has nothing to do with the repository
   * name or the URL, so renaming never breaks anyone's installed app.
   *
   * The header styles the first word plain and the rest in the accent colour
   * ("D44 **Parent Hub**"), which works for most two- or three-word names.
   */
  name: 'D44 Parent Hub',

  /** Shown under the icon on a phone home screen, where space is tight (~12 chars). */
  shortName: 'D44 Hub',

  tagline: 'What Lombard D44 parents need to know, today.',
  description:
    'An independent, parent-built guide to what is happening in Lombard School District 44 schools.',

  /** GitHub Pages project site. Must match the repo name, with leading+trailing slash. */
  base: '/d44-parent-hub/',
  site: 'https://mickswasko-type.github.io',

  /** Timezone every date calculation is anchored to. D44 is in Chicago. */
  timeZone: 'America/Chicago',

  /**
   * "See something missing?" form. Set to a Google Form URL to switch the feature on.
   * While null, the UI stays hidden rather than linking somewhere broken.
   */
  submissionsFormUrl: null as string | null,

  /**
   * Optional tip jar (Ko-fi, Stripe Payment Link, ...). While null, nothing renders.
   * Parent information is never paywalled, whatever this is set to.
   */
  supportUrl: null as string | null,

  disclaimer:
    'Independent parent-built resource. Not affiliated with or endorsed by Lombard School District 44. Information is aggregated from publicly available sources and links back to official sources whenever possible.',

  officialSiteUrl: 'https://www.sd44.org/',
} as const;

export type SiteConfig = typeof siteConfig;
