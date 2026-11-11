import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { cmdToUrl, homeBlocks, level0Html, promptCommand } from '../../src/lib/level0';
import { siteSchema } from '../../src/lib/schema';
import { ogImage, songImage } from '../../src/lib/cards';

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
