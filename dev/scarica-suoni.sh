#!/usr/bin/env bash
# Scarica le registrazioni CC0 / CC BY per il banco dei suoni in .cache/suoni/ (fuori da git)
# e le ricodifica mono in Opus/WebM e AAC. Solo ascolto in sviluppo, non vanno in produzione.
# Da Freesound senza account si prende l'anteprima MP3; BigSoundBank va scaricato a mano.
# Richiede curl, unzip, ffmpeg. I file scaricati sono dati: non si esegue niente.
set -euo pipefail
out="${FOSFORO_CACHE:-.cache}/suoni"
raw="$(mktemp -d)"
trap 'rm -rf "$raw"' EXIT
mkdir -p "$out"

conv() { # sorgente nome
  ffmpeg -hide_banner -loglevel error -y -i "$1" -ac 1 -c:a libopus -b:a 64k "$out/$2.webm"
  ffmpeg -hide_banner -loglevel error -y -i "$1" -ac 1 -c:a aac -b:a 96k "$out/$2.m4a"
}

while read -r url name; do
  curl -fsSL -o "$raw/$name.mp3" "$url"
  conv "$raw/$name.mp3" "$name"
done <<'LIST'
https://cdn.freesound.org/previews/784/784207_4709749-hq.mp3 tv-sharp-linytron
https://cdn.freesound.org/previews/65/65400_514787-hq.mp3 crt-pal-accensione
https://cdn.freesound.org/previews/565/565193_9123155-hq.mp3 crt-scintille
https://cdn.freesound.org/previews/30/30950_215874-hq.mp3 tv-bn-ronzio
https://cdn.freesound.org/previews/426/426151_136085-hq.mp3 pc-dodici-dischi
https://cdn.freesound.org/previews/353/353240_4723780-hq.mp3 dell-l600r
https://cdn.freesound.org/previews/259/259292_2843367-hq.mp3 floppy-lettura
https://cdn.freesound.org/previews/259/259291_2843367-hq.mp3 floppy-scrittura
LIST

curl -fsSL -o "$raw/amiga.zip" https://opengameart.org/sites/default/files/amiga_600_floppy_sounds.zip
unzip -q -o "$raw/amiga.zip" '*.ogg' -d "$raw/amiga"
for i in 1 2 3 4 5 6; do conv "$raw/amiga/floppy_access$i.ogg" "amiga-accesso-$i"; done
conv "$raw/amiga/floppy_insert.ogg" amiga-inserisci
conv "$raw/amiga/floppy_eject.ogg" amiga-espelli
echo "registrazioni in $out"
