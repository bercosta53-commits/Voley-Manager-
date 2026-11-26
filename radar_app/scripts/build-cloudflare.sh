#!/usr/bin/env bash
# Build do Worker (OpenNext) a partir do lockfile. As versões de next, @opennextjs/cloudflare, wrangler e jose
# estão fixadas no package.json; nada é instalado fora do manifesto.
set -euo pipefail
cd "$(dirname "$0")/.."
echo '[velora-cloudflare] Instalando dependências do lockfile'
npm ci --include=dev --no-audit --no-fund
node -e "for (const p of ['next','@opennextjs/cloudflare','wrangler','jose']) console.log(p, require(p + '/package.json').version)"
echo '[velora-cloudflare] Build com OpenNext'
npx --no-install opennextjs-cloudflare build
test -f .open-next/worker.js
echo '[velora-cloudflare] Artefato do Worker pronto'
