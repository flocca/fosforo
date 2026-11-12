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

// Vetro della scheda piatta (immagine nella pagina): rettangolo arrotondato con un filo verde.
const GLASS = { inset: 22, radius: 26 };
const bezel = (w: number, h: number) =>
  `<rect x="${GLASS.inset}" y="${GLASS.inset}" width="${w - 2 * GLASS.inset}" height="${h - 2 * GLASS.inset}" rx="${GLASS.radius}" fill="none" stroke="${GREEN}" stroke-opacity="0.35" stroke-width="3"/>`;

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
    `<defs><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0.38" stop-color="${BG}" stop-opacity="0"/><stop offset="0.55" stop-color="${BG}" stop-opacity="0.72"/><stop offset="1" stop-color="${BG}" stop-opacity="0.9"/></linearGradient></defs>` +
      // il fotogramma a piena luminosità nella metà alta; un velo scuro solo sotto titolo e artista
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

// Cornice del monitor nelle anteprime social: plastica scura con i colori del `.monitor` del sito,
// fino ai bordi della scheda; il vetro si vede da un'apertura arrotondata che segue la curvatura.
// Il contenuto è rimpicciolito di `SCREEN_SCALE` (circa 48 px di cornice sopra e sotto, 72 ai lati).
const SCREEN_SCALE = 0.95;
// Apertura nella plastica, in pixel della scheda sorgente: rientro dai bordi e raggio degli angoli.
const OPENING = { insetX: 0, insetY: 12, radius: 34 };
// Larghezza dell'incavo tra plastica e vetro, in pixel d'uscita.
export const RIM = 9;
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const BEZEL = {
  top: hex('#3d382f'), // plastica in alto
  bottom: hex('#24201a'), // plastica in basso
  rimTop: hex('#141210'), // incavo, lato in ombra
  rimBottom: hex('#2e2922'), // incavo, lato in luce (come il fondo di `.screen-well`)
  rimDeep: [8, 7, 6], // fondo dell'incavo, a filo del vetro
  lip: hex('#5a5244'), // labbro chiaro (come l'inset di `.monitor`)
};

// Distanza con segno dal bordo dell'apertura (negativa dentro), in pixel della scheda sorgente.
export function openingDistance(x: number, y: number): number {
  const R = OPENING.radius;
  const qx = Math.abs(x - (OG_W - 1) / 2) - ((OG_W - 1) / 2 - OPENING.insetX) + R;
  const qy = Math.abs(y - (OG_H - 1) / 2) - ((OG_H - 1) / 2 - OPENING.insetY) + R;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Da scheda composta a foto di un vecchio schermo a fosfori: bagliore, scanline (una volta sola),
// grana, banda di scansione, curvatura, vignettatura; intorno la cornice di plastica del monitor.
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

  // 5. curvatura, 6. vignettatura e 7. cornice del monitor, in un solo passaggio sull'immagine d'uscita
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
      const [bu, bv] = barrel(u, v);
      const su = bu / SCREEN_SCALE;
      const sv = bv / SCREEN_SCALE;
      const sx = Math.min(W - 1.001, Math.max(0, su * cx + cx));
      const sy = Math.min(H - 1.001, Math.max(0, sv * cy + cy));
      const o = (y * W + x) * 3;
      const noise = grain[(y >> 1) * gw + (x >> 1)];
      // distanza dal bordo dell'apertura in pixel d'uscita (circa), negativa dentro il vetro:
      // l'apertura segue la curvatura del tubo
      const dist = (openingDistance(su * cx + cx, sv * cy + cy) * SCREEN_SCALE) / (1 + BARREL_K * (u * u + v * v));

      let glass = [0, 0, 0];
      if (dist < 1) {
        const r = Math.sqrt(su * su * 0.8 + sv * sv * 0.8);
        const vig = 1 - 0.6 * smooth(0.45, 1.2, r);
        // ombra interna al bordo del vetro, più marcata in alto (la plastica sporge sopra)
        const depth = -dist;
        const top = sv < 0 ? Math.min(1, -sv * 1.6) : 0;
        const shade = Math.max(0, 1 - 0.85 * Math.exp(-depth / 3) - 0.35 * Math.exp(-depth / (10 + 10 * top)) * (0.5 + 0.5 * top));
        // riflesso della stanza sul vetro, in alto a sinistra (come `.screen-glass` del sito)
        const gx = (u + 0.44) / 0.7;
        const gy = (v + 0.76) / 0.45;
        const glare = 9 * Math.max(0, 1 - gx * gx - gy * gy);
        glass = [0, 1, 2].map(
          (c) => (BG_RGB[c] + (sample(sx, sy, c) - BG_RGB[c]) * vig) * shade + (noise * GREEN_RGB[c]) / 255 + glare,
        );
      }
      let px = glass;
      if (dist > -1) {
        // plastica: gradiente verticale come `.monitor`, luce appena da sinistra, un filo di grana
        const sideLight = 1 + 0.04 * -u;
        const plastic = mix(BEZEL.top, BEZEL.bottom, y / (H - 1)).map((c) => c * sideLight + noise * 0.25);
        // incavo scuro intorno al vetro, come `.screen-well`, che risale verso la plastica
        const rimCol = mix(BEZEL.rimTop, BEZEL.rimBottom, Math.min(1, Math.max(0, (sv + 1) / 2)) ** 1.5);
        let col = mix(mix(BEZEL.rimDeep, rimCol, smooth(0, 2.5, dist)), plastic, smooth(0, RIM, dist));
        // labbro chiaro dove l'incavo incontra la plastica, solo nella metà bassa
        col = mix(col, BEZEL.lip, Math.exp(-((dist - RIM) ** 2) / 1.6) * smooth(-0.2, 0.6, sv) * 0.45);
        // bordo superiore della scheda: filo di luce come l'inset del `.monitor`; in basso un'ombra
        if (y < 2) col = mix(col, BEZEL.lip, 0.7);
        if (y > H - 4) col = col.map((c) => c * 0.7);
        const a = smooth(-0.5, 0.5, dist);
        px = glass.map((g, i) => g * (1 - a) + col[i] * a);
      }
      for (let c = 0; c < 3; c++) out[o + c] = px[c] < 0 ? 0 : px[c] > 255 ? 255 : Math.round(px[c]);
    }
  }

  // PNG a tavolozza: con la grana un PNG a colori pieni supera i 400 KB (WhatsApp scarta le immagini pesanti)
  return sharp(out, { raw }).png({ palette: true, colors: 256, compressionLevel: 9 }).toBuffer();
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

