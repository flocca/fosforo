# Volume Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Planning session:** flocca-com-6a

**Goal:** The sound key steps through three volume levels plus off (alto, medio, basso, spento), the icon shows the level, visitors start at medio on desktop and basso on touch devices, and the continuous ambient's highs are softened.

**Architecture:** A small pure module (`src/client/volume.ts`) owns the level names, the click cycle and the device default. `prefs.ts` stores the setting in the existing `fosforo.suono` key. `audio.ts` gets `setLevel()`: the level only changes the master gain target, "spento" stays the existing muted state. Each ambient session passes through a high-shelf filter. `main.ts` keeps the visitor's setting and drives audio, the key, the LED, the icon (`data-suono` on `<html>`) and the `suono` command through one path.

**Tech Stack:** TypeScript client modules in Astro, Web Audio, vitest (unit), Playwright 1.64.1 (e2e).

**Spec:** `docs/superpowers/specs/2026-11-17-livelli-volume-design.md` (approved by Giacomo on 2026-11-17, copy drafts included).

**Branch:** `volume-levels` (already exists with the spec commit; work in a worktree of it). No issue: the PR closes nothing. Do not push or open the PR without Giacomo's go-ahead (`CLAUDE.md`: "No Claude process pushes ... without Giacomo's explicit go-ahead").

## Global Constraints

- Commit messages, comments, logs, README and visible copy in Italian; identifiers and branch names in English; never the em dash U+2014; real accented characters; straight quotes.
- No new dependencies.
- `npm run check` before every commit; e2e with `npm run build` then `npx playwright test` (the config serves on 4329 by itself).
- Storage is always inside try/catch; the site works without storage.
- Level gains: alto `0.5`, medio `0.18`, basso `0.063`. Soften filter: `highshelf`, `3500` Hz, `-8` dB.
- Cycle on each press: alto → medio → basso → spento → alto.
- Device default: `basso` when `(pointer: coarse)` matches, else `medio`. A saved setting always wins.
- Storage: key `fosforo.suono`, values `alto|medio|basso|spento`; absent or unknown = device default, computed at each read; written only when the visitor chooses.
- Copy (approved): key name and title "Suono alto", "Suono medio", "Suono basso", "Suono spento"; command replies "Suono alto.", "Suono medio.", "Suono basso.", "Suono spento."; help line `regola il suono: alto, medio, basso, spento`.
- The sound board (`/_suoni`, `dev/`) must keep compiling and working; never trim it.
- Look baselines (`tests/e2e/look.spec.ts-snapshots/`) are regenerated only after Giacomo approves the look, inside `mcr.microsoft.com/playwright:v1.64.1-noble` (Docker rules: `~/.claude/docs/docker.md`, hold a slot with `~/.claude/bin/docker-slot acquire`).

## Review Focus

- A visitor whose storage holds the old value `spento` keeps the sound off (Task 1 test `getSoundSetting keeps the old spento`).
- Storage that throws or holds garbage: device default, no exception (Task 1 tests).
- On a phone the icon shows one arc from the first paint, with no flash of two arcs (Task 3 e2e `telefono: icona a una onda dal primo disegno`).
- A deep link already powered on: the first press starts audio at the saved or device level without stepping and without saving; with saved `spento` the press steps to alto and saves (Task 3 e2e).
- A level change while audio is running ramps the master without a click and does not resume a suspended (muted) context (Task 2 test `setLevel while muted does not touch the master`).

---

### Task 1: Level model and stored preference

**Files:**
- Create: `src/client/volume.ts`
- Modify: `src/client/prefs.ts:36-43` (replace `isSoundOff`/`setSoundOff`)
- Modify: `src/client/sound/preset.ts` (add `VOLUME`, `SOFTEN`)
- Test: `tests/unit/volume.test.ts` (new), `tests/unit/prefs.test.ts`

