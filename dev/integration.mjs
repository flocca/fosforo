// Banco dei suoni: la rotta /_suoni esiste solo con `astro dev`, mai nella build.
// Le registrazioni si servono da .cache/suoni/ (fuori da git) con un middleware di Vite.
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';

const FILE = /^[a-z0-9-]+\.(webm|m4a)$/;
const TYPES = { webm: 'audio/webm', m4a: 'audio/mp4' };

export function soundBoard(cacheDir = join(process.env.FOSFORO_CACHE ?? '.cache', 'suoni')) {
  return {
    name: 'fosforo-banco-dei-suoni',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command !== 'dev') return;
        injectRoute({ pattern: '/_suoni', entrypoint: './dev/suoni.astro' });
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use('/_suoni/registrazioni', (req, res, next) => {
          const name = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0]);
          const path = join(cacheDir, name);
          if (!FILE.test(name) || !existsSync(path)) {
            res.statusCode = 404;
            res.end('registrazione mancante: lancia dev/scarica-suoni.sh');
            return;
          }
          res.setHeader('Content-Type', TYPES[name.split('.').pop()]);
          res.setHeader('Cache-Control', 'no-store');
          createReadStream(path).on('error', next).pipe(res);
        });
      },
    },
  };
}