// Bande laterali (pillarbox: un'immagine quadrata o 4:3 dentro il video 16:9): colonne di un colore
// uniforme, nero o grigio, uguale a quello del bordo. Mai più di metà della larghezza in tutto.
export async function pillarbox(thumb: Buffer): Promise<{ left: number; right: number; width: number; height: number }> {
  const { data, info } = await sharp(thumb).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const column = (x: number) => {
    let sum = 0;
    let sq = 0;
    for (let y = 0; y < height; y++) {
      const v = data[(y * width + x) * channels];
      sum += v;
      sq += v * v;
    }
    const mean = sum / height;
    return { mean, sd: Math.sqrt(Math.max(0, sq / height - mean * mean)) };
  };
  const scan = (edge: number, step: number) => {
    const ref = column(edge).mean;
    let n = 0;
    for (let x = edge; n < width / 2; x += step, n++) {
      const c = column(x);
      if (c.sd > 6 || Math.abs(c.mean - ref) > 8) break;
    }
    return n;
  };
  let left = scan(0, 1);
  let right = scan(width - 1, -1);
  // qualche colonna in più per la sfumatura JPEG e l'eventuale bordo della copertina
  const edge = Math.max(1, Math.round(width / 120));
  if (left) left += edge;
  if (right) right += edge;
  if (left + right > width / 2) return { left: 0, right: 0, width, height };
  return { left, right, width, height };
}

// Fotogramma a tutta area: bande nere tolte, ritaglio centrato. Con `sides` anche le bande laterali.
async function croppedFrame(thumb: Buffer, w: number, h: number, sides = false): Promise<Sharp> {
  const { top, bottom, width, height } = await letterbox(thumb);
  const { left, right } = sides ? await pillarbox(thumb) : { left: 0, right: 0 };
  const base =
    top + bottom + left + right > 0
      ? sharp(thumb).extract({ left, top, width: width - left - right, height: height - top - bottom })
      : sharp(thumb);
  return base.resize(w, h, { fit: 'cover', position: 'centre' });
}

// Fotogramma in scala di grigi tinto di verde (immagine nella pagina).
async function tintedFrame(thumb: Buffer, w: number, h: number): Promise<Sharp> {
  const resized = await (await croppedFrame(thumb, w, h)).png().toBuffer();
  return sharp(resized).greyscale().tint(GREEN);
}

// Fotogramma tinto per l'anteprima, già in RGB: luminanza del grigio sul verde del fosforo, con le
// luci più forti che virano appena al bianco come un fosforo saturo.
async function phosphorFrame(thumb: Buffer): Promise<Buffer> {
  // un solo canale, la luminanza: l'alfa (se c'è) è tolto prima della scala di grigi
  // bande laterali tolte e contrasto steso (1°-99° percentile): un fotogramma chiaro o spento
  // (una copertina disegnata a matita, un video scuro) resta riconoscibile
  const stretched = await (await croppedFrame(thumb, OG_W, OG_H, true))
    .removeAlpha()
    .greyscale()
    .normalise({ lower: 1, upper: 99 })
    .png()
    .toBuffer();
  const { data: grey, info } = await sharp(stretched).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error(`fotogramma in scala di grigi con ${info.channels} canali invece di 1`);
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
