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
- `FOSFORO_STRICT`: con `1` un avviso della zona libera ferma la build (vedi [Formati dei contenuti](#formati-dei-contenuti)). Pensata per le build delle pull request.
- `FOSFORO_CACHE`: cartella della cache delle miniature YouTube. Default: `.cache/`. È l'unico accesso di rete della build. Se il download di una miniatura fallisce (rete, timeout, errore 5xx, dopo 3 tentativi) la build si ferma di proposito: l'anteprima di una canzone viene messa in cache dai social alla prima visita e non deve mai essere un ripiego, quindi la canzone resta un 404 e la build successiva riprova.

## Formati dei contenuti

I formati sono un contratto con chi scrive i contenuti (anche programmi esterni, come l'esportatore dei libri): si validano con uno schema e un errore ferma la build. I campi opzionali assenti vanno omessi, mai messi a `null`. I campi di testo rifiutano le entità HTML (`&egrave;`) e i caratteri invisibili (zero-width space). I corpi markdown rifiutano la sintassi Obsidian (`[[`, `![[`, `> [!`): si usa markdown standard.

Ci sono due zone. I formati concordati (canzoni, libri, messaggi, `site.yaml`) sono severi: un errore ferma la build. Le pagine (nella radice, nelle cartelle tipizzate e nelle cartelle dichiarate in `site.yaml`, vedi [Pagine](#pagine)) e i file delle cartelle dichiarate sono la zona libera: un errore non ferma la build, lascia una riga `fosforo: avviso: <file>: <motivo>` nel log, e sotto GitHub Actions anche un'annotazione `::warning` che compare sulla PR. Con `FOSFORO_STRICT=1` (pensato per le build delle pull request) a fine build gli avvisi fermano la build, così chi scrive a mano vede i suoi errori prima del merge mentre i servizi che spingono su `main` non si fermano mai.

### Percorsi

La cartella dei contenuti coincide con il terminale e con gli URL, senza slash finale e senza `.html`:

- `canzoni/2026-11-10.md` diventa `/canzoni/2026-11-10`
- `lettura/<slug>.json` diventa `/lettura/<slug>`
- `messaggi/<data>-<slug>/index.md` diventa `/messaggi/<data>-<slug>`
- `<nome>.md` nella radice diventa `/<nome>`
- `canzoni/<nome>.md` e `messaggi/<nome>.md` (pagine nelle cartelle) diventano `/canzoni/<nome>` e `/messaggi/<nome>`
- `<cartella>/<...>/<nome>.md` in una cartella dichiarata in `site.yaml` (`cartelle`) diventa `/<cartella>/<...>/<nome>`, a ogni profondità

Ogni pagina ha un gemello JSON in `/_fs/` (`/_fs/index.json` per l'albero, `/_fs/<percorso>.json` per i nodi, `/_fs/root.json` per la radice) che il terminale legge per navigare. Le immagini dei post e i fotogrammi delle canzoni sono in `/_img/`, le immagini per le anteprime social in `/og/`. Un percorso inesistente mostra la pagina "non trovato" del terminale, con HTTP 404 e un link per tornare indietro: `ls` della cartella esistente più vicina (`/documenti/vecchio` porta a `ls /documenti`, `/canzoni/2026-11-10/x` a `ls /canzoni`), la home se non ce n'è.

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
intro: "L'ha mandata l'operatore. Chiede di inoltrarla alle altre reti: eseguo."   # opzionale
---

Una nota breve sulla canzone di oggi (opzionale).
```

`appleTrackId` è una stringa numerica. Se c'è il link `youtube`, la build scarica la miniatura e la mostra attraverso il fosforo.

`intro` è una frase del terminale prima della canzone, scritta da chi esporta: compare attenuata, come il timbro, tra il timbro e il titolo, seguita da una riga vuota. È testo semplice (niente entità HTML né caratteri invisibili, come gli altri campi) con quattro regole in più:

1. da 1 a 200 caratteri, contati come code point: una lettera accentata o un carattere fuori dal piano base (come 🎵) valgono uno, ma le emoji composte (bandiere, toni della pelle, U+FE0F) contano più code point, e quelle unite da ZWJ (U+200D, un carattere invisibile) sono rifiutate;
2. una sola riga: nessun carattere di controllo (U+0000-U+001F, U+007F-U+009F, quindi niente a capo, tab, ritorno carrello, NEL) e nessun separatore di riga o di paragrafo (U+2028, U+2029);
3. il primo e l'ultimo carattere non sono spazi (U+0020, U+00A0, U+1680, U+2000-U+200A, U+202F, U+205F, U+3000): uno spazio ai bordi viene rifiutato, non tolto;
4. niente link: il testo non contiene `://`, `www.` (con le tre `w` maiuscole o minuscole in qualsiasi combinazione) né `](`.

Il valore non viene mai trasformato: un'intro che non rispetta le regole fa fallire la build. `intro: null` non è ammesso, se non c'è intro la chiave manca.

I casi di prova condivisi sono in `tests/contract/text-cases.json`: un file tutto ASCII in cui ogni carattere non ASCII o di controllo è scritto `\uXXXX`, ogni caso ha `input`, un `repeat` facoltativo (l'input ripetuto n volte) e in `expect` il risultato atteso per ciascun validatore (`plainText`, `intro`; una chiave assente vuol dire "non verificato"). Chi esporta in un altro linguaggio dovrebbe eseguirli con il proprio validatore.

Ordine di rilascio: prima il motore, poi `.fosforo-ref` del sito, solo dopo chi esporta scrive il campo. Da quel momento il sito non può tornare a un motore precedente: la sua build fallirebbe sulla chiave sconosciuta.

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

`lettura/obiettivo.json` è l'obiettivo dell'anno: `{ "year": 2026, "target": 2, "finished": 1 }`. Se il conteggio non parte dal 1° gennaio (l'anno in cui il servizio si attiva), `since` dice il giorno da cui parte, `YYYY-MM-DD` nello stesso anno: `{ "year": 2026, "since": "2026-11-12", "target": 2, "finished": 0 }`. Il sito scrive allora "Libri finiti dal 12/11/2026" (o "dall'11/11/2026") invece di "Libri finiti nel 2026".

`lettura/<slug>.md` è una nota facoltativa sul libro, solo markdown senza frontmatter.

### Post

`messaggi/<data>-<slug>/index.md`, con le immagini accanto al file e referenziate con percorso relativo (`![una foto](foto.jpg)`):

```
---
title: Un post di prova
date: 2026-01-05
receivedAt: "2026-01-05T09:05:00+01:00"   # facoltativo
description: Facoltativa.
draft: false   # facoltativo, le bozze (true) non si pubblicano
---
```

Le immagini diventano a scala di grigi a 640 px e passano attraverso il fosforo.

`receivedAt` è facoltativo: è l'istante di ricezione, ISO 8601 con offset, e va scritto tra virgolette (senza, YAML lo legge come data e perde ora e offset, e la build si ferma). Deve cadere nello stesso giorno di `date` (stessi primi 10 caratteri).

Un messaggio si apre con il timbro di ricezione e i campi di `reception.message` in `site.yaml` (vedi sotto), attenuati, poi il titolo in grassetto e il testo. Senza campi restano il timbro, il titolo e il testo.

### Pagine

`<nome>.md` nella radice, con frontmatter `title` e `order` (facoltativo, ordina l'elenco). `README.md`, `CLAUDE.md`, `AGENTS.md` e i nomi che cominciano con un punto sono ignorati. Le pagine nella radice sono nella zona libera, ma una pagina sbagliata (nome non in kebab-case, frontmatter assente, illeggibile o non valido, sintassi Obsidian) si salta con un avviso e non si mostra mai: un appunto privato dimenticato nella radice non va online. Una pagina con lo stesso nome di un link, di una cartella dichiarata o di un elemento del motore (`canzone-del-giorno`, `canzoni`, `lettura`, `messaggi`, `bin`, `og`) si salta con un avviso.

Le pagine possono stare anche dentro `canzoni/` e `messaggi/`, con lo stesso frontmatter e la stessa resa. In `canzoni/` è una canzone solo il file con il nome a data (`AAAA-MM-GG.md`), ogni altro `.md` è una pagina; in `messaggi/` i messaggi sono sottocartelle, ogni `.md` sciolto è una pagina.

- Il nome è in kebab-case e comincia con una lettera (`leggimi`, `nota-2`), così non si confonde con le date e le cartelle dei messaggi. Un nome diverso, o lo stesso nome di un messaggio (anche in bozza), fa saltare la pagina con un avviso. In `canzoni/` un `.md` che comincia con una cifra ma non è `AAAA-MM-GG` è una canzone con il nome sbagliato e ferma la build.
- `ls` della cartella elenca prima le pagine (al massimo quattro, per `order` e poi per nome), una riga vuota, l'archivio; le pagine oltre la quarta vanno dopo l'archivio, separate da un'altra riga vuota.
- Un frontmatter illeggibile, uno che non rispetta lo schema, uno assente o la sintassi Obsidian nel testo non fermano la build: la pagina si mostra senza il blocco del frontmatter, con il nome del file come titolo, e lascia un avviso.
- `README.md`, `CLAUDE.md`, `AGENTS.md` e i nomi che cominciano con un punto sono ignorati; gli altri file sciolti (non `.md`) pure.
- Una cartella con sole pagine esiste lo stesso; `canzone-del-giorno` esiste solo se c'è almeno una canzone.

Le cartelle dichiarate in `site.yaml` (`cartelle`, vedi [site.yaml](#siteyaml)) sono cartelle libere: ogni `.md` al loro interno è una pagina, a ogni profondità, con lo stesso frontmatter e la stessa resa.

- `ls` elenca prima le sottocartelle per nome, poi le pagine per `order` e poi per nome. Le sottocartelle non hanno configurazione né titolo.
- I nomi di file e sottocartelle seguono la regola delle pagine (kebab-case con una lettera all'inizio): un nome diverso fa saltare il file con un avviso. Un file `x.md` accanto a una cartella `x/`: vince la cartella, la pagina si salta con un avviso.
- Un frontmatter sbagliato o la sintassi Obsidian si comportano come nelle cartelle tipizzate: la pagina si mostra con il nome del file come titolo e lascia un avviso.
- Un file che non è `.md` si salta con l'avviso "tipo di file non ancora gestito", finché il motore non gestisce altri tipi.
- Una cartella (dichiarata o sottocartella) esiste solo se contiene almeno una pagina pubblicabile. Una cartella dichiarata assente o senza pagine non compare e lascia un avviso, senza fermare la build.
- Le cartelle non dichiarate nella radice (per esempio `docs/`) non si pubblicano mai.

### site.yaml

```
host: example.com
user: guest
description: "Canzoni, letture e pagine."   # facoltativo
links:
  - name: owlcavelabs      # kebab-case, è il nome da scrivere nel terminale
    title: Owl Cave Labs
    url: https://owlcavelabs.it
cartelle:                  # facoltativo, cartelle libere da pubblicare
  - name: documenti        # kebab-case con una lettera all'inizio
    title: Documenti       # facoltativo
boot:
  rom:
    - text: "MEMORY TEST ....... 65536 BYTES OK"
      pause: 700           # millisecondi dopo la riga
      disk: 1              # facoltativo, numero di scatti della testina
  welcome: "Benvenuto. Scrivi help oppure clicca un nome."
  welcomeTouch: "Benvenuto. Tocca un nome oppure scrivi help."
  welcomeStatic: "Benvenuto. Clicca un nome."   # facoltativo
reception:                 # facoltativo
  stamp: { label: RICEZIONE, value: "{data}" }
  message:
    - { label: OPERATORE, value: guest }
    - { label: DIMENSIONE, value: "{byte} byte" }
    - { label: CONTROLLO, value: "{controllo} OK" }
    - { label: ALLEGATI, value: "{allegati}" }
    - { label: ORA, value: "{ora}" }
    - { label: RISPOSTE, value: chi-sono, link: /chi-sono }
```

`description` è facoltativo: è il testo dell'anteprima social della home (tagliato a 160 caratteri); se manca, è "`<host>`: canzoni, letture e pagine, in forma di terminale.".

`cartelle` è facoltativo: senza, non c'è nessuna cartella libera. In `ls /` le cartelle stanno dopo `messaggi/`, nell'ordine dell'elenco, prima delle pagine; il `title`, facoltativo, compare attenuato accanto al nome. Il nome non può essere `canzoni`, `lettura`, `messaggi`, `canzone-del-giorno`, `bin`, `og`, né ripetersi, né coincidere con il nome di un link: un errore qui, come ogni errore di `site.yaml`, ferma la build.

Le righe `rom` imitano l'output di una ROM e possono essere in inglese. Nel testo si possono usare i segnaposto `{canzone}` (titolo della canzone più recente) e `{data}` (data della canzone più recente). Le righe non vanno a capo e su schermi stretti vengono tagliate: tenerle entro 34 colonne. `welcome` compare a fine boot (le parole help e ls del benvenuto si possono cliccare), `welcomeTouch` al posto suo sui dispositivi touch. `welcomeStatic` è facoltativo: è la riga di benvenuto della home senza JavaScript (dove non si può scrivere, quindi niente "scrivi help"); se manca, la home senza JavaScript non mostra nessuna riga di benvenuto.

`reception` è facoltativo ed è la cornice di ricezione di canzoni e messaggi. `stamp` è il timbro in cima a canzoni e messaggi, `message` sono i campi dei messaggi sotto il timbro. Ogni riga ha `label` e `value` (testo semplice, non vuoti) e, solo nelle righe di `message`, `link` facoltativo, un percorso interno con la barra iniziale (`/chi-sono`): il valore diventa un link, che nel terminale esegue `cat /chi-sono` (o `cd /x && ls` per una cartella). Un link a un percorso che non esiste (anche una pagina saltata per un errore) dà un avviso e la riga si mostra senza link; con `FOSFORO_STRICT=1`, nelle build delle pull request, ferma la build come ogni avviso. Nel valore si usano questi segnaposto:

| Segnaposto | Dove | Valore |
|---|---|---|
| `{data}` | timbro e campi | data della canzone o del messaggio, `GG/MM/AAAA` |
| `{ora}` | campi | ora di `receivedAt` (`HH:MM`), come è scritta, senza conversioni di fuso; manca senza `receivedAt` |
| `{byte}` | campi | byte di `index.md` sul disco, frontmatter e a capo compresi |
| `{controllo}` | campi | CRC-32 degli stessi byte, 8 cifre esadecimali maiuscole |
| `{allegati}` | campi | numero di immagini accanto a `index.md`; manca quando è zero |

Qui `{data}` è la data della canzone o del messaggio, non quella della canzone più recente come in `boot.rom`. Una riga con un segnaposto che manca non compare. Un segnaposto sconosciuto, o fuori posto (`{byte}` nel timbro), ferma la build. Le etichette si allineano con i puntini: il valore comincia alla colonna dell'etichetta più lunga fra `stamp` e `message` più 6 (`OPERATORE ..... guest`), uguale per canzoni e messaggi. Una riga riempita oltre 34 colonne ferma la build, con il percorso del contenuto nell'errore. Senza `reception` o senza `stamp` il timbro è `── 05/01/2026 ──`; senza `message` i messaggi non hanno campi.

## Suono

Il suono parte solo dopo un gesto: l'interruttore; su un link profondo che si apre acceso perché il monitor è già stato acceso oggi, solo il tasto del suono (o il comando `suono`), e fino ad allora spia e tasto si mostrano spenti; sulla 404, o su un link rimasto acceso perché l'indice è arrivato in ritardo, il primo tocco o tasto. Si spegne con il tasto o con il comando `suono`. È in parte sintetizzato (ronzio del trasformatore, tubo che si accende, ventola, risonanza del mobile) e in parte registrato: l'interruttore, i tasti della cornice e il floppy. Le registrazioni stanno in `src/client/sound/registrazioni/` e si scaricano dopo il gesto; i valori scelti sono in `src/client/sound/preset.ts`. I tasti della cornice suonano come si muovono: lo scatto quando scendono (mouse, dito o barra spaziatrice) e il rilascio quando si lasciano; con Invio i due scatti arrivano insieme. Il floppy lavora con `cat` e `ls` e durante il boot: con `cat` e `ls` parte appena si dà il comando, e il risultato compare quando la testina ha finito (al massimo mezzo secondo; subito se il suono è spento).

Il terminale si spegne come un CRT vero: con il comando `shutdown` (stampa `SYSTEM HALTED` e dopo mezzo secondo parte lo spegnimento) o con il pulsante di accensione, che a monitor acceso spegne (anche durante il boot, che si interrompe e non conta come boot del giorno). L'immagine collassa in una riga e poi in un punto che si spegne piano, mentre il suono segue con scatto, crepitio del tubo e ventola che rallenta; poi resta la scritta per riaccendere. Ogni accensione (home, link aperto spento, dopo uno spegnimento, `reboot`) fa crescere un alone dal centro dello schermo prima della prima riga del boot, circa 1,2 s dopo lo scatto. `reboot` usa lo stesso collasso e la stessa accensione. Con `prefers-reduced-motion: reduce` niente collasso né alone: lo schermo passa subito a spento o acceso, il suono resta.

Un link profondo (una canzone, un libro, un post, una pagina) si apre a monitor spento la prima volta del giorno, come la home: il contenuto della pagina resta nel documento, per chi legge senza JavaScript, per i lettori di schermo e per i crawler. Il gesto (interruttore, clic sullo schermo o INVIO, anche su un link della pagina) fa l'accensione della home con l'avvio rapido: suono, alone, la prima riga della ROM, poi senza benvenuto una riga vuota, il comando `cat` dell'indirizzo e il contenuto, con il prompt pronto. Le righe della ROM con `{canzone}` e `{data}` non compaiono. Se il contenuto del terminale non arriva resta quello della pagina statica, sotto la riga della ROM. Dopo uno spegnimento il monitor si comporta come la home. Chi ha già acceso oggi apre i link già accesi.

Il terminale ricorda nel browser (se lo storage c'è; senza, il sito funziona lo stesso) i fosfori scelti, il suono spento, il giorno dell'ultimo boot della home (`fosforo.ultimoBoot`, che decide il boot completo una volta al giorno) e il giorno dell'ultima accensione completata (`fosforo.ultimaAccensione`, scritto da ogni accensione: home, link, `reboot`; decide se un link si apre spento). I giorni sono date locali del visitatore, `YYYY-MM-DD`. Senza storage un link si apre sempre spento.

In sviluppo, `npm run dev` e poi `/_suoni` apre il banco dei suoni: si ascoltano e si regolano le voci, si confrontano con registrazioni di terzi, si salvano le configurazioni in `dev/scelte/`. Il banco non finisce mai nella build. `dev/scarica-suoni.sh` scarica le registrazioni di confronto in `.cache/suoni/`; `dev/ritaglia-suoni.sh` ne taglia i pezzi usati dal sito.

## Test

`npm run check` esegue il controllo dei tipi e i test unitari. `npx playwright test` costruisce il sito, lo serve su una porta sua e lo chiude alla fine (non riusa mai un server già acceso).

I confronti visivi di `tests/e2e/look.spec.ts` girano solo con `PW_VISUAL=1`. Le baseline sono in `tests/e2e/look.spec.ts-snapshots/` (approvate da Giacomo) e dipendono dal sistema: si rigenerano solo dentro il container `mcr.microsoft.com/playwright:v1.64.1-noble`, la stessa immagine della CI, e solo dopo una nuova approvazione dell'aspetto. Se mancano, i test falliscono.

## Licenza e crediti

GPL-3.0, testo completo in `LICENSE`. Il look a fosfori CRT prende come riferimento visivo [cool-retro-term](https://github.com/Swordfish90/cool-retro-term) di Swordfish90 (GPL-3.0); l'idea del sito come terminale è ispirata da remojansen.com. Il font è Fira Mono, distribuito con `@fontsource` (SIL Open Font License).

Le registrazioni in `src/client/sound/registrazioni/` non sono GPL: restano sotto la loro licenza e sono tagliate e ricodificate.

- "Floppy disk drive - read" e "Floppy disk drive - write" di MrAuralization, [freesound.org/s/259292](https://freesound.org/s/259292/) e [freesound.org/s/259291](https://freesound.org/s/259291/), licenza [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- "Old PC startup, idle & shutdown" di nakkivene66 (interruttore di un IBM PC 5150), [freesound.org/s/551405](https://freesound.org/s/551405/), CC0 1.0.
- "Analog TV Switches" di CHallSmith (tasti della cornice), [freesound.org/s/870771](https://freesound.org/s/870771/), CC0 1.0.
