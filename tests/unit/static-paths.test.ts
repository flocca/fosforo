import { describe, expect, it } from 'vitest';
import { buildStoreFrom } from '../../src/lib/store';
import { pageMeta } from '../../src/lib/static-paths';
import type { SiteConfig } from '../../src/lib/schema';

const storeWith = (site: Partial<SiteConfig>) =>
  buildStoreFrom({
    songs: [],
    books: [],
    bookNotes: [],
    goal: undefined,
    posts: [],
    pages: [],
    site: { host: 'h', user: 'u', links: [], boot: { rom: [], welcome: 'w', welcomeTouch: 'wt' }, ...site },
  });

describe('pageMeta della home', () => {
  it('home: description da site.yaml', () => {
    const store = storeWith({ description: 'Terminale ricevente. Tutto archiviato.' });
    expect(pageMeta('', store)!.description).toBe('Terminale ricevente. Tutto archiviato.');
  });

  it('home: description di default', () => {
    expect(pageMeta('', storeWith({}))!.description).toBe('h: canzoni, letture e pagine, in forma di terminale.');
  });
});
