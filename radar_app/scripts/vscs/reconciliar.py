"""Reconciliação da 3.2 canônica com o snapshot real (somente leitura).

  cd radar_app/scripts && python3 -m vscs.reconciliar --snapshot ~/privado/payload.json --hoje 2026-11-26 > ~/privado/reconciliacao.md

Lê payload.scoreModelo — o registro dos parâmetros EFETIVAMENTE usados — e as revisões individuais em
scoreModelo.revisoesPorSinal. Mostra:
  1. o que o scoreModelo traz, o que difere de parametros_32.json e o que não tem correspondência;
  2. as revisões individuais: quantas, quais campos, chaves desconhecidas e revisões de sinais que não existem;
  3. a tabela de bases que as contribuições gravadas realmente usaram;
  4. o score de cada conta recalculado pela 3.2 canônica (com scoreModelo + revisões) contra o gravado.
O snapshot e a saída ficam FORA do repositório (têm nomes de contas reais).
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import date

from . import motor32
from .adaptador import parametros_do_modelo, revisoes


def carregar(caminho: str) -> dict:
    with open(caminho, encoding="utf-8") as f:
        d = json.load(f)
    return d.get("payload", d)


def eventos_da_conta(conta: dict, sinais: list[dict]) -> list[dict]:
    return [s for s in sinais if s.get("contaId") == conta["id"] and not s.get("exemplo")] + \
        [h for h in conta.get("historico", []) if not h.get("exemplo")]


def modelo_e_revisoes(base: dict, p32: dict) -> tuple[dict, dict, list, list]:
    modelo = base.get("scoreModelo") or {}
    p, difs, sobras = parametros_do_modelo(modelo, p32)
    return p, revisoes(modelo), difs, sobras


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--hoje", help="data de referência do recálculo (AAAA-MM-DD); padrão: geradoEm do snapshot")
    a = ap.parse_args()
    base = carregar(a.snapshot)
    hoje = date.fromisoformat(a.hoje or str(base.get("geradoEm", date.today().isoformat()))[:10])
    p, revs, difs, sobras = modelo_e_revisoes(base, motor32.parametros())
    modelo = base.get("scoreModelo") or {}
    out = [f"# Reconciliação VSCS 3.2 · snapshot {base.get('scoreVersao', '?')} · referência {hoje.isoformat()}", ""]

    out += ["## 1. scoreModelo", ""]
    if not modelo:
        out += ["**payload.scoreModelo não encontrado.** A reconciliação usa só parametros_32.json.", ""]
    else:
        out += [f"Chaves: {', '.join(sorted(modelo))}", "", "Diferenças aplicadas (scoreModelo prevalece sobre parametros_32.json):", ""]
        out += [f"- `{c}`: JSON {j!r} → modelo {m!r}" for c, j, m in difs] or ["- nenhuma"]
        out += ["", "Sem correspondência no motor (ajustar o motor ou o adaptador):", ""]
        out += [f"- `{s}`" for s in sobras] or ["- nenhuma"]
        out.append("")

    ids = {str(s.get("id")) for s in base.get("sinais", [])} | {str(h.get("id")) for c in base["contas"] for h in c.get("historico", []) if h.get("id")}
    campos = Counter(k for r in revs.values() for k in r if not k.startswith("_"))
    desconhecidas = Counter(k for r in revs.values() for k in r.get("_desconhecidas", []))
    orfas = [sid for sid in revs if sid not in ids]
    out += ["## 2. Revisões individuais (scoreModelo.revisoesPorSinal)", "",
            f"{len(revs)} revisões · {len(orfas)} sem sinal correspondente no snapshot", "",
            "Campos reconhecidos: " + (", ".join(f"{k} ({n})" for k, n in campos.most_common()) or "nenhum"), "",
            "Campos desconhecidos (não aplicados): " + (", ".join(f"{k} ({n})" for k, n in desconhecidas.most_common()) or "nenhum"), ""]
    if orfas:
        out += ["Revisões sem sinal: " + ", ".join(orfas[:30]) + (" …" if len(orfas) > 30 else ""), ""]

    usadas: dict[str, Counter] = defaultdict(Counter)
    for c in base["contas"]:
        for x in (c.get("v2") or {}).get("contribuicoes") or []:
            usadas[x.get("chave") or x.get("tipo") or "?"][x.get("base")] += 1
    esperado = {**p["bases_30"], **{f"vaga_{k}": v for k, v in p["cargos_receita"].items()},
                **{f"nomeacao_{k}": v for k, v in p["cargos_receita"].items()}}
    out += ["## 3. Bases usadas nas contribuições gravadas × parâmetros efetivos", "",
            "| chave | bases gravadas (ocorrências) | parâmetro | confere |", "|---|---|---:|---|"]
    for chave, cont in sorted(usadas.items()):
        par = esperado.get(chave)
        bases = ", ".join(f"{b} ({n})" for b, n in cont.most_common())
        ok = "sim" if par is not None and set(cont) == {par} else ("sem parâmetro" if par is None else "NÃO (ver revisões)")
        out.append(f"| {chave} | {bases} | {par if par is not None else '—'} | {ok} |")
    out.append("")

    difs_conta = []
    for c in base["contas"]:
        r = motor32.calcular(eventos_da_conta(c, base.get("sinais", [])), hoje, p, c.get("interacoes"), revs)
        difs_conta.append((abs(r["vscs"] - float(c.get("score") or 0)), c.get("nome"), c.get("tier"), float(c.get("score") or 0), r["vscs"]))
    batem = sum(1 for d in difs_conta if d[0] <= 0.05)
    out += [f"## 4. Score recalculado pela 3.2 canônica: {batem} de {len(difs_conta)} contas batem (±0,05)", "",
            "| conta | tier | gravado | 3.2 canônica | diferença |", "|---|---|---:|---:|---:|"]
    for d, nome, tier, g, r in sorted(difs_conta, reverse=True)[:40]:
        if d > 0.05:
            out.append(f"| {nome} | {tier} | {g:.2f} | {r:.2f} | {r - g:+.2f} |")
    print("\n".join(out))


if __name__ == "__main__":
    main()
