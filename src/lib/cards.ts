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

// Testo come tracciati; nella versione piatta (pagina) con un alone sfocato sotto. Nelle anteprime
// social l'alone arriva dal passaggio CRT su pixel (`crtEffects`).
function textLayer(lines: CardLine[], svgGlow: boolean): string {
  const paths = lines
    .map((l) => `<path d="${textPathData(l.text, l.x, l.y, l.size, l.weight)}" fill-opacity="${l.opacity}"/>`)
    .join('');
  const glow = svgGlow
    ? `<defs><filter id="glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="6"/></filter></defs>` +
      `<g fill="${GREEN}" filter="url(#glow)" opacity="0.6">${paths}</g>`
    : '';
  return `${glow}<g fill="${GREEN}">${paths}</g>`;
}

// Vetro del monitor: rettangolo arrotondato dentro la scheda opaca, gli angoli dell'immagine restano pieni.
const GLASS = { inset: 22, radius: 26 };
const bezel = (w: number, h: number) =>
  `<rect x="${GLASS.inset}" y="${GLASS.inset}" width="${w - 2 * GLASS.inset}" height="${h - 2 * GLASS.inset}" rx="${GLASS.radius}" fill="none" stroke="${GREEN}" stroke-opacity="0.35" stroke-width="3"/>`;
// Tutto ciò che sta fuori dal vetro, pieno del colore del tubo (angoli squadrati e opachi).
const outsideGlass = (w: number, h: number) => {
  const i = GLASS.inset;
  const r = GLASS.radius;
  const inner = `M${i + r} ${i}H${w - i - r}A${r} ${r} 0 0 1 ${w - i} ${i + r}V${h - i - r}A${r} ${r} 0 0 1 ${w - i - r} ${h - i}H${i + r}A${r} ${r} 0 0 1 ${i} ${h - i - r}V${i + r}A${r} ${r} 0 0 1 ${i + r} ${i}Z`;
  return `<path fill-rule="evenodd" fill="${BG}" d="M0 0H${w}V${h}H0Z${inner}"/>`;
};

const vignetteGradient = `<defs><radialGradient id="vg" cx="0.5" cy="0.5" r="0.75"><stop offset="0" stop-color="#0c1d12"/><stop offset="1" stop-color="${BG}"/></radialGradient>` +
  `<radialGradient id="vr" cx="0.5" cy="0.5" r="0.75"><stop offset="0" stop-color="#10261a"/><stop offset="1" stop-color="#0a160e"/></radialGradient></defs>`;

// `flat`: la versione per la pagina (scanline e cornice in SVG); altrimenti solo il contenuto,
// a cui `crtEffects` aggiunge bagliore, scanline, disturbo, curvatura e cornice.
function titleCardSvg(t: CardText, flat: boolean): Buffer {
  const lines = cardLayout(t, false);
  if (!flat) return svg(OG_W, OG_H, vignetteGradient + `<rect width="${OG_W}" height="${OG_H}" fill="url(#vr)"/>` + textLayer(lines, false));
  return svg(
    OG_W,
    OG_H,
    vignetteGradient +
      `<rect width="${OG_W}" height="${OG_H}" fill="${BG}"/>` +
      `<rect x="22" y="22" width="${OG_W - 44}" height="${OG_H - 44}" rx="26" fill="url(#vg)"/>` +
      textLayer(lines, true) +
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
      textLayer(cardLayout(t, true), false),
  );
}

// ── effetti CRT sulle anteprime social ──────────────────────────────────────────────────────────

// Curvatura del tubo: un punto in coordinate normalizzate (centro 0, bordi ±1) va a prendere il
// pixel sorgente più in fuori, tanto più quanto è lontano dal centro. Il centro resta fermo.
export const BARREL_K = 0.1;
export function barrel(u: number, v: number, k = BARREL_K): [number, number] {
  const f = 1 + k * (u * u + v * v);
  return [u * f, v * f];
}

// Generatore pseudocasuale con seme (mulberry32) e hash FNV-1a: stessa scheda, stessi pixel ovunque.
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BG_RGB = [5, 8, 6];
const GREEN_RGB = [0x33, 0xff, 0x66];

