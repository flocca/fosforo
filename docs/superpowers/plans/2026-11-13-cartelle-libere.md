# Free folders (fosforo#3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Folders declared in `site.yaml` (`cartelle`) publish their markdown at any depth; root pages join the free zone (invalid ones are skipped); `FOSFORO_STRICT=1` turns warnings into a build failure; the not-found back link points to the nearest existing folder.

**Architecture:** Extends fosforo#2. The `node:fs` scanner (`src/lib/scan.ts`) also reads root `.md` files and the declared folders recursively; the Astro `pagine` collection goes away. Pure code in `buildStoreFrom` turns the scanned files into page items and dir nodes, with per-zone outcomes and warnings. A strict switch in `buildStore` fails the build on warnings. A pure `nearestDir` serves the client; the 404 page embeds the folder paths and repeats the same few lines inline.

**Tech Stack:** Astro 7, TypeScript, `yaml`, zod (`astro/zod`), vitest, Playwright 1.64.1.

**Spec:** `docs/superpowers/specs/2026-11-13-cartelle-libere-design.md` (approved). Background: `docs/superpowers/specs/2026-11-13-pagine-nelle-cartelle-design.md` and `docs/superpowers/plans/2026-11-13-pagine-nelle-cartelle.md` (fosforo#2, merged), `/Users/flocca/src/flocca.com/docs/superpowers/specs/2026-11-13-terminale-filesystem-direzione.md` section 1.

**Planning session:** fosforo-fondamenta

## Global Constraints

- Identifiers English; comments, logs, warnings, error messages Italian (real accents, straight quotes, never U+2014). README Italian, CLAUDE.md English.
- Name rule for root pages, declared folders, and every file and subfolder inside them: `PAGE_NAME` from `src/lib/claims.ts` (`/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`, name without `.md`).
- Ignored silently at every level: `README.md`, `CLAUDE.md`, `AGENTS.md`, names starting with `.` (`isIgnoredName`).
- `siteSchema.cartelle` goes right after `links` (agreed with session fosforo-ricezione, whose `reception` key goes last). In `example-content/site.yaml` and in the README site.yaml section, `cartelle` also goes right after `links`; leave whatever follows `boot` alone.
- Root `ls` order: `canzone-del-giorno`, `canzoni`, `lettura`, `messaggi`, declared folders in list order, root pages (by `order` then name), links.
- Inside a free folder: subfolders by name, then pages by `order` then name. No `section` field on free-folder children.
- Client modules (`src/client/*`, `src/lib/fs-tree.ts`) never import `store.ts`, `render.ts`, `yaml`, `node:*`, `astro:content`.
- Env var: exactly `FOSFORO_STRICT`, active when its value is `1`.
- `npm run check` before every commit; e2e via `npm run build && npx playwright test` (never leave a server running). No push, PR or merge: the planning session does those with Giacomo. The working tree `/Users/flocca/src/fosforo` is shared with idle sessions; work on branch `free-folders`, which already holds the design commit.

## Review Focus

1. A root `.md` that is a private note (`appunti.md` with no frontmatter, `NOTE.md`): never published, one warning each. Tests in Task 2.
2. A declared folder whose last file was deleted (folder missing on disk, or only non-md / ignored files): not listed, one warning, the build does not fail without `FOSFORO_STRICT`. Tests in Tasks 2 and 3.
3. A symlink loop inside a declared folder (`documenti/giro -> ..`): the scan terminates and does not duplicate pages. Test in Task 3.
4. `x.md` next to `x/` in a free folder, and a root page named like a link, a declared folder or `canzone-del-giorno`: the other node wins, the page is skipped with a warning, the build does not fail. Tests in Task 2.
5. Not-found back link for a path under a file (`/canzoni/2026-11-10/x`) and under a missing subfolder of a free folder: `ls /canzoni` and `ls /<folder>`. Tests in Task 4.

---

### Task 1: `cartelle` in the site schema

**Files:**
- Modify: `src/lib/schema.ts` (`siteSchema`), `src/lib/claims.ts` (export `RESERVED_FOLDER_NAMES`)
- Test: `tests/unit/schema.test.ts`

**Interfaces:**
- Produces: `SiteConfig['cartelle']?: { name: string; title?: string }[]`; `RESERVED_FOLDER_NAMES = ['canzoni', 'lettura', 'messaggi', 'canzone-del-giorno', 'bin', 'og'] as const` in `claims.ts`.

- [ ] **Step 1: Failing tests** (`describe('cartelle in site.yaml')`, starting from the valid site object the file already uses): absent → valid, `cartelle` undefined; `[{ name: 'documenti', title: 'Documenti' }, { name: 'giochi' }]` → valid; each of these fails: name `Documenti`, `2026-foto`, `_fs`, each reserved name, a duplicate name, a name equal to a link `name`, an unknown key (`order: 1`), a title with `&egrave;`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `cartelle: z.array(z.object({ name: z.string().regex(PAGE_NAME, …), title: plainText.optional() }).strict()).optional()` right after `links`; a refinement on `siteSchema` for reserved names, duplicates within `cartelle`, and clashes with link names (Italian messages naming the offending value, `path: ['cartelle', i, 'name']`). `schema.ts` imports from `claims.ts`, never the reverse.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** ("site.yaml: chiave cartelle per le cartelle libere").

### Task 2: Store: root pages and free folders

**Files:**
- Modify: `src/lib/store.ts` (`StoreInput.folderFiles`, `readFolderPages`, `buildStoreFrom`), `src/lib/folder-page.ts` only if the root policy needs a flag
- Test: `tests/unit/fs-tree.test.ts` (new `describe('cartelle libere e pagine alla radice')`)

**Interfaces:**
- Consumes: `SiteConfig['cartelle']` (Task 1); `parseFolderPage`, `Warning`, `PAGE_NAME`, `FOLDER_PAGE_DIRS`, `RESERVED_FOLDER_NAMES`.
- Produces: `StoreInput.folderFiles?: { file: string; raw?: string }[]`. `file` is relative to the content dir: `leggimi.md` (root), `canzoni/leggimi.md`, `documenti/a/b.md`, `documenti/foto.jpg`. `raw` is present for `.md` files and absent for other files (Task 3 sends non-md files only from declared folders). `StoreInput.pages` stays as is (already-parsed root pages, used by existing tests) and follows the same root collision rule.

- [ ] **Step 1: Failing tests.** Site with `cartelle: [{ name: 'documenti', title: 'Carte' }, { name: 'giochi' }]` and links `owlcavelabs`.
  - Root order: `[canzone-del-giorno, canzoni, lettura, messaggi, documenti, giochi?, <pages>, owlcavelabs]` when both folders have pages; `documenti` node has `title: 'Carte'`, `giochi` none.
  - `documenti/z.md`, `documenti/a.md` (`order: 1`), `documenti/sotto/b.md`, `documenti/sotto/piu/c.md` → `documenti` children `['sotto', 'a', 'z']`; `findNode(store, 'documenti/sotto/piu/c')` is a page item; each child has no `section`.
  - Free-folder page with broken frontmatter → shown with the file name as title (as in #2), one warning.
  - `documenti/foto.jpg` (no `raw`) → no node, warning matching `/non ancora gestito/`.
  - `documenti/Brutto.md` and `documenti/2025/x.md` → skipped, one warning each (name rule applies to subfolders too).
  - `documenti/x.md` plus `documenti/x/y.md` → `documenti/x` is a dir, the page is skipped with a warning.
  - Declared `giochi` with no files, or only `giochi/foto.jpg` → not in the root, warning on `giochi/` matching `/vuota|assente/`; the build does not throw.
  - A file under an undeclared folder (`docs/piano.md`) → no node, warning (defensive: the scanner never sends it).
  - Root: `leggimi.md` valid → page `leggimi`; `appunti.md` with no frontmatter → no page, warning; `NOTE.md` → no page, warning; `owlcavelabs.md`, `documenti.md`, `canzone-del-giorno.md`, `lettura.md` (each valid) → skipped with a warning, no throw.
  - `StoreInput.pages` entry named `owlcavelabs` → skipped with a warning (replaces #2's throw for this case; update that existing test).
  - Pages in `canzoni/` and `messaggi/` keep #2 behaviour (existing tests stay green).
- [ ] **Step 2: Run** `npx vitest run tests/unit/fs-tree.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Group `folderFiles` by zone: root (`dir === ''`), typed (`dir` in `FOLDER_PAGE_DIRS`, top level only), free (first segment in `site.cartelle`), anything else → warning. Root `.md`: `parseFolderPage`; any warning makes it skipped (message says `saltata`, never the "mostrato" fallback). Free folders: build each declared folder recursively from its files; dirs exist only with a publishable page below; skip-with-warning for invalid names (file or any path segment), non-md files, file/dir clashes. Root pages are skipped when their name is in `RESERVED_FOLDER_NAMES`, a link name, or a `cartelle` name. Keep the posts block untouched; keep `nodeMap`'s throw for any duplicate that still gets through.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** ("Cartelle libere nell'albero; pagine alla radice nella zona libera").

### Task 3: Scanner, build wiring, strict mode

**Files:**
- Modify: `src/lib/scan.ts`, `src/lib/store.ts` (`buildStoreUncached`, `buildStore`), `src/lib/warnings.ts`, `src/content.config.ts` (remove `pagine` and `pageSchema` import if unused)
- Test: `tests/unit/scan.test.ts`, `tests/unit/warnings.test.ts`

**Interfaces:**
- Consumes: `StoreInput.folderFiles` shape (Task 2), `SiteConfig['cartelle']`.
- Produces:
  - `scanFolders(dir: string, freeFolders: string[] = []): Promise<Scan>`; `Scan.folderFiles: { file: string; raw?: string }[]` now also holds root `.md` files (not ignored) and every file under each declared folder at any depth (non-md without `raw`); `songNames` and `postFolders` unchanged. Symlinks followed; a directory whose real path was already visited is not entered again.
  - `strictError(warnings: Warning[], env: Record<string, string | undefined>): Error | null` in `warnings.ts`: non-null only when `env.FOSFORO_STRICT === '1'` and there are warnings; message `fosforo: <n> avvisi con FOSFORO_STRICT=1: la build si ferma` (singular `1 avviso`).

- [ ] **Step 1: Failing tests.** `scan.test.ts` (temp dir): root `leggimi.md`, `README.md`, `.bozza.md`, `site.yaml`, `firebase.json`; `documenti/a.md`, `documenti/sotto/b.md`, `documenti/foto.jpg`, `documenti/.privata/x.md`, `documenti/giro -> ..` (symlink to the content dir); undeclared `docs/piano.md`. With `['documenti', 'assente']`: `folderFiles` files exactly `['documenti/a.md', 'documenti/foto.jpg', 'documenti/sotto/b.md', 'leggimi.md']` (sorted), `raw` present except for `foto.jpg`; no entry under `docs/`, `.privata/`, or reached twice through `giro`. Existing scan tests stay green. `warnings.test.ts`: `strictError([], { FOSFORO_STRICT: '1' })` null; one warning with `{}` null; one warning with `{ FOSFORO_STRICT: '1' }` → message contains `1 avviso`; two → `2 avvisi`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/scan.test.ts tests/unit/warnings.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `buildStoreUncached` drops `getCollection('pagine')`, calls `scanFolders(contentDir(), (site.cartelle ?? []).map((c) => c.name))` after `site.yaml` is read, passes `pages: []` and `folderFiles`. `printWarnings` prints, then throws `strictError(...)` when non-null.
- [ ] **Step 4: Run** `npm run check`, then `npm run build` and `FOSFORO_STRICT=1 npm run build`. Expected: PASS; both builds succeed (example-content has no warnings).
- [ ] **Step 5: Commit** ("Lettore: radice e cartelle dichiarate a ogni profondità; FOSFORO_STRICT").

### Task 4: Not-found back link

**Files:**
- Modify: `src/lib/fs-tree.ts` (add `nearestDir`), `src/client/main.ts` (`backFor` → `nearestDir`), `src/pages/404.astro`
- Test: `tests/unit/fs-tree.test.ts`, `tests/e2e/level0.spec.ts` (describe `404 con JavaScript`)

**Interfaces:**
- Produces: `nearestDir(root: FsNode, path: string): string` in `fs-tree.ts`: walks the normalized path's ancestors from the longest (excluding the path itself) down to `''`, returns the first whose node is a `dir`.

- [ ] **Step 1: Failing unit tests**: on the #2 fixture store: `nearestDir(root, 'lettura/nope')` → `'lettura'`; `'canzoni/2026-11-10/x'` → `'canzoni'`; `'nope/deeper'` → `''`; `'canzoni'` (a missing-looking path equal to a dir) → `''`; with a free folder `documenti/sotto/b`: `'documenti/sotto/manca/x'` → `'documenti/sotto'`.
- [ ] **Step 2: Failing e2e** (after Task 5's example content exists, this step can be run there; write it now): with JS, `/documenti/manca` shows `#back` href `/documenti`, text `ls /documenti`; `/canzoni/2026-11-10/x` → `/canzoni`; existing `/lettura/...` and root cases unchanged.
- [ ] **Step 3: Implement.** `main.ts`: the not-found branch of `showPath` uses `nearestDir(root, path)`; remove `backFor`. `404.astro`: emit the dir paths (`[...store.nodes.values()].filter((n) => n.type === 'dir').map((n) => n.path)`) as JSON in `<script type="application/json" id="dirs">`; the inline script parses it and applies the same ancestor walk (a short comment says it mirrors `nearestDir`, which the inline script cannot import). Without JS the link stays `ls /`.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS (e2e runs in Task 5).
- [ ] **Step 5: Commit** ("Pagina non trovata: torna alla cartella esistente più vicina").

### Task 5: Example content, e2e, docs

**Files:**
- Create: `example-content/documenti/leggimi.md` (`title: Documenti d'esempio`), `example-content/documenti/progetti/fosforo.md` (`title: Fosforo`)
- Modify: `example-content/site.yaml` (`cartelle: [{ name: documenti, title: Documenti }]` right after `links`), `tests/e2e/percorsi.txt` (add `/documenti`, `/documenti/leggimi`, `/documenti/progetti`, `/documenti/progetti/fosforo`), `tests/e2e/level0.spec.ts`, `README.md`, `CLAUDE.md`

- [ ] **Step 1:** Add the example files; short neutral Italian text.
- [ ] **Step 2: Failing e2e** in `level0.spec.ts`: home without JS lists `a[href="/documenti"]` after `a[href="/messaggi"]` and before `a[href="/chi-sono"]` (compare positions in `#screen` text); `/documenti` lists `progetti/` before `leggimi`; `/documenti/progetti/fosforo` contains `Fosforo`.
- [ ] **Step 3: Run** `npm run build && npx playwright test`. Expected: all PASS, Task 4's e2e included, visual tests skipped.
- [ ] **Step 4: Docs.** README: "Percorsi" gains `<cartella>/<...>/<nome>.md` → `/<cartella>/<...>/<nome>` for declared folders; "Pagine": root pages are in the free zone (invalid → skipped, never shown), folder pages as in #2, free folders (any depth, order, names, non-md skipped with a warning until other file types exist); site.yaml section: a `cartelle` example right after `links` and a paragraph right after the `links`-related text (optional, list position is the order, `title` optional, reserved names); the two-zones paragraph near "Formati dei contenuti" mentions `FOSFORO_STRICT=1` (meant for PR builds). Leave the README Canzoni/Post sections and anything about `reception` alone. `CLAUDE.md`: in the formats section, root pages are no longer an agreed format (the agreed ones are songs, books, messages, `site.yaml`); free zone = pages anywhere and files in declared folders, warnings, `FOSFORO_STRICT=1` turns them into errors.
- [ ] **Step 5: Run** `npm run check`. Expected: PASS.
- [ ] **Step 6: Commit** ("Cartella d'esempio, test e README delle cartelle libere").

### Task 6: Real-site comparison

- [ ] **Step 1 (do it before Task 1):** on `free-folders` before any code change (it equals `main` plus docs), run `CONTENT_DIR=/Users/flocca/src/flocca.com SITE_URL=https://flocca.com npm run build`, save `(cd dist && find . -type f | LC_ALL=C sort)` and a copy of `dist/_fs` in the scratchpad.
- [ ] **Step 2:** After Task 5, the same build on `free-folders`; then also with `FOSFORO_STRICT=1`. Expected: no `fosforo: avviso` lines, the strict build succeeds, the file list identical except the client bundle hash, `diff -r` of `_fs` limited to what the new code must change (nothing expected: flocca.com declares no `cartelle`). Report anything else.
- [ ] **Step 3:** `npm run build` again so `dist/` is example-content. Report both diffs to the planning session.
