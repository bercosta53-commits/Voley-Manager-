"""Reconciliação da 3.2 canônica com o snapshot real (somente leitura).

  cd radar_app/scripts && python3 -m vscs.reconciliar --snapshot ~/privado/payload.json --hoje 2026-11-26 > ~/privado/reconciliacao.md

Mostra:
  1. a tabela de bases que o snapshot REALMENTE usou (chave/tipo → base, a partir de v2.contribuicoes) contra
     parametros_32.json — é aqui que "preservar os parâmetros registrados no Supabase" é conferido;
  2. o score de cada conta recalculado pela 3.2 canônica contra o gravado, com as maiores divergências.
O snapshot e a saída ficam FORA do repositório (têm nomes de contas reais).
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import date

from . import motor32


def carregar(caminho: str) -> dict:
    with open(caminho, encoding="utf-8") as f:
        d = json.load(f)
    return d.get("payload", d)


def eventos_da_conta(conta: dict, sinais: list[dict]) -> list[dict]:
    return [s for s in sinais if s.get("contaId") == conta["id"] and not s.get("exemplo")] + \
        [h for h in conta.get("historico", []) if not h.get("exemplo")]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--hoje", help="data de referência do recálculo (AAAA-MM-DD); padrão: geradoEm do snapshot")
    a = ap.parse_args()
    base = carregar(a.snapshot)
    hoje = date.fromisoformat(a.hoje or str(base.get("geradoEm", date.today().isoformat()))[:10])
    p = motor32.parametros()
    out = [f"# Reconciliação VSCS 3.2 · snapshot {base.get('scoreVersao', '?')} · referência {hoje.isoformat()}", ""]
    for k in ("scoreParametros", "parametros", "parametrosScore", "vscsParametros"):
        if k in base:
            out += [f"## Parâmetros registrados no snapshot (`{k}`)", "", "```json", json.dumps(base[k], ensure_ascii=False, indent=1)[:6000], "```", ""]

    usadas: dict[str, Counter] = defaultdict(Counter)
    for c in base["contas"]:
        for x in (c.get("v2") or {}).get("contribuicoes") or []:
            usadas[x.get("chave") or x.get("tipo") or "?"][x.get("base")] += 1
    esperado = {**p["bases_30"], **{f"vaga_{k}": v for k, v in p["cargos_receita"].items()},
                **{f"nomeacao_{k}": v for k, v in p["cargos_receita"].items()}}
    out += ["## Bases usadas no snapshot × parametros_32.json", "", "| chave | bases no snapshot (ocorrências) | parâmetro | confere |", "|---|---|---:|---|"]
    for chave, cont in sorted(usadas.items()):
        par = esperado.get(chave)
        bases = ", ".join(f"{b} ({n})" for b, n in cont.most_common())
        ok = "sim" if par is not None and set(cont) == {par} else ("sem parâmetro" if par is None else "NÃO")
        out.append(f"| {chave} | {bases} | {par if par is not None else '—'} | {ok} |")
    out.append("")

    difs = []
    for c in base["contas"]:
        r = motor32.calcular(eventos_da_conta(c, base.get("sinais", [])), hoje, p, c.get("interacoes"))
        difs.append((abs(r["vscs"] - float(c.get("score") or 0)), c.get("nome"), c.get("tier"), float(c.get("score") or 0), r["vscs"]))
    batem = sum(1 for d in difs if d[0] <= 0.05)
    out += [f"## Score recalculado pela 3.2 canônica: {batem} de {len(difs)} contas batem (±0,05)", "",
            "| conta | tier | gravado | 3.2 canônica | diferença |", "|---|---|---:|---:|---:|"]
    for d, nome, tier, g, r in sorted(difs, reverse=True)[:40]:
        if d > 0.05:
            out.append(f"| {nome} | {tier} | {g:.2f} | {r:.2f} | {r - g:+.2f} |")
    print("\n".join(out))


if __name__ == "__main__":
    main()
