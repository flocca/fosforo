import { describe, expect, it } from 'vitest';
import { imageSize, processedSize } from '../../src/lib/image-size';

describe('image-size', () => {
  it('foto di esempio 800x600 -> 640x480', async () => {
    expect(await imageSize(new URL('../../example-content/post/2026-01-05-prova/foto.jpg', import.meta.url).pathname)).toEqual({ width: 640, height: 480 });
  });
  it('immagini piccole restano, orientamento >= 5 scambia', () => {
    expect(processedSize(300, 200)).toEqual({ width: 300, height: 200 });
    expect(processedSize(800, 600, 6)).toEqual({ width: 600, height: 800 });
    expect(processedSize(1600, 800, 8)).toEqual({ width: 640, height: 1280 });
  });
});
