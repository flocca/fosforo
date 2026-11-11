// Dimensioni delle immagini dopo l'elaborazione della build (rotazione EXIF, scala di grigi,
// larghezza massima 640, proporzioni mantenute). Condiviso con l'endpoint `/_img`.
import sharp from 'sharp';

export const MAX_IMAGE_WIDTH = 640;

// Calcolo puro: con orientamento EXIF >= 5 larghezza e altezza si scambiano.
export function processedSize(width: number, height: number, orientation = 1): { width: number; height: number } {
  const [w0, h0] = orientation >= 5 ? [height, width] : [width, height];
  const w = Math.min(w0, MAX_IMAGE_WIDTH);
  return { width: w, height: Math.round((h0 * w) / w0) };
}

export async function imageSize(file: string): Promise<{ width: number; height: number } | null> {
  const { width, height, orientation } = await sharp(file).metadata();
  return width && height ? processedSize(width, height, orientation) : null;
}
