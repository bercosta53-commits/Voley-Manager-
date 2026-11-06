#!/usr/bin/env python3
"""Junta sinais/histórico que são várias notícias cobrindo o MESMO fato, não fatos diferentes.

uso: python3 scripts/remover_duplicatas.py

Vários portais costumam noticiar o mesmo evento (um resultado trimestral, uma aquisição, um prêmio) em
dias seguidos — cada um vira um item em sinais[]/historico[] com url própria (os coletores já dedupam por
url, então isso não é o mesmo link duas vezes: é o mesmo fato, reportado por fontes diferentes). Sem
tratar isso, o score conta cada cobertura como se fosse um fato novo e empilha pontos pelo mesmo evento —
foi o que aconteceu com a Teknisa (5 matérias sobre a mesma aquisição somando até bater o teto de 100).

Critério: mesma conta (caixa e histórico juntos) + mesmo tipo + data dentro de uma janela de 10 dias a partir do primeiro item do
grupo → mesmo fato, mantém só um (o de mais pontos, ou o mais recente no histórico, que não tem pontos).

Notícia sem fato acionável (noticia_setorial) também não entra: são matérias diferentes que só citam a
empresa, não coberturas de um mesmo fato (e já não pontuam).

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
NAO_JUNTAR = VAGA_TIPOS | {"noticia_setorial"}


def agrupar_e_escolher_remocoes(itens: list[dict], prioridade: Callable[[dict], object]) -> list[dict]:
    """Agrupa por tipo (menos vaga_*), clusteriza por proximidade de data (janela a partir do primeiro
    item do cluster) e mantém só o item de maior `prioridade` em cada cluster com mais de um item."""
    por_tipo: dict[str, list[dict]] = {}
    for it in itens:
        if it["tipo"] in NAO_JUNTAR:
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
            remover.extend(juntar(cluster, prioridade))
            cluster, inicio = [it], data_it
        remover.extend(juntar(cluster, prioridade))
    return remover


def juntar(cluster: list[dict], prioridade: Callable[[dict], object]) -> list[dict]:
    """Fica o item de maior prioridade; os outros viram fontes dele (cada fato aparece uma vez, com a lista
    de veículos que o confirmaram — 05-conectores-fontes.md, seção 1). Devolve os que saem."""
    if len(cluster) < 2:
        return []
    cluster.sort(key=prioridade, reverse=True)
    fica, saem = cluster[0], cluster[1:]
    fontes = fica.get("fontes") or [{"fonte": fica["fonte"], "url": fica["url"], "data": fica["data"]}]
    urls = {f["url"] for f in fontes}
    for it in saem:
        for f in it.get("fontes") or [{"fonte": it["fonte"], "url": it["url"], "data": it["data"]}]:
            if f["url"] not in urls:
                fontes.append(f)
                urls.add(f["url"])
    fica["fontes"] = fontes
    return saem


def main() -> None:
    if not DESTINO.exists():
        sys.exit(f"{DESTINO} não existe — rode scripts/importar_decisores.py primeiro.")
    base = json.loads(DESTINO.read_text(encoding="utf-8"))

    sinais_por_conta: dict[str, list[dict]] = {}
    for s in base.get("sinais", []):
        sinais_por_conta.setdefault(s["contaId"], []).append(s)

    # Sinais (caixa) e histórico da MESMA conta entram juntos: a mesma premiação pode ter uma matéria
    # de hoje na caixa e outra de três dias atrás no histórico. Fica o sinal da caixa (o de mais pontos);
    # entre dois eventos de histórico, o mais recente.
    def prioridade(x: dict) -> tuple:
        return (x["_origem"] == "sinal", x.get("pontos", 0), x["data"])

    ids_remover: set[str] = set()
    total_hist_removidos = 0
    for conta in base["contas"]:
        # marca a origem no próprio objeto (e tira no fim): juntar() grava "fontes" no item que fica
        for s in sinais_por_conta.get(conta["id"], []):
            s["_origem"] = "sinal"
        for h in conta.get("historico", []):
            h["_origem"] = "historico"
        itens = sinais_por_conta.get(conta["id"], []) + conta.get("historico", [])
        remover = agrupar_e_escolher_remocoes(itens, prioridade) if len(itens) > 1 else []
        for it in itens:
            del it["_origem"]
        ids_remover.update(r["id"] for r in remover if "id" in r and r in sinais_por_conta.get(conta["id"], []))
        urls_hist = {r["url"] for r in remover if r not in sinais_por_conta.get(conta["id"], [])}
        if urls_hist:
            conta["historico"] = [h for h in conta["historico"] if h["url"] not in urls_hist]
            total_hist_removidos += len(urls_hist)

    antes_sinais = len(base["sinais"])
    base["sinais"] = [s for s in base["sinais"] if s["id"] not in ids_remover]

    DESTINO.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{antes_sinais - len(base['sinais'])} sinal(is) juntado(s) · {total_hist_removidos} evento(s) de histórico juntado(s)")


if __name__ == "__main__":
    main()
