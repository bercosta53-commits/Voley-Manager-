#!/usr/bin/env python3
"""Junta sinais/histórico que são várias notícias cobrindo o MESMO fato, não fatos diferentes.

uso: python3 scripts/remover_duplicatas.py

Vários portais costumam noticiar o mesmo evento (um resultado trimestral, uma aquisição, um prêmio) em
dias seguidos — cada um vira um item em sinais[]/historico[] com url própria (os coletores já dedupam por
url, então isso não é o mesmo link duas vezes: é o mesmo fato, reportado por fontes diferentes). Sem
tratar isso, o score conta cada cobertura como se fosse um fato novo e empilha pontos pelo mesmo evento —
foi o que aconteceu com a Teknisa (5 matérias sobre a mesma aquisição somando até bater o teto de 100).

Critério: mesma conta + mesmo tipo + data dentro de uma janela de 10 dias a partir do primeiro item do
grupo → mesmo fato, mantém só um (o de mais pontos, ou o mais recente no histórico, que não tem pontos).

Exceção: vaga_area_alvo, vaga_lideranca_alvo e vaga_expansao_comercial NUNCA entram nessa junção — várias
vagas abertas ao mesmo tempo na mesma empresa são fatos diferentes entre si (cada vaga é uma posição real
distinta), não a mesma vaga noticiada duas vezes.

Idempotente: pode rodar de novo a qualquer momento depois de qualquer coletor ou do classificador: só
junta o que ainda não foi juntado, não quebra nada rodando em cima de um resultado já limpo.
"""

from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Callable

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "data" / "contas.local.json"
JANELA_DIAS = timedelta(days=10)
VAGA_TIPOS = {"vaga_area_alvo", "vaga_lideranca_alvo", "vaga_expansao_comercial"}


def agrupar_e_escolher_remocoes(itens: list[dict], prioridade: Callable[[dict], object]) -> list[dict]:
    """Agrupa por tipo (menos vaga_*), clusteriza por proximidade de data (janela a partir do primeiro
    item do cluster) e mantém só o item de maior `prioridade` em cada cluster com mais de um item."""
    por_tipo: dict[str, list[dict]] = {}
    for it in itens:
        if it["tipo"] in VAGA_TIPOS:
            continue
        por_tipo.setdefault(it["tipo"], []).append(it)

    remover: list[dict] = []
    for grupo in por_tipo.values():
        grupo.sort(key=lambda x: x["data"])
        cluster = [grupo[0]]
        inicio = date.fromisoformat(grupo[0]["data"])
        for it in grupo[1:]:
            data_it = date.fromisoformat(it["data"])
            if data_it - inicio <= JANELA_DIAS:
                cluster.append(it)
                continue
            if len(cluster) > 1:
                cluster.sort(key=prioridade, reverse=True)
                remover.extend(cluster[1:])
            cluster, inicio = [it], data_it
        if len(cluster) > 1:
            cluster.sort(key=prioridade, reverse=True)
            remover.extend(cluster[1:])
    return remover


def main() -> None:
    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))

    sinais_por_conta: dict[str, list[dict]] = {}
    for s in base.get("sinais", []):
        sinais_por_conta.setdefault(s["contaId"], []).append(s)

    ids_remover: set[str] = set()
    for itens in sinais_por_conta.values():
        ids_remover.update(r["id"] for r in agrupar_e_escolher_remocoes(itens, lambda s: s["pontos"]))
    antes_sinais = len(base["sinais"])
    base["sinais"] = [s for s in base["sinais"] if s["id"] not in ids_remover]

    total_hist_removidos = 0
    for conta in base["contas"]:
        hist = conta.get("historico", [])
        if not hist:
            continue
        urls_remover = {r["url"] for r in agrupar_e_escolher_remocoes(hist, lambda h: h["data"])}
        if urls_remover:
            conta["historico"] = [h for h in hist if h["url"] not in urls_remover]
            total_hist_removidos += len(urls_remover)

    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{antes_sinais - len(base['sinais'])} sinal(is) juntado(s) · {total_hist_removidos} evento(s) de histórico juntado(s)")


if __name__ == "__main__":
    main()
