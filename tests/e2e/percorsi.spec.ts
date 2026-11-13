// Percorsi dei nodi: nessun indirizzo esistente cambia o sparisce. Le pagine nuove si aggiungono a percorsi.txt a mano.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

type Node = { path: string; type: string; children?: Node[] };

const expected = readFileSync(new URL('./percorsi.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);

function collect(node: Node, out: Node[] = []): Node[] {
  out.push(node);
  for (const c of node.children ?? []) collect(c, out);
  return out;
}

async function nodes(request: import('@playwright/test').APIRequestContext): Promise<Node[]> {
  const res = await request.get('/_fs/index.json');
  expect(res.status()).toBe(200);
  return collect((await res.json()).root);
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

test("l'insieme dei percorsi coincide con percorsi.txt", async ({ request }) => {
  const paths = (await nodes(request)).map((n) => `/${n.path}`).sort(cmp);
  expect(paths).toEqual(expected);
});

test('ogni percorso risponde', async ({ request }) => {
  for (const n of await nodes(request)) {
    if (n.type === 'link') continue;
    expect((await request.get(`/${n.path}`)).status(), `/${n.path}`).toBe(200);
    const twin = n.path === '' ? 'root' : n.path;
    expect((await request.get(`/_fs/${twin}.json`)).status(), `/_fs/${twin}.json`).toBe(200);
  }
});
