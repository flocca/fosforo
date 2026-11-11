// Immagini generate in build: anteprime social (OG), fotogrammi delle canzoni, foto dei post.
import sharp from 'sharp';
import { MAX_IMAGE_WIDTH } from './image-size';
import { escapeHtml } from './level0';

const BG = '#050806';
const GREEN = '#33ff66';
const FONT = "ui-monospace, Menlo, 'DejaVu Sans Mono', monospace";

// Testo a capo a parole, al massimo `maxLines` righe (l'ultima con ellissi).
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
    kept[maxLines - 1] = kept[maxLines - 1].replace(/.?$/, '…');
    return kept;
  }
  return lines;
}

const scanlines = (w: number, h: number) =>
  `<defs><pattern id="sl" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000" fill-opacity="0.28"/></pattern></defs>` +
  `<rect width="${w}" height="${h}" fill="url(#sl)"/>`;

const svg = (w: number, h: number, body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);

function textLines(lines: string[], x: number, y: number, size: number, fill: string, opacity = 1): string {
  return lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${y + i * size * 1.25}" font-family="${FONT}" font-size="${size}" fill="${fill}" fill-opacity="${opacity}" xml:space="preserve">${escapeHtml(l)}</text>`,
    )
    .join('');
}

export type CardText = { title: string; subtitle?: string; host: string };

function overlay(w: number, h: number, t: CardText, withShade: boolean): Buffer {
  const lines = wrapText(t.title, 26, 3);
  const sub = t.subtitle ? wrapText(t.subtitle, 40, 1) : [];
  const titleY = 250 - (lines.length - 1) * 40;
  return svg(
    w,
    h,
    (withShade
      ? `<defs><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0.3" stop-color="${BG}" stop-opacity="0"/><stop offset="1" stop-color="${BG}" stop-opacity="0.92"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#sh)"/>`
      : `<rect width="${w}" height="${h}" fill="${BG}"/>`) +
      scanlines(w, h) +
      textLines(lines, 80, titleY + (withShade ? 120 : 0), 64, GREEN) +
      textLines(sub, 80, titleY + (withShade ? 120 : 0) + lines.length * 80, 40, GREEN, 0.7) +
      textLines([t.host], 80, h - 60, 32, GREEN, 0.5) +
      `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="28" fill="none" stroke="${GREEN}" stroke-opacity="0.35" stroke-width="4"/>`,
  );
}

const roundedMask = (w: number, h: number, r: number) =>
  svg(w, h, `<rect width="${w}" height="${h}" rx="${r}" fill="#fff"/>`);

// Fotogramma in scala di grigi tinto di verde fosforo, con scanline.
export async function songFrame(thumb: Buffer, w: number, h: number): Promise<Buffer> {
  // hqdefault è 4:3 con bande nere sopra e sotto: si ritaglia l'area 16:9 centrale.
  const { width = 0, height = 0 } = await sharp(thumb).metadata();
  const letterboxed = width > 0 && Math.abs(width / height - 4 / 3) < 0.02;
  const base = letterboxed
    ? sharp(thumb).extract({ left: 0, top: Math.round(height * 0.125), width, height: Math.round(height * 0.75) })
    : sharp(thumb);
  return base
    .resize(w, h, { fit: 'cover' })
    .greyscale()
    .tint(GREEN)
    .composite([{ input: svg(w, h, scanlines(w, h)) }])
    .png()
    .toBuffer();
}

// Anteprima social 1200x630: scheda di titolo, o fotogramma della canzone con testo sopra.
export async function ogImage(t: CardText, thumb: Buffer | null = null): Promise<Buffer> {
  const w = 1200;
  const h = 630;
  const base = thumb
    ? await sharp(await songFrame(thumb, w, h))
        .composite([{ input: overlay(w, h, t, true) }])
        .png()
        .toBuffer()
    : await sharp(overlay(w, h, t, false)).png().toBuffer();
  return sharp(base)
    .composite([{ input: roundedMask(w, h, 32), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// Immagine di una canzone nella pagina: fotogramma 640x360, o scheda di titolo senza miniatura.
export async function songImage(t: CardText, thumb: Buffer | null): Promise<Buffer> {
  if (thumb) return songFrame(thumb, 640, 360);
  const card = await ogImage(t, null);
  return sharp(card).resize(640, 360, { fit: 'cover' }).png().toBuffer();
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
