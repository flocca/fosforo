import { z } from 'astro/zod';

// Testo semplice: niente entità HTML né caratteri invisibili.
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/i;
const INVISIBLE = /[​-‏⁠﻿­]/;

export const plainText = z
  .string()
  .refine((s) => !ENTITY.test(s), { message: 'Il testo contiene un\'entità HTML (es. &eacute;): usa il carattere vero' })
  .refine((s) => !INVISIBLE.test(s), { message: 'Il testo contiene caratteri invisibili (es. zero-width space)' });

const OBSIDIAN: [RegExp, string][] = [
  [/\[\[/, '[[ (wikilink o incorporamento)'],
  [/^[ \t]*>[ \t]*\[!/m, '> [! (callout)'],
];

// Rifiuta la sintassi Obsidian nel corpo markdown; il file serve al messaggio.
export function assertMarkdownBody(body: string, file: string): void {
  for (const [re, name] of OBSIDIAN) {
    if (re.test(body)) {
      throw new Error(`${file}: sintassi Obsidian non supportata: ${name}. Usa markdown standard.`);
    }
  }
}
