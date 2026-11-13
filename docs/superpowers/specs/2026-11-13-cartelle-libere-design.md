# Cartelle libere dichiarate in site.yaml (fosforo#3)

Design breve del 2026-11-13. Si appoggia alla spec di direzione di flocca.com (`docs/superpowers/specs/2026-11-13-terminale-filesystem-direzione.md`, sezione 1) e al design di fosforo#2 (`2026-11-13-pagine-nelle-cartelle-design.md`), di cui allarga il lettore. Decisioni di prodotto prese da Giacomo dopo un consulto con il product-consultant.

## Perché

Giacomo vuole usare i contenuti come un filesystem: cartelle di documenti e note da condividere, e aggiungere un file non deve essere un problema. La cartella dei contenuti di flocca.com è anche la radice del repo privato (`docs/`, `firebase.json`, in CI il motore in `engine/`), quindi si pubblica solo quello che è dichiarato. Il contenuto scritto a mano passa dalla PR con la preview, mentre i servizi spingono su `main`: un file sbagliato non deve mai fermare la canzone del giorno, ma Giacomo deve vedere i suoi errori prima del merge.

## Obiettivi

- `site.yaml` ha una chiave facoltativa `cartelle`: le cartelle libere di primo livello da pubblicare, ognuna `{ name, title? }`. Senza la chiave non c'è nessuna cartella libera.
- In `ls /` le cartelle libere stanno dopo `messaggi/`, nell'ordine dell'elenco, prima delle pagine (decisione di Giacomo: niente chiave `order`, si può aggiungere più avanti). Il titolo, se c'è, compare attenuato accanto al nome, come per pagine e link.
- Dentro una cartella dichiarata ogni `.md` è una pagina, a ogni profondità. Le sottocartelle non hanno configurazione né titolo. Elenco: prima le sottocartelle per nome, poi i file per `order`, poi per nome. Una cartella (dichiarata o no) esiste se contiene almeno una pagina pubblicabile.
- Nomi di file e sottocartelle nelle cartelle libere: la regola delle pagine, kebab-case con una lettera all'inizio (decisione di Giacomo). Un nome non valido si salta con un avviso.
- Pagine alla radice nella zona libera (decisione di Giacomo): una pagina sbagliata si salta con un avviso, mai mostrata così com'è, così un appunto privato dimenticato alla radice non va online. In collisione con quello che dichiara `site.yaml` (link, cartelle) o con un elemento tipizzato (`canzone-del-giorno`, le cartelle tipizzate) vince quello, la pagina si salta.
- Nelle cartelle (tipizzate e libere) restano le regole di #2: una pagina con frontmatter rotto o sintassi Obsidian si mostra con il nome del file come titolo.
- Un file non markdown in una cartella dichiarata si salta con l'avviso "tipo di file non ancora gestito" (decisione di Giacomo), finché il passo 3 non gestisce gli altri tipi. Nelle cartelle tipizzate resta ignorato come oggi.
- Una cartella dichiarata assente o senza niente da pubblicare non compare e lascia un avviso (Git non tiene le cartelle vuote: togliere l'ultimo file non deve fermare `main`).
- `FOSFORO_STRICT=1`: a fine build, se ci sono avvisi, la build si ferma con l'elenco. Il workflow di flocca.com lo imposta solo sulle pull request.
- La pagina non trovata e il terminale propongono `ls` della cartella esistente più vicina al percorso chiesto (`/documenti/vecchio` -> `ls /documenti`, `/canzoni/2026-11-10/x` -> `ls /canzoni`, altrimenti `ls /`), al posto di `lettura` scritto nel codice.

## Non obiettivi

- Altri tipi di file (testo, immagini, download): passo 3. Viste, anni, file nascosti, peso dell'indice: passo 4. Programmi e `/bin`: passo 5.
- Nomi delle cartelle tipizzate configurabili, ordine delle cartelle tipizzate.
- Le regole di `CLAUDE.md` di flocca.com (flocca.com#9): si aggiornano dopo, partendo da `main` dopo flocca.com#14.

## Anti-obiettivi

- Una cartella privata o un file privato alla radice che va online senza essere dichiarato.
- Un file scritto a mano che lascia in 404 la canzone del giorno.
- Un indirizzo esistente che cambia (il test dei percorsi di #2 resta).

## Approcci

- **Allargare il lettore di #2** (scelto): il motore legge da sé i `.md` della radice, del primo livello di `canzoni/` e `messaggi/`, e delle cartelle dichiarate a ogni profondità; la collezione Astro `pagine` sparisce.
- **Collezione Astro per le cartelle libere** (scartato): stessi difetti visti in #2 (si ferma su un YAML rotto, sceglie lei l'indirizzo).
- **Pagina non trovata che scarica l'indice** (scartato): una richiesta e un ritardo a ogni 404, e senza JavaScript non serve comunque. **Una pagina non trovata per cartella** (scartato): Firebase serve un solo `404.html`.

## Come

- **Schema** (`src/lib/schema.ts`, `siteSchema`): `cartelle` subito dopo `links` (accordo con fosforo-ricezione, che mette `reception` in fondo), array di `{ name, title?: plainText }` strict. `name` segue la regola delle pagine e non può essere `canzoni`, `lettura`, `messaggi`, `canzone-del-giorno`, `bin`, né iniziare con `_`, né essere `og`; niente doppioni, né con i nomi dei link. Errore dello schema: blocca la build, come ogni errore di `site.yaml`.
- **Lettore** (`src/lib/scan.ts`): legge `site.yaml` già validato per sapere quali cartelle scendere; restituisce per ogni file il percorso relativo e il testo (i `.md`) o solo il percorso (gli altri file, per l'avviso). Segue i collegamenti simbolici come oggi, senza girare in tondo. `README.md`, `CLAUDE.md`, `AGENTS.md` e i nomi col punto si ignorano in silenzio a ogni livello.
- **Albero** (`src/lib/store.ts`): le pagine alla radice arrivano dallo stesso lettore; alla radice un esito "mostrato così com'è" diventa "saltata". Le cartelle libere si costruiscono ricorsivamente; un file `x.md` e una cartella `x/` nello stesso posto: vince la cartella, il file si salta con un avviso. La mappa dei percorsi e il controllo dei doppioni restano quelli di #2.
- **Modalità severa** (`src/lib/store.ts`, `buildStore`): dopo aver stampato gli avvisi, con `FOSFORO_STRICT=1` lancia un errore che dice quanti sono e perché la build si ferma.
- **Pagina non trovata** (`src/pages/404.astro`, `src/client/main.ts`): la build scrive nella pagina l'elenco dei percorsi delle cartelle; lo script inline e il terminale (`backFor`) cercano l'antenato più vicino che sia una cartella con la stessa funzione pura in `fs-tree.ts`.
- **flocca.com**: una PR che nel workflow `site.yml` imposta `FOSFORO_STRICT` solo per `pull_request`; non tocca i contenuti e può arrivare prima del motore (il motore di oggi ignora la variabile). Poi, come sempre, la PR che cambia solo `.fosforo-ref`.
- **Documenti**: README (Percorsi, Pagine, la chiave `cartelle` nella sezione site.yaml subito dopo `links`, le due zone e `FOSFORO_STRICT`); `CLAUDE.md` di fosforo: le pagine alla radice escono dai formati concordati.

## Lasciato a chi costruisce

- Le firme e la forma dei moduli; come si evita di girare in tondo con i collegamenti simbolici.
- Il testo degli avvisi e dell'errore della modalità severa, in italiano.
- Se l'elenco delle cartelle nella pagina non trovata è JSON in un attributo o in uno `<script type="application/json">`.
