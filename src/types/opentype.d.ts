// Dichiarazione minima di opentype.js (il pacchetto non porta i tipi): solo ciò che usa `cards.ts`.
declare module 'opentype.js' {
  export interface Glyph {
    index: number;
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): Path;
  }
  export type PathCommand =
    | { type: 'M' | 'L'; x: number; y: number }
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: 'Z' };
  export interface Path {
    commands: PathCommand[];
  }
  export interface Font {
    unitsPerEm: number;
    hasChar(c: string): boolean;
    charToGlyph(c: string): Glyph;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
