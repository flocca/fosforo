import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { POST_GLOB, SONG_GLOB } from './lib/claims';
import { contentDir } from './lib/content-dir';
import {
  bookSchema,
  goalSchema,
  noteSchema,
  postSchema,
  siteSchema,
  songSchema,
} from './lib/schema';

const base = contentDir();

export const collections = {
  canzoni: defineCollection({ loader: glob({ pattern: SONG_GLOB, base }), schema: songSchema }),
  lettura: defineCollection({
    loader: glob({ pattern: ['lettura/*.json', '!lettura/obiettivo.json'], base }),
    schema: bookSchema,
  }),
  noteLettura: defineCollection({ loader: glob({ pattern: 'lettura/*.md', base }), schema: noteSchema }),
  obiettivo: defineCollection({
    loader: glob({ pattern: 'lettura/obiettivo.json', base }),
    schema: goalSchema,
  }),
  messaggi: defineCollection({ loader: glob({ pattern: POST_GLOB, base }), schema: postSchema }),
  sito: defineCollection({ loader: glob({ pattern: 'site.yaml', base }), schema: siteSchema }),
};
