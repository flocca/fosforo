import { z } from 'astro/zod';
import { MESSAGE_PLACEHOLDERS, STAMP_PLACEHOLDERS, placeholdersIn } from './reception';
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

// Righe della cornice di ricezione: etichetta, valore con segnaposto, link interno facoltativo.
const receptionRow = z
  .object({
    label: plainText.min(1),
    value: plainText.min(1),
    link: z
      .string()
      .regex(/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/, 'Link atteso come percorso interno con la barra iniziale (es. /chi-sono)')
      .optional(),
  })
  .strict();

const allowedIn =
  (allowed: readonly string[], where: string) =>
  (value: string, ctx: { addIssue: (issue: { code: 'custom'; message: string }) => void }) => {
    for (const name of placeholdersIn(value)) {
      if (!allowed.includes(name)) {
        ctx.addIssue({ code: 'custom', message: `Segnaposto {${name}} non ammesso ${where} (ammessi: ${allowed.map((p) => `{${p}}`).join(', ')})` });
      }
    }
  };

const receptionSchema = z
  .object({
    stamp: receptionRow.optional(),
    message: z.array(receptionRow).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.stamp) allowedIn(STAMP_PLACEHOLDERS, 'nel timbro')(r.stamp.value, ctx);
    for (const row of r.message ?? []) allowedIn(MESSAGE_PLACEHOLDERS, 'nei campi dei messaggi')(row.value, ctx);
  });

export const siteSchema = z
  .object({
    host: z.string().min(1),
    user: z.string().min(1),
    description: plainText.optional(),
    links: z.array(z.object({ name: kebab, title: plainText, url: z.url() }).strict()),
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
    reception: receptionSchema.optional(),
  })
  .strict();

export type Song = z.infer<typeof songSchema>;
export type Book = z.infer<typeof bookSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Post = z.infer<typeof postSchema>;
export type Page = z.infer<typeof pageSchema>;
export type SiteConfig = z.infer<typeof siteSchema>;
