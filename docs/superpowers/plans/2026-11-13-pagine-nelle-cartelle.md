# Folder pages (fosforo#2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hand-written `.md` pages inside `canzoni/` and `messaggi/`, listed first in `ls`, with broken pages giving warnings instead of failing the build, and no existing URL changing.

**Architecture:** Typed files (songs, messages, books, root pages, `site.yaml`) stay in their strict Astro collections. A `node:fs` scanner collects the leftover `.md` of `canzoni/` and `messaggi/` as raw text; pure code in `buildStoreFrom` parses them (`yaml` + `pageSchema.safeParse`), places them in the tree, and records warnings. The store gains a path map (`nodes`) and a warnings list; `FsNode` gains `section` so `listing` knows where to put the blank lines.

**Tech Stack:** Astro 7 content collections, TypeScript, `yaml`, vitest, Playwright 1.64.1.

**Spec:** `docs/superpowers/specs/2026-11-13-pagine-nelle-cartelle-design.md` (approved), which builds on `/Users/flocca/src/flocca.com/docs/superpowers/specs/2026-11-13-terminale-filesystem-direzione.md` sections 1 and 2.

**Planning session:** fosforo-fondamenta

## Global Constraints

- Code identifiers in English; code comments, logs, warning and error messages in Italian (real accents, straight quotes, never U+2014).
- `README.md` in Italian; `CLAUDE.md` and plans in English.
- No change to `src/lib/schema.ts`. `pageSchema` (`{ title: plainText, order?: number }`, strict) is reused for folder pages.
- Client modules (`src/client/*`, and `src/lib/fs-tree.ts` which they import) never import `store.ts`, `render.ts`, `sharp`, `astro:content`, `yaml` or `node:*`.
- Page name in a folder: `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` (file name without `.md`).
- Song file: `canzoni/` + `/^\d{4}-\d{2}-\d{2}\.md$/`; Astro glob `canzoni/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md` (verified with tinyglobby). Message: `messaggi/<folder>/index.md`, the whole folder belongs to the message, drafts included.
- At most 4 pages before the archive (`section: 'head'`), the rest after it (`section: 'tail'`).
- Ignored silently in every scanned folder: `README.md`, `CLAUDE.md`, `AGENTS.md`, and every name starting with `.`.
- `npm run check` before every commit; e2e with `npm run build && npx playwright test` (the config builds and serves on 4329 itself; never leave a server running). Shared files with session `fosforo-ricezione` (group B): stay out of `song()` and the `'post'` case in `render.ts`, the posts block of `buildStoreFrom`, the `INVISIBLE` class in `text.ts`, and the Canzoni/Post/site.yaml sections of the README.

## Review Focus

1. A `.md` in `canzoni/` whose name starts with a digit but is not `AAAA-MM-GG` (a mis-named song from the service): must fail the build, not become a skipped page. Test in Task 3.
2. A page with the same name as a **draft** message folder (`messaggi/bozza.md` next to `messaggi/bozza/index.md` with `draft: true`): the page is skipped with a warning, the draft stays unpublished. Test in Task 3.
3. A folder with pages but no archive (`canzoni/` with only `leggimi.md`): the folder exists, `canzone-del-giorno` does not, the root order stays canzone-del-giorno, canzoni, lettura, messaggi, pages, links. Test in Task 3.
4. Frontmatter edge cases: CRLF line endings, a BOM, `---` with no closing line, empty frontmatter: never throw, always a page or a warning. Tests in Task 2.
5. A root page named like a link or the alias (`github.md` with link `github`): the build fails with a clear message (today it silently shadows). Test in Task 3.

---

### Task 1: Path baseline (before any code change)

