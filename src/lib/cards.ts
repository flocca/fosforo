// Immagini generate in build: anteprime social (OG), fotogrammi delle canzoni, foto dei post.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as opentypeModule from 'opentype.js';
import type { Font, Glyph, Path } from 'opentype.js';
import sharp, { type Sharp } from 'sharp';
import { MAX_IMAGE_WIDTH } from './image-size';

const BG = '#050806';
const GREEN = '#33ff66';
export const OG_W = 1200;
export const OG_H = 630;
export const OG_MARGIN = 80;

// Fira Mono dai file di @fontsource: il testo diventa tracciati SVG, così il risultato non dipende
// dai font di sistema né da come librsvg carica (o non carica) i webfont.
type Weight = 400 | 500;
// Node carica il bundle UMD (tutto sotto `default`), Vite il modulo ESM (export con nome).
const opentype: typeof opentypeModule =
  typeof opentypeModule.parse === 'function' ? opentypeModule : (opentypeModule as unknown as { default: typeof opentypeModule }).default;
const fonts = new Map<Weight, Font[]>();
function fontsFor(weight: Weight): Font[] {
  let list = fonts.get(weight);
  if (!list) {
    const require = createRequire(import.meta.url);
    list = ['latin', 'latin-ext', 'symbols2'].map((subset) => {
      const b = readFileSync(require.resolve(`@fontsource/fira-mono/files/fira-mono-${subset}-${weight}-normal.woff`));
      return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    });
    fonts.set(weight, list);
  }
  return list;
}

// Ogni carattere dal primo sottoinsieme che lo contiene (altrimenti il glifo "mancante" del latino).
function glyphs(text: string, weight: Weight): { glyph: Glyph; upm: number }[] {
  const list = fontsFor(weight);
  return Array.from(text.normalize('NFC')).map((c) => {
    const font = list.find((f) => f.hasChar(c)) ?? list[0];
    return { glyph: font.charToGlyph(c), upm: font.unitsPerEm };
  });
}

export function textWidth(text: string, size: number, weight: Weight = 400): number {
  return glyphs(text, weight).reduce((w, g) => w + ((g.glyph.advanceWidth ?? 0) * size) / g.upm, 0);
}

// Dati del tracciato scritti a mano: `toPathData()` di opentype.js 2.0 a volte produce "NaN".
const num = (n: number) => String(Math.round(n * 100) / 100);
function pathData(path: Path): string {
  return path.commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${num(c.x)} ${num(c.y)}`;
        case 'Q':
          return `Q${num(c.x1)} ${num(c.y1)} ${num(c.x)} ${num(c.y)}`;
        case 'C':
          return `C${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)}`;
        default:
          return 'Z';
      }
    })
    .join('');
}

function textPathData(text: string, x: number, baseline: number, size: number, weight: Weight): string {
  let cx = x;
  let d = '';
  for (const g of glyphs(text, weight)) {
    d += pathData(g.glyph.getPath(cx, baseline, size));
    cx += ((g.glyph.advanceWidth ?? 0) * size) / g.upm;
  }
  return d;
}

// Testo a capo a parole, al massimo `maxLines` righe (l'ultima con ellissi se il testo non ci sta).
export function wrapText(text: string, cols: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.length > cols ? word.slice(0, cols - 1) + '…' : word;
    if (cur && cur.length + 1 + w.length > cols) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1].replace(/…$/, '');
    kept[maxLines - 1] = (last.length < cols ? last : last.slice(0, -1)) + '…';
    return kept;
  }
  return lines;
}

export type CardText = { title: string; subtitle?: string; host: string };
export type CardLine = { text: string; x: number; y: number; size: number; weight: Weight; opacity: number };

// Righe nella larghezza utile: Fira Mono è a spaziatura fissa, le colonne vengono dalla larghezza di "0".
function fit(text: string, size: number, weight: Weight, maxLines: number): string[] {
  const cols = Math.floor((OG_W - 2 * OG_MARGIN) / textWidth('0', size, weight));
  return wrapText(text, cols, maxLines);
}

// Impaginazione dell'anteprima: scheda di titolo centrata, o testo in basso sopra il fotogramma.
export function cardLayout(t: CardText, withFrame: boolean): CardLine[] {
  const title = fit(t.title, 64, 500, 2);
  const sub = t.subtitle ? fit(t.subtitle, 38, 400, 1) : [];
  const out: CardLine[] = [];
  const add = (lines: string[], y: number, size: number, weight: Weight, opacity: number, lh: number) =>
    lines.forEach((text, i) => out.push({ text, x: OG_MARGIN, y: y + i * lh, size, weight, opacity }));
  const hostY = OG_H - 64;
  if (withFrame) {
    // dal basso: host, artista, titolo
    const subY = hostY - 64;
    const titleY = (sub.length ? subY - 62 : hostY - 72) - (title.length - 1) * 78;
    add(title, titleY, 64, 500, 1, 78);
    add(sub, subY, 38, 400, 0.8, 0);
  } else {
    const block = title.length * 78 + (sub.length ? 58 : 0);
    const titleY = Math.round((OG_H - 40 - block) / 2) + 56;
    add(title, titleY, 64, 500, 1, 78);
    add(sub, titleY + (title.length - 1) * 78 + 74, 38, 400, 0.7, 0);
  }
  add([t.host], hostY, 28, 400, 0.5, 0);
  return out;
}

const scanlines = (w: number, h: number) =>
  `<defs><pattern id="sl" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000" fill-opacity="0.28"/></pattern></defs>` +
  `<rect width="${w}" height="${h}" fill="url(#sl)"/>`;

const svg = (w: number, h: number, body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);

