import { defineConfig } from 'astro/config';
import { soundBoard } from './dev/integration.mjs';

// Astro ignora le cartelle che iniziano con `_` in src/pages: gli endpoint
// `/_fs` e `/_img` (percorsi concordati con il client) si iniettano come rotte.
const underscoreRoutes = {
  name: 'fosforo-rotte-con-underscore',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      injectRoute({ pattern: '/_fs/index.json', entrypoint: './src/endpoints/fs-index.json.ts' });
      injectRoute({ pattern: '/_fs/[...path].json', entrypoint: './src/endpoints/fs-path.json.ts' });
      injectRoute({ pattern: '/_img/[...path].png', entrypoint: './src/endpoints/img.png.ts' });
    },
  },
};

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL ?? 'https://example.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [underscoreRoutes, soundBoard()],
});
