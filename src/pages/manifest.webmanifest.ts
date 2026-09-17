import type { APIRoute } from 'astro';
import { siteConfig } from '../../site.config';

/**
 * Generated rather than kept as a static file, so the app name and the base
 * path come from site.config.ts. A hand-maintained manifest silently goes
 * stale the moment either one changes — and a wrong `scope` breaks the
 * installed app rather than showing an obvious error.
 */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        name: siteConfig.name,
        short_name: siteConfig.shortName,
        description: siteConfig.description,
        start_url: siteConfig.base,
        scope: siteConfig.base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f7f5',
        theme_color: '#2f6d5f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
