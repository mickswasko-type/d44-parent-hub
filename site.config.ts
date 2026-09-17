/**
 * Single place for every tunable that a non-developer might need to change.
 * Nothing here is secret. Nothing here is required for the site to build.
 */
export const siteConfig = {
  name: 'D44 Parent Hub',
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