// Testo come tracciati, con un alone sfocato sotto (il bagliore del fosforo).
function textLayer(lines: CardLine[]): string {
  const paths = lines
    .map((l) => `<path d="${textPathData(l.text, l.x, l.y, l.size, l.weight)}" fill-opacity="${l.opacity}"/>`)
    .join('');
  return (
    `<defs><filter id="glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="6"/></filter></defs>` +
    `<g fill="${GREEN}" filter="url(#glow)" opacity="0.6">${paths}</g><g fill="${GREEN}">${paths}</g>`
  );
}

// Cornice del monitor disegnata dentro la scheda opaca: gli angoli dell'immagine restano pieni.
const bezel = (w: number, h: number) =>
  `<rect x="22" y="22" width="${w - 44}" height="${h - 44}" rx="26" fill="none" stroke="${GREEN}" stroke-opacity="0.35" stroke-width="3"/>`;

function titleCardSvg(t: CardText): Buffer {
  return svg(
    OG_W,
    OG_H,
    `<defs><radialGradient id="vg" cx="0.5" cy="0.5" r="0.75"><stop offset="0" stop-color="#0c1d12"/><stop offset="1" stop-color="${BG}"/></radialGradient></defs>` +
      `<rect width="${OG_W}" height="${OG_H}" fill="${BG}"/>` +
      `<rect x="22" y="22" width="${OG_W - 44}" height="${OG_H - 44}" rx="26" fill="url(#vg)"/>` +
      textLayer(cardLayout(t, false)) +
      scanlines(OG_W, OG_H) +
      bezel(OG_W, OG_H),
  );
}

function frameOverlaySvg(t: CardText): Buffer {
  return svg(
    OG_W,
    OG_H,
    `<defs><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0.3" stop-color="${BG}" stop-opacity="0"/><stop offset="0.75" stop-color="${BG}" stop-opacity="0.75"/><stop offset="1" stop-color="${BG}" stop-opacity="0.85"/></linearGradient></defs>` +
      // il fotogramma un po' più scuro, come un fosforo a luminosità ridotta: il testo resta leggibile
      `<rect width="${OG_W}" height="${OG_H}" fill="${BG}" fill-opacity="0.3"/>` +
      `<rect width="${OG_W}" height="${OG_H}" fill="url(#sh)"/>` +
      textLayer(cardLayout(t, true)) +
      scanlines(OG_W, OG_H) +
      bezel(OG_W, OG_H),
  );
}

// Righe nere in alto e in basso (letterbox delle miniature 4:3 di YouTube, o film in 2.35:1):
// una riga è "banda" se quasi tutta nera (tollera i comandi del player stampati sopra). Si toglie
// anche qualche riga di sfumatura JPEG, mai più di metà dell'altezza in tutto.
export async function letterbox(thumb: Buffer): Promise<{ top: number; bottom: number; width: number; height: number }> {
  const { data, info } = await sharp(thumb).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const dark = (y: number) => {
    let sum = 0;
    let black = 0;
    for (let x = 0; x < width; x++) {
      const v = data[(y * width + x) * channels];
      sum += v;
      if (v < 40) black++;
    }
    return black / width >= 0.85 && sum / width < 24;
  };
  let top = 0;
  while (top < height && dark(top)) top++;
  let bottom = 0;
  while (bottom < height - top && dark(height - 1 - bottom)) bottom++;
  const edge = Math.max(1, Math.round(height / 180));
  if (top) top += edge;
  if (bottom) bottom += edge;
  if (top + bottom > height / 2) return { top: 0, bottom: 0, width, height };
  return { top, bottom, width, height };
}

// Fotogramma a tutta area (bande nere tolte, ritaglio centrato), in scala di grigi tinto di verde.
async function tintedFrame(thumb: Buffer, w: number, h: number): Promise<Sharp> {
  const { top, bottom, width, height } = await letterbox(thumb);
  const base = top + bottom > 0 ? sharp(thumb).extract({ left: 0, top, width, height: height - top - bottom }) : sharp(thumb);
  const resized = await base.resize(w, h, { fit: 'cover', position: 'centre' }).png().toBuffer();
  return sharp(resized).greyscale().tint(GREEN);
}

// Fotogramma della canzone con le scanline (immagine nella pagina).
export async function songFrame(thumb: Buffer, w: number, h: number): Promise<Buffer> {
  return (await tintedFrame(thumb, w, h))
    .composite([{ input: svg(w, h, scanlines(w, h)) }])
    .removeAlpha()
    .png()
    .toBuffer();
}

// Anteprima social 1200x630, opaca: scheda di titolo, o fotogramma della canzone con il testo sopra.
// Le scanline arrivano una volta sola, dallo strato di testo.
export async function ogImage(t: CardText, thumb: Buffer | null = null): Promise<Buffer> {
  const img = thumb
    ? (await tintedFrame(thumb, OG_W, OG_H)).composite([{ input: frameOverlaySvg(t) }])
    : sharp(titleCardSvg(t)).flatten({ background: BG });
  return sharp(await img.png().toBuffer())
    .flatten({ background: BG })
    .removeAlpha()
    .png()
    .toBuffer();
}

// Immagine di una canzone nella pagina: fotogramma 640x360, o scheda di titolo senza miniatura.
export async function songImage(t: CardText, thumb: Buffer | null): Promise<Buffer> {
  if (thumb) return songFrame(thumb, 640, 360);
  const card = await ogImage(t, null);
  // `contain` e non `cover`: la cornice del monitor resta intera (le fasce sono dello stesso nero).
  return sharp(card).resize(640, 360, { fit: 'contain', background: BG }).png().toBuffer();
}

// Stessa pipeline di `imageSize()`, così le dimensioni dichiarate nell'HTML coincidono.
export function postImage(file: string): Promise<Buffer> {
  return sharp(file)
    .rotate()
    .greyscale()
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .png()
    .toBuffer();
}
