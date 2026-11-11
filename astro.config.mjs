import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL ?? 'https://example.com',
  trailingSlash: 'never',
  build: { format: 'file' },
});
