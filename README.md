# fosforo

Motore per siti web in stile terminale a fosfori CRT, basato su Astro. Legge una cartella di contenuti (canzoni, libri, post, pagine) e la rende come un terminale: ogni file è un percorso, ogni percorso è un URL. Ogni pagina è HTML statico completo e leggibile anche senza JavaScript, il terminale interattivo (comandi, boot, suono) è un miglioramento in più. Nessun analytics, nessun cookie, nessuna richiesta a terzi a runtime: i font sono self-hosted.

Il motore è pubblico; un sito lo costruisce con i propri contenuti indicando la cartella in `CONTENT_DIR`. Senza `CONTENT_DIR` usa `example-content/`, una cartella di esempio nel repo.

## Come si usa

Serve Node nella versione di `.nvmrc`.

```
npm ci
npm run dev        # server di sviluppo
npm run build      # sito statico in dist/
npm run preview    # anteprima della build
npm run check      # astro check + test unitari
npm test           # solo test unitari
npm run test:e2e   # test nel browser (Playwright)
```

Variabili d'ambiente:

- `CONTENT_DIR`: cartella dei contenuti, assoluta o relativa alla cartella da cui si lancia il comando. Default: `example-content/`.
- `SITE_URL`: indirizzo pubblico del sito, usato per gli URL assoluti nei tag Open Graph. Default: `https://example.com`.
- `FOSFORO_CACHE`: cartella della cache delle miniature YouTube. Default: `.cache/`. È l'unico accesso di rete della build.

## Formati dei contenuti

