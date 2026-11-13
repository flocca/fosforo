import { describe, expect, it } from 'vitest';
import { bookSchema, goalSchema, postSchema, siteSchema, songSchema } from '../../src/lib/schema';
import { assertMarkdownBody } from '../../src/lib/text';

const validSong = {
  date: '2026-11-10',
  title: 'Iris',
  artist: 'Drew',
  album: 'Un album',
  appleTrackId: '12345',
  links: {
    appleMusic: 'https://music.apple.com/it/album/x/1?i=12345',
    spotify: 'https://open.spotify.com/track/abc',
  },
};

const validBook = {
  id: '0123456789abcdef0123456789abcdef',
  slug: 'termination-shock',
  title: 'Termination Shock',
  authors: ['Neal Stephenson'],
  pages: 700,
  progress: 1,
  status: 'finito',
  startedAt: '2026-10-01T20:00:00+02:00',
  finishedAt: '2026-11-02T22:10:00+01:00',
  lastReadAt: '2026-11-02T22:10:00+01:00',
  totalSeconds: 3600,
  days: [{ date: '2026-11-02', seconds: 3600 }],
};

describe('songSchema', () => {
  it('accetta una canzone con intro', () => {
    const song = { ...validSong, intro: 'Chiede di inoltrarla: eseguo.' };
    expect(songSchema.parse(song)).toEqual(song);
  });
  it('rifiuta intro null', () => {
    expect(() => songSchema.parse({ ...validSong, intro: null })).toThrow();
  });
  it('rifiuta intro con link', () => {
    expect(() => songSchema.parse({ ...validSong, intro: 'https://x.it' })).toThrow();
  });
  it('accetta una canzone valida', () => {
    expect(songSchema.parse(validSong)).toEqual(validSong);
  });
  it('accetta una canzone senza album e senza spotify', () => {
    const { album, ...rest } = validSong;
    const song = { ...rest, links: { appleMusic: validSong.links.appleMusic } };
    expect(songSchema.parse(song)).toEqual(song);
  });
  it('accetta la data letta dal YAML come Date e la riporta a stringa', () => {
    const parsed = songSchema.parse({ ...validSong, date: new Date('2026-11-10T00:00:00Z') });
    expect(parsed.date).toBe('2026-11-10');
  });
  it('rifiuta album null', () => {
    expect(() => songSchema.parse({ ...validSong, album: null })).toThrow();
  });
  it('rifiuta entità HTML nel titolo', () => {
    expect(() => songSchema.parse({ ...validSong, title: 'Caf&eacute;' })).toThrow();
  });
  it('rifiuta caratteri invisibili nel titolo', () => {
    expect(() => songSchema.parse({ ...validSong, title: '\u200bIris' })).toThrow();
  });
  it('rifiuta chiavi sconosciute in links', () => {
    const links = { ...validSong.links, deezer: 'https://deezer.com/x' };
    expect(() => songSchema.parse({ ...validSong, links })).toThrow();
  });
});

describe('bookSchema', () => {
  it('accetta un libro finito valido', () => {
    expect(bookSchema.parse(validBook)).toEqual(validBook);
  });
  it('rifiuta finito senza finishedAt', () => {
    const { finishedAt, ...b } = validBook;
    expect(() => bookSchema.parse(b)).toThrow();
  });
  it('rifiuta in-corso con finishedAt', () => {
    expect(() => bookSchema.parse({ ...validBook, status: 'in-corso' })).toThrow();
  });
  it('rifiuta progress fuori da 0..1', () => {
    expect(() => bookSchema.parse({ ...validBook, progress: 1.2 })).toThrow();
  });
  it('rifiuta days[].pages', () => {
    const days = [{ date: '2026-11-02', seconds: 10, pages: 3 }];
    expect(() => bookSchema.parse({ ...validBook, days })).toThrow();
  });
  it('rifiuta istanti senza offset', () => {
    expect(() => bookSchema.parse({ ...validBook, startedAt: '2026-10-01T20:00:00' })).toThrow();
  });
});

describe('goalSchema', () => {
  it('accetta un obiettivo valido', () => {
    expect(goalSchema.parse({ year: 2026, target: 2, finished: 1 })).toEqual({
      year: 2026,
      target: 2,
      finished: 1,
    });
  });
  it('accetta since, il giorno da cui parte il conteggio, solo nello stesso anno', () => {
    expect(goalSchema.parse({ year: 2026, since: '2026-11-12', target: 2, finished: 0 }).since).toBe('2026-11-12');
    expect(() => goalSchema.parse({ year: 2026, since: '2025-11-12', target: 2, finished: 0 })).toThrow();
    expect(() => goalSchema.parse({ year: 2026, since: '12/11/2026', target: 2, finished: 0 })).toThrow();
    expect(() => goalSchema.parse({ year: 2026, since: null, target: 2, finished: 0 })).toThrow();
  });
});

