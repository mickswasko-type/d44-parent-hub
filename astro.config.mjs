// @ts-check
import { defineConfig } from 'astro/config';
import { siteConfig } from './site.config';

export default defineConfig({
  site: siteConfig.site,
  base: siteConfig.base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  compressHTML: true,
});
