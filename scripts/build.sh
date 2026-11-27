#!/bin/sh
# Packs the extension into dist/youtube-live-translate-v<version>.zip
# (the same archive is used for GitHub releases and the Chrome Web Store).
set -e
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
OUT="dist/youtube-live-translate-v$VERSION.zip"
mkdir -p dist
rm -f "$OUT"
zip -qr "$OUT" manifest.json src popup icons/*.png -x '*.DS_Store'
echo "$OUT"
