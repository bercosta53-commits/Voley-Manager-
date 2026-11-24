#!/usr/bin/env bash
set -euo pipefail
# Temporary isolated build for the migration branch. Freeze the generated lockfile before production.
npm install --no-save --package-lock=false --no-audit --no-fund next@16.4.5 @opennextjs/cloudflare@1.20.18 wrangler@4.166.0 jose@6.2.18
npx --no-install opennextjs-cloudflare build
