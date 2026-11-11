#!/usr/bin/env bash
# Prepara i suoni registrati del sito in src/client/sound/registrazioni/: pezzi tagliati
# dalle registrazioni di .cache/suoni (scaricate da dev/scarica-suoni.sh), messi in fila
# in un file solo e separati da 0,12 s di silenzio. Il client ritrova i pezzi cercando il
# silenzio (src/client/sound/sprite.ts): l'ordine dei pezzi qui è un contratto con
# src/client/sound/preset.ts.
#
# Gli originali a piena qualità (scaricati a mano da Freesound) si mettono in
# $ORIGINALI con lo stesso nome (.wav o .flac) e hanno la precedenza sulle anteprime:
# l'anteprima MP3 ha un ritardo diverso, quindi con un originale i tempi vanno ricontrollati.
set -euo pipefail
export LC_ALL=C # punto decimale, non virgola
cd "$(dirname "$0")/.."
src="${FOSFORO_CACHE:-.cache}/suoni"
orig="${ORIGINALI:-}"
out=src/client/sound/registrazioni
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"

sorgente() { # nome -> file da cui tagliare
  for ext in wav flac; do
    if [[ -n "$orig" && -f "$orig/$1.$ext" ]]; then
      echo "$orig/$1.$ext"
      return
    fi
  done
  if [[ ! -f "$src/$1.webm" ]]; then
    echo "manca $src/$1.webm: lancia prima dev/scarica-suoni.sh" >&2
    exit 1
  fi
  echo "$src/$1.webm"
}

n=0
pezzo() { # nome inizio durata uscita_in_dissolvenza
  local f st in
  f="$tmp/$(printf %03d $n).wav"
  in="$(sorgente "$1")"
  st="$(awk -v d="$3" -v o="$4" 'BEGIN { printf "%.4f", d - o }')"
  ffmpeg -hide_banner -loglevel error -y -ss "$2" -t "$3" -i "$in" -ac 1 -ar 48000 \
    -af "afade=t=in:d=0.001,afade=t=out:st=$st:d=$4,apad=pad_dur=0.12" -c:a pcm_s16le "$f"
  n=$((n + 1))
}

foglio() { # nome del file in uscita: unisce i pezzi fatti finora e ricomincia
  ffmpeg -hide_banner -loglevel error -y -f lavfi -t 0.12 -i anullsrc=r=48000:cl=mono -c:a pcm_s16le "$tmp/zzz-inizio.wav"
  { echo "file '$tmp/zzz-inizio.wav'"; for f in "$tmp"/[0-9]*.wav; do echo "file '$f'"; done; } >"$tmp/lista.txt"
  ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$tmp/lista.txt" -c:a pcm_s16le "$tmp/foglio.wav"
  ffmpeg -hide_banner -loglevel error -y -i "$tmp/foglio.wav" -c:a libopus -b:a 48k -application audio "$out/$1.webm"
  ffmpeg -hide_banner -loglevel error -y -i "$tmp/foglio.wav" -c:a aac -b:a 64k "$out/$1.m4a"
  rm -f "$tmp"/[0-9]*.wav
  n=0
}

# meccanica: interruttore rosso dell'IBM 5150 (acceso, spento), tasto della TV analogica (premuto, rilasciato)
pezzo ibm-5150 3.24 0.15 0.07
pezzo ibm-5150 40.366 0.18 0.08
pezzo tasti-tv-analogica 0.34 0.15 0.05
pezzo tasti-tv-analogica 0.564 0.12 0.05
foglio meccanica

# floppy di MrAuralization: 12 passi, 6 ricerche (dalla più corta alla più lunga), il motore
for t in 1.772 2.699 4.028 5.589 7.383 8.944 10.339 17.875 20.533 23.221 27.438 30.861; do
  pezzo floppy-lettura "$t" 0.08 0.03
done
pezzo floppy-lettura 0.953 0.37 0.01
pezzo floppy-scrittura 1.888 0.39 0.01
pezzo floppy-scrittura 5.473 0.4 0.01
pezzo floppy-scrittura 13.41 0.45 0.01
pezzo floppy-lettura 15.25 0.53 0.01
pezzo floppy-scrittura 3.68 0.78 0.01
pezzo floppy-lettura 31.95 3.2 0.005
foglio floppy

# il client ritrova i pezzi cercando il silenzio: si controlla che li trovi tutti
node --experimental-strip-types --no-warnings dev/conta-pezzi.ts "$out/meccanica" 4 "$out/floppy" 19
ls -l "$out"
