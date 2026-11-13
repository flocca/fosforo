# Pagine scritte a mano dentro le cartelle (fosforo#2)

Design breve del 2026-11-13. Si appoggia alla spec di direzione di flocca.com, `docs/superpowers/specs/2026-11-13-terminale-filesystem-direzione.md` (sezioni "1. I contenuti come filesystem" e "2. Pagine nelle cartelle"), e ne riprende le decisioni senza riaprirle. Le scelte tecniche vengono da un consulto con il tech-consultant.

## Perché

È il primo passo verso i contenuti come filesystem: dentro `canzoni/` e `messaggi/` ci devono poter stare pagine scritte a mano (subito `canzoni/leggimi` e `messaggi/leggimi`, flocca.com#7) senza toccare i formati concordati con i servizi e senza cambiare nessun indirizzo. Oggi un `.md` in `canzoni/` viene letto come canzone e blocca la build, uno sciolto in `messaggi/` viene ignorato.

## Obiettivi

- `canzoni/`: un file con il nome a data (`AAAA-MM-GG.md`) è una canzone, ogni altro `.md` è una pagina. `messaggi/`: ogni `.md` sciolto è una pagina (i messaggi sono sottocartelle).
- Una pagina in una cartella ha lo stesso formato e la stessa resa delle pagine alla radice (frontmatter `title`, `order` facoltativo; titolo, riga vuota, testo; niente riga con la data). Ha pagina HTML, gemello JSON e anteprima social come ogni nodo; l'anteprima è il primo paragrafo.
- Nomi delle pagine nelle cartelle in kebab-case con una lettera all'inizio (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`): non si confondono con date, cartelle dei messaggi e anni.
- `ls <cartella>`: prima le pagine (al massimo quattro, per `order` poi per nome), una riga vuota, l'archivio; se le pagine sono più di quattro, una riga vuota e le altre dopo l'archivio.
- Una cartella esiste se ha elementi o pagine (`canzoni/` con il solo `leggimi` esiste; `canzone-del-giorno` solo se ci sono canzoni).
- Due zone. Contratto: canzoni, libri, messaggi, `site.yaml` e, per ora, le pagine alla radice; un errore blocca la build come oggi. Libera: le pagine nelle cartelle; un errore non blocca mai la build e lascia un avviso.

## Non obiettivi

- `lettura/` (i suoi `.md` sono note dei libri), cartelle libere in `site.yaml`, markdown a ogni profondità, avvisi che diventano errori nelle PR, link "torna indietro" della 404: sono fosforo#3.
- Altri tipi di file, viste (anni, file nascosti), programmi.
- Nessun cambio a `src/lib/schema.ts`: `pageSchema` vale anche per le pagine nelle cartelle.

## Anti-obiettivi

- Un indirizzo esistente che cambia o sparisce.
- Una pagina scritta a mano che lascia in 404 la canzone del giorno.
- Un file che nessun gestore prende e che sparisce in silenzio.

## Approcci

- **Collezione Astro con schema permissivo** (scartato): Astro si ferma su un frontmatter YAML rotto prima che il motore possa decidere, e sceglie lui l'id (nome del file trasformato, chiave `slug` del frontmatter), quindi una pagina potrebbe scegliersi l'indirizzo.
- **Loader Astro su misura** (scartato): darebbe il ricaricamento automatico in sviluppo, ma passa dal data store di Astro e si testa solo dentro Astro.
- **Il motore legge i file da sé** (scelto): un lettore con `node:fs` restituisce `{ percorso, testo }`, una funzione pura li interpreta con `yaml` e `pageSchema.safeParse`, e tutto entra in `buildStoreFrom`. Regge la zona libera, si testa senza Astro, serve com'è a fosforo#3 e agli altri tipi di file.

Pagine alla radice (decisione di Giacomo): restano nella collezione severa `pagine` fino a fosforo#3, perché la radice di flocca.com è anche il repo privato e oggi un `.md` dimenticato lì blocca la build invece di pubblicarsi. Le due fonti producono lo stesso elemento `page`. In fosforo#3 si decide se alla radice una pagina sbagliata si salta o si mostra.

## Come

- **Chi prende cosa**: un solo modulo tiene, per ogni gestore tipizzato, il glob della collezione Astro e il predicato equivalente (canzone: `canzoni/` più nome a data; messaggio: `messaggi/<cartella>/index.md`, la cartella intera è sua, bozze comprese). Il glob delle canzoni diventa `canzoni/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md`. In build un controllo confronta i file che il lettore attribuisce ai gestori con gli id delle collezioni: se non coincidono la build si ferma (così un file non preso da nessuno non sparisce).
- **Mappa dei percorsi**: `store.nodes`, percorso -> nodo, costruita insieme all'albero. Gli elementi tipizzati entrano per primi; una pagina che collide con uno di loro (per esempio `messaggi/x.md` accanto alla cartella `messaggi/x/`, anche se è una bozza) si salta con un avviso; ogni altro doppione blocca la build. Il browser continua a scendere per nomi, l'indice JSON non cambia forma tranne il campo qui sotto.
- **Elenco**: l'ordine lo decide la build (`children` già ordinati). I nodi fuori dal blocco principale hanno `section: 'head' | 'tail'` (le pagine prima e dopo l'archivio); `listing` stampa una riga vuota dove la sezione cambia. La regola delle quattro pagine resta fuori dal codice del browser.
- **Esiti di una pagina sbagliata**: nome non valido o collisione: si salta. YAML rotto, schema non rispettato, sintassi Obsidian: si mostra il testo senza il blocco del frontmatter, con il nome del file come titolo. `README.md`, `CLAUDE.md`, `AGENTS.md` si ignorano in silenzio in ogni cartella. File non `.md` sciolti in `canzoni/` e `messaggi/`: ignorati come oggi.
- **Avvisi**: `store.warnings` (`{ file, message }`), riempito dal codice puro, stampato una volta in `buildStore` con il prefisso `fosforo: avviso:`; sotto GitHub Actions anche come `::warning file=...::`, così compaiono sulla PR. fosforo#3 aggiunge lì la modalità che li trasforma in errori.
- **Test dei percorsi**: un primo commit salva l'elenco dei percorsi dei nodi di `example-content` costruito dal codice di oggi (`tests/e2e/percorsi.txt`); un test e2e lo confronta con `/_fs/index.json`, e le pagine nuove si aggiungono all'elenco in modo esplicito. Una volta sola: build di flocca.com con il motore prima e dopo, confronto dell'elenco dei file di `dist/` e `diff -r dist/_fs` (devono coincidere, lì non ci sono ancora pagine nelle cartelle); il risultato va nella PR.
- **Contenuti d'esempio**: `example-content/canzoni/leggimi.md` e `example-content/messaggi/leggimi.md`, testi d'esempio brevi.
- **Dipendenze**: `yaml` passa da `devDependencies` a `dependencies` (è già nel lockfile e Astro usa la stessa libreria).
- **Documenti**: README (Percorsi, Pagine, le due zone accanto a "Formati dei contenuti"); in `CLAUDE.md` di fosforo la regola "un errore di schema blocca la build" vale per i formati concordati, le pagine nelle cartelle danno avvisi.

## Lasciato a chi costruisce

- La forma esatta del lettore e dei moduli (nomi dei file, firme).
- Il testo degli avvisi, in italiano, con il percorso del file.
- In sviluppo le pagine si rileggono a ogni richiesta, senza ricaricamento automatico del browser.