**Interfaces:**
- Produces, in `src/client/volume.ts`:
  - `export const SOUND_LEVELS = ['alto', 'medio', 'basso'] as const;`
  - `export type SoundLevel = (typeof SOUND_LEVELS)[number];`
  - `export type SoundSetting = SoundLevel | 'spento';`
  - `export const SOUND_SETTINGS: readonly SoundSetting[]` = `['alto', 'medio', 'basso', 'spento']` (order of the cycle and of the command's choices)
  - `export function nextSetting(s: SoundSetting): SoundSetting`
  - `export function deviceLevel(coarse: boolean): SoundLevel`
  - `export function isSoundSetting(v: unknown): v is SoundSetting`
- Produces, in `src/client/prefs.ts`: `getSoundSetting(): SoundSetting | null` (null = never chosen or unknown value), `setSoundSetting(s: SoundSetting): void`. `isSoundOff` and `setSoundOff` stay untouched in this task so every commit stays green; Task 2 removes the audio caller and Task 3 removes both functions with their last caller in `main.ts`.
- Produces, in `src/client/sound/preset.ts`: `export const VOLUME: Record<SoundLevel, number> = { alto: 0.5, medio: 0.18, basso: 0.063 };` and `export const SOFTEN = { hz: 3500, db: -8 };` with an Italian comment saying they were chosen by ear on `/_volume` on 2026-11-17. `preset.ts` imports the type from `../volume`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/volume.test.ts`:
  - `nextSetting cycles downwards`: `nextSetting('alto') === 'medio'`, `'medio' → 'basso'`, `'basso' → 'spento'`, `'spento' → 'alto'`.
  - `deviceLevel`: `deviceLevel(true) === 'basso'`, `deviceLevel(false) === 'medio'`.
  - `isSoundSetting`: true for the four names, false for `'acceso'`, `'boh'`, `null`.
  - `VOLUME and SOFTEN have the chosen values`: `VOLUME` equals `{ alto: 0.5, medio: 0.18, basso: 0.063 }`, `SOFTEN` equals `{ hz: 3500, db: -8 }`.

  And in `tests/unit/prefs.test.ts`, replacing the sound assertions:
  - storage that throws: `getSoundSetting()` is `null`, `setSoundSetting('basso')` does not throw.
  - `setSoundSetting writes every value`: for each of the four, `s.data.get('fosforo.suono')` equals it and `getSoundSetting()` returns it.
  - `getSoundSetting keeps the old spento`: `s.data.set('fosforo.suono', 'spento')` gives `'spento'`.
  - unknown values: `'boh'` and `'acceso'` give `null`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/volume.test.ts tests/unit/prefs.test.ts`. Expected: FAIL (module and functions missing).

- [ ] **Step 3: Implement** `volume.ts`, the two prefs functions (validate with `isSoundSetting`, same `read`/`write` helpers) and the preset constants. `volume.ts` imports nothing (pure, unit-testable without `matchMedia`).

- [ ] **Step 4: Run** `npm run check`. Expected: PASS.

- [ ] **Step 5: Commit** `Livelli del suono: modello, preferenza e valori`.

### Task 2: Audio levels and soft ambient highs

**Files:**
- Modify: `src/client/audio.ts:8` (drop the prefs import), `:45` (`LEVELS`), `:93` (`let muted`), `:171`, `:230-240` (`ambient`), `:516-536` (`setMuted`), `SiteAudio` type `:17-41`
- Test: `tests/unit/audio.test.ts`

**Interfaces:**
- Consumes: `SoundLevel`, `VOLUME`, `SOFTEN` from Task 1.
- Produces: `SiteAudio.setLevel(l: SoundLevel): void` and `SiteAudio.level: SoundLevel` (getter). `LEVELS` is removed; the master target is `muted ? 0 : VOLUME[level]` everywhere `LEVELS.master` was used. `createAudio` starts with `level = 'alto'` and `muted = false`. Until Task 3, `main.ts` calls `audio.setMuted(prefs.isSoundOff())` right after `createAudio()`, so today's behaviour is unchanged in this commit.

- [ ] **Step 1: Write the failing tests** in `tests/unit/audio.test.ts` (reuse `setup()`, `master()`; the fake biquad records `type`, `frequency`, `gain`):
  - `setLevel changes the master target`: `powerOn()`, then `setLevel('medio')` → `master()` is `0.18`; `setLevel('basso')` → `0.063`; `setLevel('alto')` → `0.5`.
  - `setLevel before the context is used at open`: `setLevel('basso')` before `powerOn()`, then `powerOn()` → `master()` is `0.063`.
  - `setLevel while muted does not touch the master`: `powerOn()`, `setMuted(true)`, `setLevel('medio')` → `master()` is `0`, and the context's `calls` gain no `resume`; then `setMuted(false)` → `0.18`.
  - `the ambient goes through the soft highs`: after `powerOn()`, exactly two filter nodes with `type === 'highshelf'`, `frequency.value === 3500`, `gain.value === -8`; one of them outputs to the case input chain and the other to the shared direct gain (assert via `outputs`); a new session after `powerOff()` + `powerOn()` creates two more (one pair per session).
  - Update the existing `setMuted(true)... lo rimette` test: unchanged expectations still hold (level defaults to alto = 0.5).

- [ ] **Step 2: Run** `npx vitest run tests/unit/audio.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** In `ambient()`, connect the session's `mech` gain → highshelf → `caseIn` and `dir` gain → highshelf → `direct`, values from `SOFTEN`. `endSession` keeps working on the session gains, unchanged. `setLevel` stores the level and, only when `ctx` exists and not muted, ramps the master from its current value to `VOLUME[level]` over `MUTE_RAMP_S` (same pattern as `setMuted`). Update the header comment of `audio.ts` (levels and soft highs, in Italian). Audio no longer imports prefs; add the one `audio.setMuted(prefs.isSoundOff())` line in `main.ts` after `createAudio()`.

- [ ] **Step 4: Run** `npm run check`. Expected: PASS.

- [ ] **Step 5: Commit** `Suono: livelli del volume generale e acuti del fondo smussati`.

### Task 3: Command, key, icon, LED, first paint and the visitor's setting

The command and the key share one path in `main.ts` (`Terminal.sound`), so they land together in one task and one commit.

#### Part A: the `suono` command

**Files:**
- Modify: `src/client/shell.ts:17` (`Terminal.sound`), `:31` (help line), `:123-130` (command)
- Test: `tests/unit/shell.test.ts:188-201` and its `fakeTerminal`

**Interfaces:**
- Consumes: `SoundSetting`, `SoundLevel`, `SOUND_SETTINGS` from Task 1.
- Produces: `Terminal.sound: { step(): SoundSetting; set(s: SoundSetting): void; readonly deviceLevel: SoundLevel }`. `step()` does exactly what a press of the key does and returns the setting now shown; `set()` chooses a setting explicitly.

- [ ] **Step 1: Write the failing tests** (the fake records calls in `t.sounds` and starts at `medio`, `deviceLevel` `medio`):
  - `suono senza argomento fa come il tasto`: two runs of `suono` call `step()` twice; printed `['Suono basso.', 'Suono spento.']` when the fake's `step` walks `medio → basso → spento`.
  - `suono con un livello`: `suono alto` → `set('alto')`, prints `Suono alto.`; same for `medio`, `basso`, `spento`.
  - `suono acceso porta al livello del dispositivo`: with `deviceLevel = 'basso'`, `suono acceso` → `set('basso')`, prints `Suono basso.`.
  - `suono con un argomento sbagliato`: `suono boh` prints `suono: boh: scegli tra alto, medio, basso, spento.`-style line whose spans carry `cmd` `['suono alto', 'suono medio', 'suono basso', 'suono spento']`; returns false (chain `suono boh && ls` does not run `ls`).
  - help line for `suono` is `regola il suono: alto, medio, basso, spento`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/shell.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the command. Error line format: like the `fosfori` error, `t('suono: <arg>: scegli tra '), ...choices('suono', SOUND_SETTINGS), t('.')`. Reply `Suono <setting>.`. `npx vitest run tests/unit/shell.test.ts` passes; `npm run check` fails in `main.ts` until Part B.

#### Part B: key, icon, LED, first paint

**Files:**
- Modify: `src/client/main.ts:26-125` (sound state, `showSound`, `applySound`, `initSoundButton`), `:150-160` (start), `:300-315` (`term.sound`), `:500-510` (`stopWaitingForSound` stays)
- Modify: `src/layouts/Monitor.astro:54-88` (head script), `:107-114` (icon)
- Modify: `src/styles/crt.css:10-25` (header comment), `:819-855` (icon rules)
- Test: `tests/e2e/crt.spec.ts`, `tests/e2e/phone.spec.ts`, `tests/e2e/boot.spec.ts:210-265, 324-338`, `tests/e2e/link-audio.spec.ts`, `tests/e2e/look.spec.ts:30-56`

**Interfaces:**
- Consumes: Tasks 1-2 and Part A (`nextSetting`, `deviceLevel`, `getSoundSetting`, `setSoundSetting`, `audio.setLevel`, `audio.setMuted`, `Terminal.sound`), `isCoarsePointer()` from `src/client/touch.ts:2`.
- Produces: `<html data-suono="alto|medio|basso|spento">`, set by the head script before first paint and kept by the client: the level shown (spento while audio waits for the key on a deep link already on, or when saved spento). The button keeps `aria-pressed` (`false` only when shown spento) and gets `aria-label`/`title` "Suono <shown>". The LED `.sound-led.is-on` is on at every level, off when shown spento. `html.sound-pending` stays as today for the LED before the client.

Behaviour to implement in `main.ts` (one path for key, chip and command):
- `setting = prefs.getSoundSetting() ?? deviceLevel(isCoarsePointer())`, read at startup; right after `createAudio()` the client calls (replacing Task 2's `setMuted(prefs.isSoundOff())` line, and removing `isSoundOff`/`setSoundOff` from `prefs.ts` with their tests) `audio.setLevel(level)` (the setting, or the device level when spento) and `audio.setMuted(setting === 'spento')`.
- shown = `soundWaits ? 'spento' : setting`.
- press (key and `step()`): if `soundWaits` and `setting !== 'spento'`, start audio at `setting` (as `applySound` does today: clear `soundWaits`, `audio.spinUp()`) and save nothing; otherwise choose `nextSetting(shown)`.
- choose(s) (also `set()`): `setting = s`; if `s` is a level, `audio.setLevel(s)` then `audio.setMuted(false)` (starting audio if it waited, as today); if `s === 'spento'`, `audio.setMuted(true)`; `prefs.setSoundSetting(s)`; `showSound()`.
- The key's click sounds keep today's order (muting: press before; unmuting: release after). A change between two levels plays press and release at the old level before the ramp, like muting.
- `term.sound.deviceLevel` = `deviceLevel(isCoarsePointer())`.

Head script (ES5, like the rest): `level` = stored value if it is one of the four, else `matchMedia('(pointer: coarse)').matches ? 'basso' : 'medio'` (guard `window.matchMedia`); `d.dataset.suono = quiet ? 'spento' : level`, where `quiet` keeps today's meaning (deep link already on, or stored `spento`).

Icon: three arc paths with classes `wave-1`, `wave-2`, `wave-3` (inner to outer) plus `cross`. Arcs 1 and 2 keep today's geometry (`M12 4.5a3.5 3.5 0 0 1 0 5`, `M14.5 2.5a6.5 6.5 0 0 1 0 9`) so the desktop default (medio, two arcs) looks as today. Arc 3 is concentric and must not be clipped with the 1.6 stroke and round caps; widen the `viewBox` and the `svg` width in `crt.css:820-832` if needed, keeping it centred. CSS: `:root[data-suono='basso']` hides `wave-2` and `wave-3`; `medio` hides `wave-3`; `spento` hides all waves and shows the cross; no attribute (no JavaScript) shows two arcs. Remove the `aria-pressed`/`sound-pending` icon rules (`crt.css:844-852`); the LED rule for `sound-pending` (`crt.css:741`) stays.

- [ ] **Step 1: Update the e2e tests first** (they fail against the current build):
  - `crt.spec.ts:24-25`: desktop shows `Suono medio`. `crt.spec.ts:51-79` (320 px deep link, desktop Chromium with a narrow viewport, fine pointer): the key shows `Suono spento` while waiting; after a click it shows `Suono medio`.
  - `phone.spec.ts:39-40`: the chip `suono` on a phone at `basso` gives `Suono spento`.
  - New in `phone.spec.ts`: `telefono: icona a una onda dal primo disegno`: `page.addInitScript` installs a `MutationObserver` on `document.documentElement` (attribute `data-suono`) that pushes every value into `window.suoni`; on the home, after load, `window.suoni` contains only `'basso'` (never `'medio'` or `'alto'`), and `getComputedStyle` of `.wave-2` is `display: none`.
  - `boot.spec.ts:213-265`: after power-on the key is `Suono medio`; `suono` steps to `Suono basso.`, stored `basso`; then `suono spento` stores `spento`, LED off; `suono acceso` gives `Suono medio.` and stores `medio` (replace the `toBeNull()` at `:246`). Adapt `:324-338` the same way.
  - `link-audio.spec.ts`: `expectShownOn` accepts the level name; `preferenza accesa` (`:43-56`): first click starts audio, shows `Suono medio`, stored stays `null`; next clicks give `basso` (stored `basso`), `spento` (stored `spento`), `alto` (stored `alto`), one AudioContext throughout. Saved `spento` (`:59-70`): the click shows `Suono alto` and stores `alto`. The command test (`:81-95`): `suono spento` stores `spento`, then `suono` gives `Suono alto.` and stores `alto`. `iconShown` reads `data-suono` (`spento` / a level). First-paint tests (`:148-175`) also assert `data-suono` (`spento` on the deep link already on and with stored `spento`; `medio` on home desktop).
  - New: `un valore vecchio o sconosciuto vale il livello del dispositivo`: stored `boh` on home desktop shows `Suono medio`.
  - `look.spec.ts:45`: keep `aria-pressed` `true` after `startSound`.
- [ ] **Step 2: Run** `npm run build && npx playwright test`. Expected: the updated tests FAIL.
- [ ] **Step 3: Implement** `main.ts`, the head script, the icon and the CSS as described.
- [ ] **Step 4: Run** `npm run check`, then `npm run build && npx playwright test`. Expected: PASS (look tests are skipped without `PW_VISUAL=1`).
- [ ] **Step 5: Show Giacomo the icon.** Take four screenshots of the panel key at 2x (desktop, `data-suono` alto, medio, basso, spento), save them in the scratchpad as `icona_suono_alto.png` etc., open them with `open -a Preview` in the order alto, medio, basso, spento, and ask him to approve the icon (one line per image). Stop until he approves; apply his corrections.
- [ ] **Step 6: Commit** `Tasto e comando del suono: tre livelli più spento, icona e predefinito per dispositivo`.
- [ ] **Step 7: Baselines, only after his approval.** Run `PW_VISUAL=1` look tests inside the container: the phone baselines (`home-telefono-*`, `post-telefono-320`) change to one arc (basso); the desktop ones should be unchanged if arc geometry is kept. Show Giacomo every changed baseline (old and new, opened together in Preview) before committing them; commit `Baseline: icona del suono a livelli`.

### Task 4: Board preview, docs, floppy check, cleanup

**Files:**
- Modify: `dev/board.ts:131-144`, `dev/suoni.astro:25` (label)
- Modify: `README.md:205-211` (sound paragraph and stored preferences), `CLAUDE.md:36` (storage contract)
- Test: `tests/e2e/suoni.spec.ts` (still passes), `tests/unit/sound.test.ts`

- [ ] **Step 1: Board phone preview.** Drop the 6 kHz low-pass from the phone preview: the chain becomes `master → phoneIn → hp (highpass 300 Hz, Q 0.7) → destination`. Label: `anteprima altoparlante telefono (passa alto 300 Hz)`. Comment in Italian: a phone speaker reproduces the fan whine at 8 kHz and the line whistle, so the preview must not cut them.
- [ ] **Step 2: Docs.** README: the key and `suono` step through alto, medio, basso, spento; start level medio on computer and basso on touch screens; the ambient's highs are softened; the stored preference is the chosen setting. CLAUDE.md line 36: `fosforo.suono` (`alto|medio|basso|spento`; absent or unknown = device default: `basso` with a coarse pointer, else `medio`).
- [ ] **Step 3: Floppy peak check.** Run `ffmpeg -i src/client/sound/registrazioni/floppy.webm -af volumedetect -f null - 2>&1 | grep max_volume` (and the `.m4a`). At alto the floppy plays at ×3 (`FLOPPY.gain` 6 × 0.5): a `max_volume` above -9.5 dB clips at alto; at medio (×1.08) above -0.7 dB. Do not change `FLOPPY.gain`: report the figures to Giacomo in the final report and in the PR text.
- [ ] **Step 4: Run** `npm run check`, `npm run build && npx playwright test`. Expected: PASS.
- [ ] **Step 5: Commit** `Banco dei suoni: anteprima del telefono con gli acuti; documentazione dei livelli`.
- [ ] **Step 6: Cleanup.** Stop the spike dev server if it still runs (`npx astro dev stop` in `/Users/flocca/src/fosforo`), then delete the local branch `volume-spike` (`git branch -D volume-spike`; it was never pushed). Tell the planning session (flocca-com-6a) when done.
