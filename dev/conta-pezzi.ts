// Controlla che nei file prodotti da dev/ritaglia-suoni.sh il client trovi il numero giusto di
// pezzi, decodificando come il browser (ffmpeg, 48 kHz) in Opus e in AAC.
// Uso: node --experimental-strip-types dev/conta-pezzi.ts <file senza estensione> <pezzi> ...
import { execFileSync } from 'node:child_process';
import { findSegments } from '../src/client/sound/sprite.ts';

const args = process.argv.slice(2);
let ok = true;
for (let i = 0; i < args.length; i += 2) {
  for (const ext of ['webm', 'm4a']) {
    const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', `${args[i]}.${ext}`, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 });
    const data = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    const n = findSegments(data, 48000).length;
    const want = Number(args[i + 1]);
    console.log(`${args[i]}.${ext}: ${n} pezzi${n === want ? '' : `, ne servono ${want}`}`);
    if (n !== want) ok = false;
  }
}
process.exit(ok ? 0 : 1);
