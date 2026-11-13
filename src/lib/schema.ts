import { z } from 'astro/zod';
import { PAGE_NAME, RESERVED_FOLDER_NAMES } from './claims';
import { introText, plainText } from './text';

// Il YAML non quotato (date: 2026-11-10) viene letto come Date a mezzanotte UTC:
// lo si riporta alla stringa YYYY-MM-DD, che è il formato dei contenuti.
const date = z.preprocess(
  (v) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data attesa nel formato YYYY-MM-DD'),
);
const instant = z.iso.datetime({ offset: true, error: 'Istante ISO 8601 con offset atteso (es. 2026-11-02T22:10:00+01:00)' });
const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Atteso kebab-case minuscolo');
const nonNegInt = z.number().int().nonnegative();

export const songSchema = z
  .object({
    date,
    title: plainText,
    artist: plainText,
    album: plainText.optional(),
    appleTrackId: z.string().regex(/^\d+$/, 'appleTrackId deve essere numerico'),
    links: z
      .object({
        appleMusic: z.url(),
        spotify: z.url().optional(),
        youtube: z.url().optional(),
      })
      .strict(),
    intro: introText.optional(),
  })
  .strict();

export const bookSchema = z
  .object({
    id: z.string().regex(/^[0-9a-f]{32}$/, 'id atteso: 32 caratteri esadecimali'),
    slug: kebab,
    title: plainText,
    authors: z.array(plainText),
    pages: nonNegInt,
    progress: z.number().min(0).max(1),
    status: z.enum(['in-corso', 'finito']),
    startedAt: instant,
    finishedAt: instant.optional(),
    lastReadAt: instant,
    totalSeconds: nonNegInt,
    days: z.array(z.object({ date, seconds: nonNegInt }).strict()),
  })
  .strict()
  .refine((b) => (b.status === 'finito') === (b.finishedAt !== undefined), {
    message: 'finishedAt deve essere presente se e solo se status è "finito"',
    path: ['finishedAt'],
  });

// `since`: il giorno da cui parte il conteggio, solo se non è il 1° gennaio (l'anno di attivazione).
export const goalSchema = z
  .object({ year: nonNegInt, since: date.optional(), target: nonNegInt, finished: nonNegInt })
  .strict()
  .refine((g) => g.since === undefined || g.since.startsWith(`${g.year}-`), {
    message: '`since` deve cadere nello stesso anno di `year`',
    path: ['since'],
  });

export const postSchema = z
  .object({
    title: plainText,
    date,
    description: plainText.optional(),
    draft: z.boolean().default(false),
  })
  .strict();

export const pageSchema = z
  .object({ title: plainText, order: z.number().optional() })
  .strict();

export const noteSchema = z.object({}).strict();

export const siteSchema = z
  .object({
    host: z.string().min(1),
    user: z.string().min(1),
    description: plainText.optional(),
    links: z.array(z.object({ name: kebab, title: plainText, url: z.url() }).strict()),
    // Cartelle libere di primo livello da pubblicare, nell'ordine in cui compaiono in `ls /`.
    cartelle: z
      .array(
        z
          .object({
            name: z.string().regex(PAGE_NAME, 'Nome di cartella atteso: kebab-case minuscolo che inizia con una lettera'),
            title: plainText.optional(),
          })
          .strict(),
      )
      .optional(),
    boot: z
      .object({
        rom: z.array(
          z
            .object({
              text: z.string(),
              pause: z.number().nonnegative(),
              disk: z.number().nonnegative().optional(),
            })
            .strict(),
        ),
        welcome: plainText,
        welcomeTouch: plainText,
        welcomeStatic: plainText.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((site, ctx) => {
    const reserved = new Set<string>(RESERVED_FOLDER_NAMES);
    const links = new Set(site.links.map((l) => l.name));
    const seen = new Set<string>();
    (site.cartelle ?? []).forEach(({ name }, i) => {
      const path = ['cartelle', i, 'name'];
      if (reserved.has(name)) ctx.addIssue({ code: 'custom', path, message: `La cartella "${name}" ha un nome riservato al motore` });
      if (seen.has(name)) ctx.addIssue({ code: 'custom', path, message: `La cartella "${name}" compare due volte` });
      if (links.has(name)) ctx.addIssue({ code: 'custom', path, message: `La cartella "${name}" ha lo stesso nome di un link` });
      seen.add(name);
    });
  });

export type Song = z.infer<typeof songSchema>;
export type Book = z.infer<typeof bookSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Post = z.infer<typeof postSchema>;
export type Page = z.infer<typeof pageSchema>;
export type SiteConfig = z.infer<typeof siteSchema>;