**Files:**
- Create: `tests/e2e/percorsi.txt`, `tests/e2e/percorsi.spec.ts`
- Scratch (not committed): `$SCRATCH/flocca-prima/` (`$SCRATCH` = this session's scratchpad)

**Interfaces:**
- Produces: `tests/e2e/percorsi.txt`, one node path per line (root as `/`, others as `/<path>`), sorted with `LC_ALL=C sort`. Later tasks append the new pages to it.

- [ ] **Step 1: Generate the list from today's code.** `npm run build`, then a node one-liner that walks `dist/_fs/index.json` `root` recursively and prints `/` + `path` for every node, piped to `LC_ALL=C sort > tests/e2e/percorsi.txt`. Expect 15-20 lines including `/canzone-del-giorno`, `/canzoni/2026-11-10`, `/messaggi/2026-01-05-prova`, `/owlcavelabs`.
- [ ] **Step 2: Write `percorsi.spec.ts`.** Test `l'insieme dei percorsi coincide con percorsi.txt`: fetch `/_fs/index.json`, collect paths the same way, sort, `expect(paths).toEqual(fileLines)`. Test `ogni percorso risponde`: for each non-link path, `GET /<path>` is 200 and `GET /_fs/<twin>.json` is 200 (`twin` = `root` for `/`). Link nodes (type `link`) are skipped in the second test.
- [ ] **Step 3: Run** `npx playwright test tests/e2e/percorsi.spec.ts`. Expected: PASS.
- [ ] **Step 4: Real-site baseline.** `CONTENT_DIR=/Users/flocca/src/flocca.com SITE_URL=https://flocca.com npm run build`, then `(cd dist && find . -type f | LC_ALL=C sort) > $SCRATCH/flocca-prima/files.txt` and `cp -R dist/_fs $SCRATCH/flocca-prima/_fs`. Then `npm run build` again so `dist/` is example-content.
- [ ] **Step 5: Commit** `tests/e2e/percorsi.txt` and `tests/e2e/percorsi.spec.ts` ("Elenco dei percorsi di oggi, per confrontarli dopo il cambio").

### Task 2: Claims and folder-page parsing (pure)

**Files:**
- Create: `src/lib/claims.ts`, `src/lib/folder-page.ts`
- Modify: `src/lib/text.ts` (add a non-throwing check; `assertMarkdownBody` uses it), `src/content.config.ts` (globs from `claims.ts`), `package.json` + lockfile (`yaml` from devDependencies to dependencies, same version range, `npm install`)
- Test: `tests/unit/claims.test.ts`, `tests/unit/folder-page.test.ts`

**Interfaces:**
- Produces, in `claims.ts`:
  - `SONG_GLOB = 'canzoni/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md'`, `POST_GLOB = 'messaggi/*/index.md'`
  - `FOLDER_PAGE_DIRS = ['canzoni', 'messaggi'] as const`
  - `isSongFile(name: string): boolean` (file name only, e.g. `2026-11-10.md`)
  - `isIgnoredName(name: string): boolean` (README/CLAUDE/AGENTS `.md`, leading dot)
  - `PAGE_NAME: RegExp`
  - `checkClaims(what: string, scanned: string[], collected: string[]): void`: throws `Error` listing the names present in one set and not the other, message starting `fosforo: ${what}:`.
- Produces, in `folder-page.ts`:
  - `type Warning = { file: string; message: string }`
  - `type FolderPage = { dir: string; name: string; data: Page; body: string }`
  - `parseFolderPage(file: string, raw: string): { page?: FolderPage; warnings: Warning[] }` (`file` relative to the content dir, e.g. `canzoni/leggimi.md`)
- Produces, in `text.ts`: `obsidianSyntax(body: string): string | null` (the construct's name from the `OBSIDIAN` table, or null).

- [ ] **Step 1: Failing tests, `claims.test.ts`.** `isSongFile('2026-11-10.md')` true; `'leggimi.md'`, `'2026-11-10.txt'`, `'2026-1-1.md'` false. `isIgnoredName` true for `README.md`, `.bozza.md`, false for `leggimi.md`. `checkClaims('canzoni', ['a','b'], ['a','b'])` does not throw; `(['a','b'], ['a'])` throws `/canzoni.*b/`.
- [ ] **Step 2: Failing tests, `folder-page.test.ts`.**
  - valid: `parseFolderPage('canzoni/leggimi.md', '---\ntitle: Nota sulle canzoni\norder: 1\n---\n\nTesto.')` → `page` `{ dir: 'canzoni', name: 'leggimi', data: { title: 'Nota sulle canzoni', order: 1 }, body }` with `body.trim() === 'Testo.'`, `warnings: []`.
  - bad name: `'canzoni/Leggimi.md'`, `'messaggi/note_varie.md'` → no `page`, one warning whose `file` is the input and message matches `/kebab-case/`.
  - broken YAML (`'---\ntitle: [aperta\n---\nTesto.'`), schema failure (`'---\ntitolo: x\n---\nTesto.'`), no frontmatter (`'Solo testo.'`), Obsidian body (`'---\ntitle: X\n---\nvedi [[altro]]'`): each → `page.data` `{ title: 'leggimi' }` (the name), `page.body` without the frontmatter block (for no frontmatter: the whole text), exactly one warning.
  - Review Focus 4: CRLF (`'---\r\ntitle: X\r\n---\r\nTesto.'`) → title `X`, no warning; leading `﻿` before `---` → title `X`; `'---\ntitle: X\nTesto.'` (no closing line) → fallback, one warning, never throws; `'---\n---\nTesto.'` → fallback (schema: title missing), one warning.
- [ ] **Step 3: Run** `npx vitest run tests/unit/claims.test.ts tests/unit/folder-page.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 4: Implement `claims.ts`, `obsidianSyntax`, `parseFolderPage`.** Frontmatter: strip a leading BOM, match `^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)`; parse with `yaml`'s `parse` inside try/catch; `pageSchema.safeParse` (import from `./schema`). Warning messages in Italian with the reason (e.g. `frontmatter illeggibile, mostrato con il nome del file come titolo`). `content.config.ts`: `canzoni` uses `SONG_GLOB`, `messaggi` uses `POST_GLOB`.
- [ ] **Step 5: Run** `npm run check`. Expected: PASS (existing tests included).
- [ ] **Step 6: Commit** ("Pagine nelle cartelle: chi prende cosa e lettura delle pagine").

### Task 3: Store and tree

**Files:**
- Modify: `src/lib/store.ts` (`StoreInput`, `Store`, `buildStoreFrom` outside the posts block, new `findNode`), `src/lib/fs-tree.ts` (`FsNode.section`, `listing`, export `normalizePath`)
- Test: `tests/unit/fs-tree.test.ts` (extend `full()` and add a `describe('pagine nelle cartelle')`)

**Interfaces:**
- Consumes: `parseFolderPage`, `FolderPage`, `Warning`, `FOLDER_PAGE_DIRS`, `PAGE_NAME`, `isSongFile` (Task 2).
- Produces:
  - `StoreInput.folderFiles?: { file: string; raw: string }[]`
  - `Store.nodes: Map<string, FsNode>` (every tree node by `path`, root at `''`); `Store.warnings: Warning[]`
  - `FsNode.section?: 'head' | 'tail'` (absent = the main block)
  - `normalizePath(path: string): string` in `fs-tree.ts` (same `.`/`..` handling as today's `normalize`, joined with `/`; `findByPath` uses it)
  - `findNode(store: Store, path: string): FsNode | null` in `store.ts`: `store.nodes.get(normalizePath(path)) ?? null`
  - Folder pages become `Item` of kind `'page'` at `<dir>/<name>`.

- [ ] **Step 1: Failing tests.**
  - `full()` gains `folderFiles: [{ file: 'canzoni/leggimi.md', raw: '---\ntitle: Nota\n---\nCiao.' }, { file: 'messaggi/leggimi.md', raw: '---\ntitle: Nota sui messaggi\n---\nCiao.' }]`. Existing assertions adjust: canzoni children `['leggimi', '2026-11-10', '2026-11-09', '2026-11-08']`; messaggi `['leggimi', '2026-01-05-prova']`; root order unchanged.
  - `listing(findByPath(root,'canzoni'))`: line `leggimi` with cmd `cat /canzoni/leggimi` and dim `  Nota`, then `{ type: 'blank' }`, then the songs.
  - six pages in `canzoni/` named `a`..`f` (order: `f` has `order: 1`): children `f, a, b, c` with `section: 'head'`, songs with no `section`, `d, e` with `section: 'tail'`; listing has exactly two blank lines, around the archive.
  - `store.items.get('canzoni/leggimi')` is `{ kind: 'page', ... }`; `findNode(store, 'canzoni/../canzoni/leggimi')` is that node; `findNode(store, '')` is the root; `store.nodes.size === allNodes(root).length` (import `allNodes` from `static-paths`).
  - Review Focus 3: songs `[]`, `folderFiles` only `canzoni/leggimi.md` → root names start `['canzoni', 'lettura', ...]`, no `canzone-del-giorno`, `latestSong` undefined.
  - Review Focus 2: posts include `{ slug: 'bozza', draft: true }` and `folderFiles` has `messaggi/bozza.md` → `store.items.has('messaggi/bozza')` false, one warning on `messaggi/bozza.md` matching `/messaggio/`. Same with a published post slug `prova` and `messaggi/prova.md`: the post stays, the page is skipped.
  - Review Focus 1: `folderFiles: [{ file: 'canzoni/2026-11-1.md', raw: '' }]` → `buildStoreFrom` throws `/canzoni\/2026-11-1\.md/`.
  - Review Focus 5: a root page `owlcavelabs` (same as the link) → throws `/owlcavelabs/`.
  - A file in a dir outside `FOLDER_PAGE_DIRS` (`lettura/x.md`) → skipped with a warning (defensive; the scanner never sends it).
  - Warnings from `parseFolderPage` end up in `store.warnings`; a store with no folder files has `warnings: []`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/fs-tree.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `buildStoreFrom`: parse `folderFiles` first (a `canzoni/` file whose name starts with a digit throws: "sembra una canzone ma il nome non è AAAA-MM-GG"); group pages by dir; skip a page whose `<dir>/<name>` equals a typed item path or a draft post path, with a warning; sort by `order` then name (same comparator as root pages); first 4 get `section: 'head'`, the rest `'tail'`; dir children = head + archive + tail. A dir is created when it has archive entries or pages; the alias only when there are songs. After the tree is built, fill `nodes` walking the tree; a duplicate path throws (`fosforo: percorso doppio: <path>`). `listing`: push `{ type: 'blank' }` before a child whose `section` differs from the previous child's. Do not change the posts block beyond what the collision check needs to read.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** ("Pagine nelle cartelle nell'albero: prima dell'archivio, con avvisi").

### Task 4: Build wiring, lookups, warnings output

**Files:**
- Create: `src/lib/scan.ts`, `src/lib/warnings.ts`
- Modify: `src/lib/store.ts` (`buildStoreUncached`, `buildStore`), `src/lib/render.ts` (`renderPath` and `md` use `findNode`), `src/lib/static-paths.ts` (`pageMeta` uses `findNode`), `src/endpoints/fs-path.json.ts`, `src/pages/[...path].astro`, `src/pages/og/[...path].png.ts` (each `findByPath(store.root, …)` → `findNode(store, …)`)
- Test: `tests/unit/scan.test.ts`, `tests/unit/warnings.test.ts`

**Interfaces:**
- Consumes: `FOLDER_PAGE_DIRS`, `isSongFile`, `isIgnoredName`, `checkClaims` (Task 2); `StoreInput.folderFiles`, `Store.warnings`, `findNode` (Task 3).
- Produces:
  - `scanFolders(dir: string): Promise<{ folderFiles: { file: string; raw: string }[]; songNames: string[]; postFolders: string[] }>` in `scan.ts`: for each of `FOLDER_PAGE_DIRS`, the `.md` files directly inside (not ignored, not song files) go to `folderFiles`; `songNames` = song file stems in `canzoni/`; `postFolders` = subfolders of `messaggi/` containing `index.md`. Missing folders give empty lists.
  - `formatWarnings(warnings: Warning[], env: Record<string, string | undefined>): string[]` in `warnings.ts`: per warning `fosforo: avviso: <file>: <message>`, plus `::warning file=<file>::<message>` when `env.GITHUB_ACTIONS === 'true'`.

- [ ] **Step 1: Failing tests.** `scan.test.ts` builds a temp dir (`mkdtemp` in `os.tmpdir()`) with `canzoni/2026-11-10.md`, `canzoni/leggimi.md`, `canzoni/.nascosta.md`, `canzoni/README.md`, `canzoni/foto.jpg`, `messaggi/leggimi.md`, `messaggi/2026-01-05-prova/index.md`, `messaggi/vuota/` (no index): expect `folderFiles` files `['canzoni/leggimi.md', 'messaggi/leggimi.md']` with their text, `songNames ['2026-11-10']`, `postFolders ['2026-01-05-prova']`; a dir without `messaggi/` gives empty lists. `warnings.test.ts`: one warning, env `{}` → one line; env `{ GITHUB_ACTIONS: 'true' }` → two lines, the second exactly `::warning file=canzoni/x.md::nome non valido`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/scan.test.ts tests/unit/warnings.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules. In `buildStoreUncached`: call `scanFolders(contentDir())`, then `checkClaims('canzoni', songNames, songs ids stems)` and `checkClaims('messaggi', postFolders, posts slugs)` before `buildStoreFrom`, and pass `folderFiles`. In `buildStore`: after the store resolves, print `formatWarnings(store.warnings, process.env)` with `console.warn`, once per build in prod (inside the cached promise), on every rebuild in dev. Replace the build-side `findByPath(store.root, …)` calls listed above with `findNode`; the client keeps `findByPath`.
- [ ] **Step 4: Run** `npm run check`, then `npm run build`. Expected: PASS, build succeeds with no `fosforo: avviso` lines (example-content has no folder pages yet).
- [ ] **Step 5: Commit** ("Build: le pagine nelle cartelle lette dal disco, avvisi stampati una volta").

### Task 5: Example content, e2e, docs

**Files:**
- Create: `example-content/canzoni/leggimi.md`, `example-content/messaggi/leggimi.md`
- Modify: `tests/e2e/percorsi.txt` (add `/canzoni/leggimi`, `/messaggi/leggimi`), `tests/e2e/level0.spec.ts`, `README.md` (sections "Formati dei contenuti", "Percorsi", "Pagine" only), `CLAUDE.md` (the "A schema failure fails the build" bullet)

- [ ] **Step 1: Example pages.** `canzoni/leggimi.md`: `title: Nota sulle canzoni`, two short sentences in Italian saying the names are the dates the songs arrived. `messaggi/leggimi.md`: `title: Nota sui messaggi`, one sentence. Neutral engine-example text, not flocca.com copy.
- [ ] **Step 2: Failing e2e** in `level0.spec.ts`: `la cartella delle canzoni elenca prima le pagine`: `/canzoni` without JS, the first link in `#screen` after the prompt is `a[href="/canzoni/leggimi"]`, followed by a blank line and `/canzoni/2026-11-10`; `/canzoni/leggimi` contains `Nota sulle canzoni` and no date line (`── `). Add the two paths to `percorsi.txt` (keep it sorted).
- [ ] **Step 3: Run** `npm run build && npx playwright test`. Expected: all PASS (visual tests skip without `PW_VISUAL=1`). If an existing e2e asserts the first child of `/canzoni`, update it to the new order and say so in the commit.
- [ ] **Step 4: Docs.** README: in "Percorsi" `canzoni/<nome>.md` and `messaggi/<nome>.md` become `/canzoni/<nome>` and `/messaggi/<nome>`; in "Pagine" the folder pages (same frontmatter, kebab-case name starting with a letter, listed first, max 4 before the archive, `README`/`CLAUDE`/`AGENTS` and dot files ignored); near the opening paragraph of "Formati dei contenuti" the two zones (formats agreed with the services and root pages fail the build; folder pages give `fosforo: avviso` lines, also as GitHub annotations under Actions). `CLAUDE.md`: the bullet becomes "A schema failure in an agreed format (songs, books, messages, root pages, `site.yaml`) fails the build; pages inside folders give warnings instead."
- [ ] **Step 5: Run** `npm run check`. Expected: PASS.
- [ ] **Step 6: Commit** ("Pagine d'esempio nelle cartelle, README e regola delle due zone").

### Task 6: Real-site comparison

- [ ] **Step 1:** `CONTENT_DIR=/Users/flocca/src/flocca.com SITE_URL=https://flocca.com npm run build`. Expected: no `fosforo: avviso` lines.
- [ ] **Step 2:** `(cd dist && find . -type f | LC_ALL=C sort) | diff $SCRATCH/flocca-prima/files.txt -` and `diff -r $SCRATCH/flocca-prima/_fs dist/_fs`. Expected: no file-list difference; the only `_fs` difference allowed is none (flocca.com has no folder pages, so no `section` key appears). Any difference is a bug to investigate before the PR.
- [ ] **Step 3:** `npm run build` again (leave `dist/` on example-content). Keep both diff outputs for the PR description.
