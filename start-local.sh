#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
node scripts/generate-song-list.mjs
node scripts/preview-server.mjs
