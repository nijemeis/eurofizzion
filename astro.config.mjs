import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// Fully static: every page is pre-built HTML. The only server code is the
// CMS functions in netlify/, which visitors never call.
export default defineConfig({
  site: 'https://eurofizzion.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [preact()],
  build: { format: 'directory', inlineStylesheets: 'auto' },
});
