import { z } from 'astro/zod';

// Testo semplice: niente entità HTML né caratteri invisibili.
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/i;
const INVISIBLE = /[\u200B-\u200F\u2060\uFEFF\u00AD]/;

export const plainText = z
  .string()
  .refine((s) => !ENTITY.test(s), { message: 'Il testo contiene un\'entità HTML (es. &eacute;): usa il carattere vero' })
  .refine((s) => !INVISIBLE.test(s), { message: 'Il testo contiene caratteri invisibili (es. zero-width space)' });

// Intro delle canzoni: regole che il servizio (Python re, senza dipendenze) riproduce uguali.
// Solo classi esplicite e sottostringhe: niente \s, \d, \w, punto, ^/$, flag i, trim.
// Lo schema non trasforma il valore: rifiuta e basta.
const INTRO_MAX = 200;
const LINE_BREAK = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
const EDGE_SPACE = /[\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/;
const LINK = /:\/\/|[wW][wW][wW]\.|\]\(/;

export const introText = plainText
  .refine(
    (s) => {
      const n = [...s].length;
      return n >= 1 && n <= INTRO_MAX;
    },
    { message: `L'intro va da 1 a ${INTRO_MAX} caratteri` },
  )
  .refine((s) => !LINE_BREAK.test(s), { message: "L'intro sta su una riga" })
  .refine(
    (s) => {
      const chars = [...s];
      if (chars.length === 0) return true;
      return !EDGE_SPACE.test(chars[0]) && !EDGE_SPACE.test(chars[chars.length - 1]);
    },
    { message: "L'intro non inizia né finisce con uno spazio" },
  )
  .refine((s) => !LINK.test(s), { message: "L'intro non contiene link" });

const OBSIDIAN: [RegExp, string][] = [
  [/\[\[/, '[[ (wikilink o incorporamento)'],
  [/^[ \t]*>[ \t]*\[!/m, '> [! (callout)'],
];

// Nome del primo costrutto Obsidian nel corpo markdown, o null.
export function obsidianSyntax(body: string): string | null {
  for (const [re, name] of OBSIDIAN) if (re.test(body)) return name;
  return null;
}

// Rifiuta la sintassi Obsidian nel corpo markdown; il file serve al messaggio.
export function assertMarkdownBody(body: string, file: string): void {
  const name = obsidianSyntax(body);
  if (name) throw new Error(`${file}: sintassi Obsidian non supportata: ${name}. Usa markdown standard.`);
}
