# fosforo

Public GPL-3.0 Astro engine: renders a content folder as a phosphor-CRT terminal website. A private site repo builds it with its own content via `CONTENT_DIR`. User-facing docs: `README.md` (content formats, env vars, URL rules). Read it before touching content handling.

## Language

- Identifiers in English. Code comments, logs and internal error messages in Italian.
- Commit messages in Italian, branch names in English.
- `README.md` and visible copy in Italian: real accented characters (`è`, `più`), straight quotes `"`, never the em dash U+2014. ROM boot lines may be English.
- This file and any agent-facing doc in English.

## Commands

- `npm run check`: `astro check` plus vitest. Run before every commit.
- `npm run build`, then `npx playwright test`: the config builds and serves by itself on port 4329, never reuses a server, and closes it at the end. Never leave a preview server running.
- Node comes from `.nvmrc`; Playwright is pinned to `1.64.1`.

## Visual baselines

`tests/e2e/look.spec.ts` runs only with `PW_VISUAL=1`; its baselines are committed in `tests/e2e/look.spec.ts-snapshots/` (approved by Giacomo; a missing one fails) and are valid only for the Playwright container `mcr.microsoft.com/playwright:v1.64.1-noble` (pixels depend on the system). Regenerate baselines only after Giacomo approves the look, inside that container.

## Content formats are a contract

Songs, books (`lettura/<slug>.json`, `lettura/obiettivo.json`), posts and `site.yaml` are agreed with external writers (the homelab sessions export books and songs). Changing a schema in `src/lib/schema.ts` needs Giacomo and the homelab sessions first, and an update of `README.md`.

- URL = content path, no trailing slash, no `.html`; `/_fs/` holds the JSON twins, `/_img/` the images, `/og/` the share images.
- Missing optional keys are absent, never `null`. `finishedAt` is present iff `status === 'finito'`.
- Plain-text fields reject HTML entities and invisible characters; markdown bodies reject Obsidian syntax. A schema failure in an agreed format (songs, books, messages, `site.yaml`) fails the build. The free zone gives `fosforo: avviso` warnings instead: pages anywhere (root, `canzoni/<name>.md`, `messaggi/<name>.md`, any depth inside the folders declared in `site.yaml` `cartelle`) and the other files in declared folders. An invalid root page is skipped, never shown with a fallback title. `FOSFORO_STRICT=1` (PR builds) turns warnings into a build failure.
- A missing path renders the terminal "not found" page with HTTP 404 and a clickable way back: `ls` of the nearest existing folder (`nearestDir` in `src/lib/fs-tree.ts`, mirrored by the inline script in `404.astro`), home otherwise.

## Constraints

- Client code is plain TS in Astro `<script>` modules. Dependencies stay as they are: no xterm.js, no Three.js, no `cool-retro-term-renderer`, no UI framework.
- Client modules import only browser-safe code: never `store.ts`, `render.ts`, `sharp` or `astro:content` (build-only; they would break or bloat the bundle).
- Every page works as complete HTML without JavaScript; the terminal enhances it.
- Browser storage keys, always inside try/catch, the site works without storage: `fosforo.fosfori` (`verde|ambra|bianco`, default `verde`), `fosforo.suono` (only ever `spento`; absent = sound on), `fosforo.ultimoBoot` (`YYYY-MM-DD`, visitor local date, last completed home boot), `fosforo.ultimaAccensione` (`YYYY-MM-DD`, visitor local date, last completed power-on).
- `prefers-reduced-motion: reduce`: no power-on glow or power-off collapse, no flicker, warm start instead of full boot.
- No analytics, cookies or third-party requests at runtime (fonts self-hosted). The only build-time network access is the YouTube thumbnail fetch (cache in `FOSFORO_CACHE`, default `.cache/`).
- Boot ROM lines are shown unwrapped and clipped on narrow screens: keep them to 34 columns or fewer (a 320 px phone shows about 34).
- Long unbreakable tokens (URLs, titles) at 320 px hard-wrap with no horizontal page scroll.
- No Claude process pushes or creates the GitHub repo without Giacomo's explicit go-ahead.
