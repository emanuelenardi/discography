#!/usr/bin/env bash
# Rebuilds public/my-albums/ from the cache (fetching only what is missing), in order:
# artwork from the picks, tracklists and Apple matches, Apple covers where the archive's are
# missing or small, then AVIF/WebP. Run from the project's root: bash local/build-my-collection.sh
set -euo pipefail
export COLLECTION=my-albums APPLE_COUNTRY=it
node local/build-my-collection.mjs
node scripts/fetch-tracks.mjs
node local/apple-covers.mjs
node scripts/optimize-images.mjs
