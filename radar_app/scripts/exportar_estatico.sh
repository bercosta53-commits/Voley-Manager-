#!/usr/bin/env bash
# Gera a versão estática (out/) para publicar como prévia (ex.: artifact do claude.ai).
#
# A exportação estática do Next.js não suporta endpoints dinâmicos (app/api/estados, que grava no
# banco do radar) nem faz sentido levar a base real de contas para uma prévia pública. Por isso este
# script tira os dois do caminho antes do build e devolve tudo depois, dando erro ou não.
set -euo pipefail
cd "$(dirname "$0")/.."

api_fora="/tmp/vr-api-fora-$$"
local_fora="/tmp/vr-contas-local-fora-$$.json"
devolver() {
  [ -d "$api_fora" ] && mv "$api_fora" app/api
  [ -f "$local_fora" ] && mv "$local_fora" data/contas.local.json
}
trap devolver EXIT

[ -d app/api ] && mv app/api "$api_fora"
[ -f data/contas.local.json ] && mv data/contas.local.json "$local_fora"

rm -rf out .next
EXPORTAR=1 npx next build

echo
echo "Pronto: radar_app/out/ — só a base fictícia, sem banco e sem os endpoints de gravação."