I formati sono un contratto con chi scrive i contenuti (anche programmi esterni, come l'esportatore dei libri): si validano con uno schema e un errore ferma la build. I campi opzionali assenti vanno omessi, mai messi a `null`. I campi di testo rifiutano le entità HTML (`&egrave;`) e i caratteri invisibili (zero-width space). I corpi markdown rifiutano la sintassi Obsidian (`[[`, `![[`, `> [!`): si usa markdown standard.

### Percorsi

La cartella dei contenuti coincide con il terminale e con gli URL, senza slash finale e senza `.html`:

- `canzoni/2026-11-10.md` diventa `/canzoni/2026-11-10`
- `lettura/<slug>.json` diventa `/lettura/<slug>`
- `post/<data>-<slug>/index.md` diventa `/post/<data>-<slug>`
- `<nome>.md` nella radice diventa `/<nome>`

Ogni pagina ha un gemello JSON in `/_fs/` (`/_fs/index.json` per l'albero, `/_fs/<percorso>.json` per i nodi, `/_fs/root.json` per la radice) che il terminale legge per navigare. Le immagini dei post e i fotogrammi delle canzoni sono in `/_img/`, le immagini per le anteprime social in `/og/`. Un percorso inesistente mostra la pagina "non trovato" del terminale, con HTTP 404 e un link per tornare indietro (`lettura/` per `/lettura/*`, la home altrove).

Nel markdown un link interno diventa un comando del terminale: `[canzoni](/canzoni)` esegue `cd /canzoni && ls` (una cartella), `[chi sono](/chi-sono)` esegue `cat /chi-sono`. I file in `/_fs/` vanno serviti con `Cache-Control: no-cache`: se un link profondo non è nell'indice, il terminale lo riscarica una volta, ma un indice vecchio in cache resta vecchio per tutte le altre pagine.

### Canzoni

`canzoni/AAAA-MM-GG.md`: una canzone al giorno. Frontmatter, in quest'ordine:

```
---
date: 2026-11-10
title: Un giorno qualunque
artist: Drew Example
album: Opzionale
appleTrackId: "1700000003"
links:
  appleMusic: https://music.apple.com/it/song/un-giorno-qualunque/1700000003
  spotify: https://open.spotify.com/...   # opzionale
  youtube: https://www.youtube.com/watch?v=wCzoTQqEoFg   # opzionale
---

Una nota breve sulla canzone di oggi (opzionale).
```

`appleTrackId` è una stringa numerica. Se c'è il link `youtube`, la build scarica la miniatura e la mostra attraverso il fosforo.

### Libri

`lettura/<slug>.json`, uno per libro (`slug` in kebab-case minuscolo):

```
{
  "id": "0123456789abcdef0123456789abcdef",
  "slug": "termination-shock",
  "title": "Termination Shock",
  "authors": ["Neal Stephenson"],
  "pages": 720,
  "progress": 1,
  "status": "finito",
  "startedAt": "2026-10-20T21:00:00+02:00",
  "finishedAt": "2026-11-02T22:10:00+01:00",
  "lastReadAt": "2026-11-02T22:10:00+01:00",
  "totalSeconds": 5400,
  "days": [{ "date": "2026-10-20", "seconds": 1800 }]
}
```

`id` è di 32 caratteri esadecimali, `progress` va da 0 a 1, `status` è `in-corso` o `finito`, gli istanti sono ISO 8601 con offset. `finishedAt` c'è se e solo se `status` è `finito`.

`lettura/obiettivo.json` è l'obiettivo dell'anno: `{ "year": 2026, "target": 2, "finished": 1 }`.

`lettura/<slug>.md` è una nota facoltativa sul libro, solo markdown senza frontmatter.

### Post

`post/<data>-<slug>/index.md`, con le immagini accanto al file e referenziate con percorso relativo (`![una foto](foto.jpg)`):

```
---
title: Un post di prova
date: 2026-01-05
description: Facoltativa.
draft: false   # facoltativo, le bozze (true) non si pubblicano
---
```

Le immagini diventano a scala di grigi a 640 px e passano attraverso il fosforo.

### Pagine

`<nome>.md` nella radice, con frontmatter `title` e `order` (facoltativo, ordina l'elenco). `README.md`, `CLAUDE.md` e `AGENTS.md` sono ignorati.

### site.yaml

```
host: example.com
user: guest
links:
  - name: owlcavelabs      # kebab-case, è il nome da scrivere nel terminale
    title: Owl Cave Labs
    url: https://owlcavelabs.it
boot:
  rom:
    - text: "MEMORY TEST ....... 65536 BYTES OK"
      pause: 700           # millisecondi dopo la riga
      disk: 1              # facoltativo, numero di scatti della testina
  welcome: "Benvenuto. Scrivi help oppure clicca un nome."
  welcomeTouch: "Benvenuto. Tocca un nome oppure scrivi help."
```

Le righe `rom` imitano l'output di una ROM e possono essere in inglese. Nel testo si possono usare i segnaposto `{canzone}` (titolo della canzone più recente) e `{data}` (data della canzone più recente). Le righe non vanno a capo e su schermi stretti vengono tagliate: tenerle entro 34 colonne. `welcome` compare a fine boot, `welcomeTouch` al posto suo sui dispositivi touch.

## Test

`npm run check` esegue il controllo dei tipi e i test unitari. `npx playwright test` costruisce il sito, lo serve su una porta sua e lo chiude alla fine (non riusa mai un server già acceso).

I confronti visivi di `tests/e2e/look.spec.ts` girano solo con `PW_VISUAL=1`. Le baseline sono in `tests/e2e/look.spec.ts-snapshots/` (approvate da Giacomo) e dipendono dal sistema: si rigenerano solo dentro il container `mcr.microsoft.com/playwright:v1.64.1-noble`, la stessa immagine della CI, e solo dopo una nuova approvazione dell'aspetto. Se mancano, i test falliscono.

## Licenza e crediti

GPL-3.0, testo completo in `LICENSE`. Il look a fosfori CRT prende come riferimento visivo [cool-retro-term](https://github.com/Swordfish90/cool-retro-term) di Swordfish90 (GPL-3.0); l'idea del sito come terminale è ispirata da remojansen.com. Il font è Fira Mono, distribuito con `@fontsource` (SIL Open Font License).
