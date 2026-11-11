import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { cmdToUrl, homeBlocks, level0Html, promptCommand } from '../../src/lib/level0';
import { siteSchema } from '../../src/lib/schema';
import { OG_MARGIN, OG_W, cardLayout, letterbox, ogImage, songImage, textWidth } from '../../src/lib/cards';

describe('cmdToUrl', () => {
  it('traduce cat e cd in URL senza barra finale', () => {
    expect(cmdToUrl('cat /canzoni/2026-11-10')).toBe('/canzoni/2026-11-10');
    expect(cmdToUrl('cd /lettura && ls')).toBe('/lettura');
    expect(cmdToUrl('cd / && ls')).toBe('/');
    expect(cmdToUrl('help')).toBeNull();
  });
});

describe('level0Html', () => {
  it('esegue l\'escape e produce link e immagini', () => {
    const html = level0Html(
      [{ text: 'p $ ' }],
      [
        { type: 'line', spans: [{ text: 'A & <b>', style: 'bold' }, { text: ' x', cmd: 'cat /x' }, { text: 'y', href: 'https://e.it/?a=1&b=2' }] },
        { type: 'image', src: '/_img/a.png', alt: 'a "b"', width: 10, height: 5 },
      ],
    );
    expect(html).toContain('<span class="bold">A &amp; &lt;b&gt;</span>');
    expect(html).toContain('<a href="/x"> x</a>');
    expect(html).toContain('<a href="https://e.it/?a=1&amp;b=2" rel="noopener" target="_blank">y</a>');
    expect(html).toContain('<span class="ph-img"><img src="/_img/a.png" alt="a &quot;b&quot;"');
  });
  it('mailto: senza target _blank', () => {
    const html = level0Html([], [{ type: 'line', spans: [{ text: 'scrivimi', href: 'mailto:a@b.it' }] }]);
    expect(html).toContain('<a href="mailto:a@b.it">scrivimi</a>');
  });
  it('il comando mostrato dipende dal tipo di nodo', () => {
    expect(promptCommand('', true)).toBe('ls');
    expect(promptCommand('canzoni', true)).toBe('cd /canzoni && ls');
    expect(promptCommand('chi-sono', false)).toBe('cat /chi-sono');
  });
});

describe('immagini', () => {
  it('OG 1200x630 anche con titolo con & e <', async () => {
    const meta = await sharp(await ogImage({ title: 'Rock & <Roll> ' + 'lungo '.repeat(20), host: 'example.com' })).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 630, 'png']);
  });
  it('immagine canzone 640x360 con e senza miniatura', async () => {
    const thumb = await sharp({ create: { width: 480, height: 360, channels: 3, background: '#789' } }).jpeg().toBuffer();
    const t = { title: 'T', subtitle: 'A', host: 'h' };
    for (const input of [thumb, null]) {
      const m = await sharp(await songImage(t, input)).metadata();
      expect([m.width, m.height]).toEqual([640, 360]);
    }
    const og = await sharp(await ogImage(t, thumb)).metadata();
    expect([og.width, og.height]).toEqual([1200, 630]);
  });
  // Miniatura 4:3 con bande nere sopra e sotto (come hqdefault di YouTube), contenuto grigio medio.
  const letterboxed = () =>
    sharp({ create: { width: 480, height: 270, channels: 3, background: '#888' } })
      .extend({ top: 45, bottom: 45, background: '#000' })
      .jpeg()
      .toBuffer();
  const rowMean = async (png: Buffer, y: number) => {
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let x = 0; x < info.width; x++) sum += data[(y * info.width + x) * info.channels];
    return sum / info.width;
  };
  it('anteprime opache, senza canale alfa', async () => {
    const t = { title: 'T', subtitle: 'A', host: 'h' };
    for (const png of [await ogImage(t), await ogImage(t, await letterboxed()), await songImage(t, null)]) {
      const m = await sharp(png).metadata();
      expect(m.hasAlpha).toBe(false);
      expect(m.channels).toBe(3);
    }
  });
  it('trova le bande nere della miniatura', async () => {
    const b = await letterbox(await letterboxed());
    expect(b.top).toBeGreaterThanOrEqual(45);
    expect(b.top).toBeLessThanOrEqual(50);
    expect(b.bottom).toBeGreaterThanOrEqual(45);
    expect(b.bottom).toBeLessThanOrEqual(50);
    const plain = await sharp({ create: { width: 480, height: 270, channels: 3, background: '#888' } }).jpeg().toBuffer();
    expect(await letterbox(plain)).toMatchObject({ top: 0, bottom: 0 });
  });
  it('il fotogramma riempie la scheda: niente bande nere in alto e in basso', async () => {
    const thumb = await letterboxed();
    const og = await ogImage({ title: 'T', subtitle: 'A', host: 'h' }, thumb);
    for (const y of [0, 1, 2]) expect(await rowMean(og, y)).toBeGreaterThan(40);
    const frame = await songImage({ title: 'T', host: 'h' }, thumb);
    for (const y of [0, 1, 358, 359]) expect(await rowMean(frame, y)).toBeGreaterThan(40);
  });
  it('titolo lungo: al massimo 2 righe, ellissi, dentro i margini', () => {
    const title = 'Perché più città sognano ancora: un titolo lunghissimo con accenti che non ci sta';
    for (const withFrame of [false, true]) {
      const lines = cardLayout({ title, subtitle: 'Artista '.repeat(10), host: 'example.com' }, withFrame);
      const titleLines = lines.filter((l) => l.size === 64);
      expect(titleLines).toHaveLength(2);
      expect(titleLines[1].text.endsWith('…')).toBe(true);
      for (const l of lines) {
        expect(l.x).toBeGreaterThanOrEqual(OG_MARGIN);
        expect(l.x + textWidth(l.text, l.size, l.weight)).toBeLessThanOrEqual(OG_W - OG_MARGIN);
        expect(l.y).toBeLessThan(630 - 40);
      }
    }
  });
});

describe('homeBlocks', () => {
  const rest = [{ type: 'line' as const, spans: [{ text: 'x' }] }];
  it('usa welcomeStatic come riga di benvenuto', () => {
    const b = homeBlocks({ welcomeStatic: 'Clicca un nome.' }, rest);
    expect(b[0]).toEqual({ type: 'line', spans: [{ text: 'Clicca un nome.' }] });
    expect(b[1]).toEqual({ type: 'blank' });
    expect(b.slice(2)).toEqual(rest);
  });
  it('senza welcomeStatic non mostra nessun benvenuto', () => {
    expect(homeBlocks({}, rest)).toEqual(rest);
  });
});

describe('siteSchema boot.welcomeStatic', () => {
  const base = { host: 'h', user: 'u', links: [], boot: { rom: [], welcome: 'w', welcomeTouch: 'wt' } };
  it('accetta il campo presente o assente', () => {
    expect(siteSchema.safeParse(base).success).toBe(true);
    expect(siteSchema.safeParse({ ...base, boot: { ...base.boot, welcomeStatic: 's' } }).success).toBe(true);
  });
});
