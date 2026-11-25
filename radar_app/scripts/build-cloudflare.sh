#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo '[velora-cloudflare] Installing pinned staging dependencies'
npm install --no-save --package-lock=false --include=dev --no-audit --no-fund next@16.4.5 @opennextjs/cloudflare@1.20.18 wrangler@4.166.0 jose@6.2.18
node -e "for (const p of ['@opennextjs/cloudflare','wrangler','jose']) console.log(p,require.resolve(p))"
echo '[velora-cloudflare] Building with OpenNext'
npx --no-install opennextjs-cloudflare build
test -f .open-next/worker.js
echo '[velora-cloudflare] Worker artifact ready'