describe('assertMarkdownBody', () => {
  it('rifiuta la sintassi Obsidian nominando il file', () => {
    expect(() => assertMarkdownBody('vedi [[nota]]', 'post/x/index.md')).toThrow(/post\/x\/index\.md/);
    expect(() => assertMarkdownBody('![[img.png]]', 'a.md')).toThrow();
    expect(() => assertMarkdownBody('> [!note] x', 'a.md')).toThrow();
  });
  it('accetta markdown normale', () => {
    expect(() => assertMarkdownBody('un [link](https://x)', 'a.md')).not.toThrow();
  });
});

describe('siteSchema', () => {
  const validSite = { host: 'h', user: 'u', links: [], boot: { rom: [], welcome: 'help', welcomeTouch: 'help' } };

  it('accetta una description', () => {
    expect(siteSchema.parse({ ...validSite, description: 'Terminale ricevente.' }).description).toBe('Terminale ricevente.');
  });

  it('rifiuta entità HTML nella description', () => {
    expect(() => siteSchema.parse({ ...validSite, description: 'a &amp; b' })).toThrow();
  });

  const reception = {
    stamp: { label: 'RICEZIONE', value: '{data}' },
    message: [
      { label: 'OPERATORE', value: 'flocca' },
      { label: 'DIMENSIONE', value: '{byte} byte' },
      { label: 'CONTROLLO', value: '{controllo} OK' },
      { label: 'ALLEGATI', value: '{allegati}' },
      { label: 'RISPOSTE', value: 'rispondi', link: '/rispondi' },
    ],
  };

  it('accetta un modello reception completo e lo lascia uguale', () => {
    expect(siteSchema.parse({ ...validSite, reception }).reception).toEqual(reception);
  });

  it('rifiuta {byte} nel timbro', () => {
    expect(() => siteSchema.parse({ ...validSite, reception: { stamp: { label: 'RICEZIONE', value: '{byte}' } } })).toThrow(/byte/);
  });

  it('rifiuta un segnaposto sconosciuto nei campi', () => {
    expect(() => siteSchema.parse({ ...validSite, reception: { message: [{ label: 'X', value: '{sconosciuto}' }] } })).toThrow(/sconosciuto/);
  });

  it("rifiuta un'etichetta vuota", () => {
    expect(() => siteSchema.parse({ ...validSite, reception: { message: [{ label: '', value: 'x' }] } })).toThrow();
  });

  it('rifiuta un link senza barra iniziale', () => {
    expect(() => siteSchema.parse({ ...validSite, reception: { message: [{ label: 'R', value: 'x', link: 'rispondi' }] } })).toThrow();
  });

  it('rifiuta una chiave sconosciuta in una riga', () => {
    expect(() => siteSchema.parse({ ...validSite, reception: { message: [{ label: 'R', value: 'x', colore: 'rosso' }] } })).toThrow();
  });

  it('rifiuta reception: null', () => {
    expect(() => siteSchema.parse({ ...validSite, reception: null })).toThrow();
  });
});

describe('postSchema', () => {
  const post = { title: 'Hello world', date: '2026-11-11' };

  it('accetta receivedAt con offset e lo lascia uguale', () => {
    expect(postSchema.parse({ ...post, receivedAt: '2026-11-11T22:10:00+01:00' }).receivedAt).toBe('2026-11-11T22:10:00+01:00');
  });

  it('rifiuta receivedAt letto da YAML come data e chiede le virgolette', () => {
    const r = postSchema.safeParse({ ...post, receivedAt: new Date('2026-11-11T21:10:00Z') });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message).join(' ')).toMatch(/virgolette/);
  });

  it('rifiuta receivedAt senza offset', () => {
    expect(() => postSchema.parse({ ...post, receivedAt: '2026-11-11T22:10:00' })).toThrow();
  });

  it('rifiuta receivedAt in un giorno diverso da date', () => {
    expect(() => postSchema.parse({ ...post, receivedAt: '2026-11-12T00:30:00+01:00' })).toThrow();
    expect(() => postSchema.parse({ ...post, date: '2026-11-12', receivedAt: '2026-11-11T23:30:00+01:00' })).toThrow();
  });

  it('rifiuta receivedAt: null', () => {
    expect(() => postSchema.parse({ ...post, receivedAt: null })).toThrow();
  });
});
