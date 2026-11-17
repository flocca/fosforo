# Livelli del volume del suono

Design breve del 2026-11-17. Le scelte di prodotto e tecniche vengono da un consulto con il product-consultant e il tech-consultant; l'approccio l'ha scelto Giacomo ascoltando le varianti sulla pagina di prova `/_volume` (branch `volume-spike`, usa e getta).

## Perché

Il suono del terminale piace com'è, ma il volume è alto: su iPhone in particolare, e chi visita il sito rischia di trovarlo fastidioso dopo un po'. Non è un suono in particolare a dare noia, è il volume complessivo nel tempo. Il browser non conosce il volume del telefono né sa se ci sono le cuffie: si può decidere solo quanto è forte il nostro suono rispetto a quello che il visitatore ascolta di solito.

## Obiettivi

- Il tasto del suono ha tre livelli più spento: alto, medio, basso, spento. Ogni clic scende di un livello: alto, medio, basso, spento, poi di nuovo alto.
- L'icona del tasto mostra il livello: tre onde ad alto, due a medio, una a basso, la croce a spento.
- Chi non ha mai toccato il tasto parte da medio su computer e da basso sugli schermi touch (telefoni e tablet). La scelta salvata del visitatore vince sempre.
- Gli acuti del fondo continuo (fischio della ventola, soffio e fischio del tubo) sono smussati a ogni livello e su ogni dispositivo.

## Non obiettivi

- Misurare il volume con strumenti (LUFS, asprezza): i livelli si scelgono a orecchio, con la regola di stima sotto.
- Un fondo che si abbassa da solo col passare del tempo.
- Un volume diverso per il fondo e per i suoni brevi (approccio B).

## Anti-obiettivi

- Il suono cambia carattere al punto da non riconoscerlo più.
- L'icona o la spia mostrano un livello diverso da quello che si sente, anche solo al primo disegno.
- Un visitatore che aveva spento il suono se lo ritrova acceso.
- Un clic sul tasto che non fa partire l'audio su un link già acceso.

## Regola di stima

Con il telefono al volume di una canzone, a livello basso il fondo si sente solo facendoci caso, e i tasti e il floppy non fanno sobbalzare. Fra un livello e l'altro ci sono circa 9-10 dB, cioè ogni clic dimezza circa il volume percepito. Alto non supera il volume di oggi: è stato scelto a orecchio e non si sa quanto margine resta prima della distorsione.

## Approcci

- **A. Solo il volume generale.** Tre valori del guadagno generale, tutto scala insieme. È il cambio più piccolo.
- **B. Come A, con il fondo che scende di più ai livelli bassi** (scartato): due valori da tarare per livello, e all'ascolto non serviva.
- **C. Come A, con gli acuti del fondo smussati** (scelto da Giacomo dopo l'ascolto): un filtro shelving sul fondo continuo, -8 dB sopra 3,5 kHz, a ogni livello e su ogni dispositivo. Interviene su quello che sul telefono suona tagliente (il fischio della ventola va diretto e salta il passa basso del mobile, `src/client/sound/voices.ts:476-479`), senza toccare tasti e floppy.

## Come (deciso)

- **Valori.** Guadagno generale alto 0,5 (quello di oggi, `src/client/audio.ts:45`), medio circa 0,18 (-9 dB), basso circa 0,063 (-18 dB). Il filtro: highshelf a 3,5 kHz, -8 dB, sulle uscite della sessione (`mech` e `direct` del fondo, `audio.ts:230-240`), quindi su ronzio, tubo e ventola ma non su interruttore, tasti e floppy. I valori sono quelli ascoltati su `/_volume`. Vanno in `src/client/sound/preset.ts` come gli altri suoni; la taratura finale si fa a orecchio sul banco e sull'iPhone.
- **Lo spento resta uno stato a parte**, non un livello a guadagno zero: sospende il contesto, salta i transitori e la testina del floppy (`audio.ts:133`, `:293`, `:484`). I livelli cambiano solo il valore a cui va il guadagno generale.
- **Preferenza.** Stessa chiave `fosforo.suono`, valori `alto|medio|basso|spento`. Se manca vale il livello del dispositivo, calcolato a ogni lettura: così una taratura futura arriva a chi non ha mai toccato il tasto. Il vecchio `spento` resta valido; un valore sconosciuto vale come assente. Si scrive solo quando il visitatore sceglie.
- **Dispositivo.** "Touch" è `(pointer: coarse)`, la definizione che il motore usa già (`src/client/touch.ts:2`).
- **Primo disegno.** Lo script in testa (`src/layouts/Monitor.astro:54-88`) imposta il livello su `<html>` prima del disegno, come fa per i fosfori, così sul telefono l'icona non cambia dopo il caricamento.
- **Link già acceso.** Quando l'audio aspetta il tasto (`soundWaits`, `src/client/main.ts:88-94`), il primo clic fa partire il suono al livello salvato o del dispositivo, senza scendere di un livello e senza salvare.
- **Spia.** Accesa a ogni livello, spenta a spento (scelta mia: è l'icona a mostrare il livello).
- **Comando `suono`.** Senza argomento fa quello che fa il tasto (scende di un livello), così il chip `suono` sul telefono resta a un tocco. Con argomento: `suono alto|medio|basso|spento`; `suono acceso` porta al livello del dispositivo.
- **Banco dei suoni.** L'anteprima "altoparlante telefono" diventa un solo passa alto a 300 Hz (oggi taglia anche sopra 6 kHz e nasconde proprio il fischio della ventola, `dev/board.ts:131-144`). Il banco resta intero e continua a funzionare.

## Testi (bozze da approvare)

- Nome e title del tasto: "Suono alto", "Suono medio", "Suono basso", "Suono spento".
- Risposta del comando: "Suono alto.", "Suono medio.", "Suono basso.", "Suono spento.".
- Aiuto del comando: `regola il suono: alto, medio, basso, spento`.
- Errore per un argomento sbagliato: come oggi, con le quattro scelte cliccabili (`src/client/shell.ts:127`).

## Lasciato a chi costruisce

- La terza onda dell'icona nel riquadro 20x14 (`Monitor.astro:110`): disegno da mostrare a Giacomo prima di rigenerare le baseline (si rigenerano solo dopo la sua approvazione).
- Se il floppy distorce ad alto (guadagno 6 per 0,5 = ×3, dipende dalle registrazioni): se sì, si abbassa `FLOPPY.gain`.
- Come portare il filtro sul banco dei suoni perché si possa ritarare.
- L'aggiornamento dei test e2e che oggi danno per scontati due stati (`tests/e2e/boot.spec.ts`, `crt.spec.ts`, `link-audio.spec.ts`, `phone.spec.ts`) e del contratto della chiave in `CLAUDE.md:36`, `README.md` e `src/client/prefs.ts`.
- Togliere il branch `volume-spike` a lavoro finito.