// Da scheda composta a foto di un vecchio schermo a fosfori: bagliore, scanline (una volta sola),
// grana, banda di scansione, vignettatura, curvatura; sopra, nitida, la cornice del vetro.
async function crtEffects(card: Buffer, seed: string): Promise<Buffer> {
  const W = OG_W;
  const H = OG_H;
  const raw = { width: W, height: H, channels: 3 as const };
  const src = await sharp(card).flatten({ background: BG }).removeAlpha().raw().toBuffer();
  const n = W * H * 3;

  // 1. bagliore: solo le parti chiare, sfocate e sommate in "screen" (come il text-shadow del sito)
  const bright = Buffer.alloc(n);
  for (let i = 0; i < n; i += 3) {
    const l = 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2];
    const m = l > 110 ? Math.min(1, (l - 110) / 70) : 0;
    bright[i] = src[i] * m;
    bright[i + 1] = src[i + 1] * m;
    bright[i + 2] = src[i + 2] * m;
  }
  const halo = await sharp(bright, { raw }).blur(9).raw().toBuffer();
  const rnd = prng(hash(seed));
  const bandY = H * (0.2 + 0.6 * rnd());
  const bandH = H * 0.12;
  // grana a grani di 2x2 pixel e su pochi livelli: si vede come in foto e il PNG resta leggero
  const gw = W / 2;
  const grain = new Float32Array(gw * (H / 2));
  for (let i = 0; i < grain.length; i++) {
    const r = rnd();
    grain[i] = r < 0.1 ? -5 : r > 0.9 ? 5 : 0;
  }
  const img = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    // 2. scanline: 2 righe su 4 più scure, come il motivo SVG della pagina
    const scan = y % 4 < 2 ? 0.74 : 1;
    // 4. banda di scansione: una striscia appena più chiara
    const d = (y - bandY) / bandH;
    const band = 10 * Math.exp(-d * d);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      // 3. grana: rumore di luminanza a bassa ampiezza
      for (let c = 0; c < 3; c++) {
        const a = src[i + c] / 255;
        const g = (halo[i + c] / 255) * 0.75;
        const v = (1 - (1 - a) * (1 - g)) * 255 * scan;
        img[i + c] = v + (band * GREEN_RGB[c]) / 255;
      }
    }
  }

  // 5. vignettatura e 6. curvatura, in un solo passaggio sull'immagine d'uscita
  const out = Buffer.alloc(n);
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const sample = (sx: number, sy: number, c: number) => {
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const fx = sx - x0;
    const fy = sy - y0;
    const at = (x: number, y: number) => img[(y * W + x) * 3 + c];
    return (
      (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
    );
  };
  for (let y = 0; y < H; y++) {
    const v = (y - cy) / cy;
    for (let x = 0; x < W; x++) {
      const u = (x - cx) / cx;
      const [su, sv] = barrel(u, v);
      const sx = su * cx + cx;
      const sy = sv * cy + cy;
      const o = (y * W + x) * 3;
      if (sx < 0 || sy < 0 || sx > W - 2 || sy > H - 2) {
        out[o] = BG_RGB[0];
        out[o + 1] = BG_RGB[1];
        out[o + 2] = BG_RGB[2];
        continue;
      }
      const r = Math.sqrt(su * su * 0.8 + sv * sv * 0.8);
      const t = Math.min(1, Math.max(0, (r - 0.45) / 0.75));
      const vig = 1 - 0.6 * t * t * (3 - 2 * t);
      const noise = grain[(y >> 1) * gw + (x >> 1)];
      // riflesso della stanza sul vetro, in alto a sinistra (come `.screen-glass` del sito)
      const gx = (u + 0.44) / 0.7;
      const gy = (v + 0.76) / 0.45;
      const glare = 9 * Math.max(0, 1 - gx * gx - gy * gy);
      for (let c = 0; c < 3; c++) {
        const val = BG_RGB[c] + (sample(sx, sy, c) - BG_RGB[c]) * vig + (noise * GREEN_RGB[c]) / 255 + glare;
        out[o + c] = val < 0 ? 0 : val > 255 ? 255 : Math.round(val);
      }
    }
  }

  // PNG a tavolozza: con la grana un PNG a colori pieni supera i 400 KB (WhatsApp scarta le immagini pesanti)
  const flat = await sharp(out, { raw })
    .composite([{ input: svg(W, H, outsideGlass(W, H) + bezel(W, H)) }])
    .removeAlpha()
    .raw()
    .toBuffer();
  return sharp(flat, { raw }).png({ palette: true, colors: 256, compressionLevel: 9 }).toBuffer();
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

// Fotogramma tinto per l'anteprima, già in RGB: luminanza del grigio sul verde del fosforo, con le
// luci più forti che virano appena al bianco come un fosforo saturo.
async function phosphorFrame(thumb: Buffer): Promise<Buffer> {
  const grey = await (await tintedFrame(thumb, OG_W, OG_H)).greyscale().raw().toBuffer();
  const rgb = Buffer.alloc(OG_W * OG_H * 3);
  for (let p = 0; p < OG_W * OG_H; p++) {
    const v = grey[p] / 255;
    const white = v * v * 0.35;
    for (let c = 0; c < 3; c++) rgb[p * 3 + c] = Math.round(255 * (v * (GREEN_RGB[c] / 255) * (1 - white) + white * v));
  }
  return sharp(rgb, { raw: { width: OG_W, height: OG_H, channels: 3 } }).png().toBuffer();
}

// Fotogramma della canzone con le scanline (immagine nella pagina).
export async function songFrame(thumb: Buffer, w: number, h: number): Promise<Buffer> {
  return (await tintedFrame(thumb, w, h))
    .composite([{ input: svg(w, h, scanlines(w, h)) }])
    .removeAlpha()
    .png()
    .toBuffer();
}

// Anteprima social 1200x630, opaca: scheda di titolo, o fotogramma della canzone con il testo sopra,
// passata per gli effetti CRT. `seed` (il percorso della scheda) rende la grana riproducibile.
export async function ogImage(t: CardText, thumb: Buffer | null = null, seed = `${t.title}|${t.host}`): Promise<Buffer> {
  // il fotogramma tinto diventa PNG prima del testo: altrimenti `tint()` sbiadisce anche il testo
  const frame = thumb ? await phosphorFrame(thumb) : null;
  const img = frame ? sharp(frame).composite([{ input: frameOverlaySvg(t) }]) : sharp(titleCardSvg(t, false));
  return crtEffects(await img.png().toBuffer(), seed);
}

// Immagine di una canzone nella pagina: fotogramma 640x360, o scheda di titolo senza miniatura.
export async function songImage(t: CardText, thumb: Buffer | null): Promise<Buffer> {
  if (thumb) return songFrame(thumb, 640, 360);
  // la scheda piatta: lo schermo del sito aggiunge già i suoi effetti
  const card = await sharp(titleCardSvg(t, true)).flatten({ background: BG }).removeAlpha().png().toBuffer();
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
